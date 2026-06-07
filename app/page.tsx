"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type Format = "landscape" | "portrait";

const DIMS = {
  landscape: { w: 1920, h: 1080 },
  portrait:  { w: 1080, h: 1350 },
};

const OVAL = {
  landscape: { cx: 0.768, cy: 0.500, rx: 0.193, ry: 0.140 },
  portrait:  { cx: 0.500, cy: 0.710, rx: 0.330, ry: 0.110 },
};

interface Transform { x: number; y: number; scale: number; angle: number }

type InteractMode = "idle" | "moving" | "resizing";

const HANDLE_RADIUS = 18; // canvas px hit radius for corner handles

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/70 mb-2">{label}</label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-purple-500"
      />
    </div>
  );
}

export default function Home() {
  const [format, setFormat]     = useState<Format>("landscape");
  const [logo, setLogo]         = useState<HTMLImageElement | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [bgImgL, setBgImgL]     = useState<HTMLImageElement | null>(null);
  const [bgImgP, setBgImgP]     = useState<HTMLImageElement | null>(null);
  const [xform, setXform]       = useState<Transform>({ x: 0, y: 0, scale: 1, angle: 0 });
  const [cursor, setCursor]     = useState("default");

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xformRef     = useRef(xform);
  const logoRef      = useRef(logo);
  const formatRef    = useRef(format);

  // Keep refs in sync so interaction handlers always see current values
  useEffect(() => { xformRef.current = xform; }, [xform]);
  useEffect(() => { logoRef.current = logo; }, [logo]);
  useEffect(() => { formatRef.current = format; }, [format]);

  const interact = useRef<{
    mode: InteractMode;
    lastCanvas: { x: number; y: number };
    startXform: Transform;
    startDist: number;  // distance from logo center at resize start
  }>({ mode: "idle", lastCanvas: { x: 0, y: 0 }, startXform: xform, startDist: 0 });

  useEffect(() => {
    const load = (src: string, set: (img: HTMLImageElement) => void) => {
      const img = new Image();
      img.onload = () => set(img);
      img.src = src;
    };
    load("/bg-landscape.png", setBgImgL);
    load("/bg-portrait.png",  setBgImgP);
  }, []);

  useEffect(() => { setXform({ x: 0, y: 0, scale: 1, angle: 0 }); }, [logo, format]);

  // ── Geometry helpers ──────────────────────────────────────────────────────
  const getLogoGeom = useCallback((t: Transform, fmt: Format, img: HTMLImageElement) => {
    const { w, h } = DIMS[fmt];
    const ov = OVAL[fmt];
    const cx = ov.cx * w;
    const cy = ov.cy * h;
    const rx = ov.rx * w;
    const ry = ov.ry * h;
    const fitScale = Math.min((rx * 2 * 0.85) / img.width, (ry * 2 * 0.85) / img.height);
    const s  = fitScale * t.scale;
    const ox = t.x * rx;
    const oy = t.y * ry;
    const lx = cx + ox;   // logo centre x
    const ly = cy + oy;   // logo centre y
    const hw = (img.width  * s) / 2;
    const hh = (img.height * s) / 2;
    const cos = Math.cos(t.angle);
    const sin = Math.sin(t.angle);
    const rotate = (px: number, py: number) => ({
      x: lx + px * cos - py * sin,
      y: ly + px * sin + py * cos,
    });
    // Four corners: TL, TR, BR, BL
    const corners = [
      rotate(-hw, -hh),
      rotate( hw, -hh),
      rotate( hw,  hh),
      rotate(-hw,  hh),
    ];
    return { cx, cy, rx, ry, lx, ly, hw, hh, corners, s, ox, oy };
  }, []);

  const toCanvas = (e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left)  * (canvas.width  / rect.width),
      y: (e.clientY - rect.top)   * (canvas.height / rect.height),
    };
  };

  const nearestCornerIndex = (pt: { x: number; y: number }, geom: ReturnType<typeof getLogoGeom>) => {
    let best = -1, bestDist = Infinity;
    geom.corners.forEach((c, i) => {
      const d = Math.hypot(pt.x - c.x, pt.y - c.y);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return bestDist < HANDLE_RADIUS ? best : -1;
  };

  const insideLogo = (pt: { x: number; y: number }, geom: ReturnType<typeof getLogoGeom>) => {
    // Rotate point into logo's local space, check against half-extents
    const dx = pt.x - geom.lx;
    const dy = pt.y - geom.ly;
    const cos = Math.cos(-xformRef.current.angle);
    const sin = Math.sin(-xformRef.current.angle);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) <= geom.hw && Math.abs(ly) <= geom.hh;
  };

  // ── Draw ─────────────────────────────────────────────────────────────────
  const draw = useCallback((t: Transform) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fmt = formatRef.current;
    const img = logoRef.current;
    const { w, h } = DIMS[fmt];
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);

    const bgImg = fmt === "landscape" ? bgImgL : bgImgP;
    if (bgImg) ctx.drawImage(bgImg, 0, 0, w, h);
    else { ctx.fillStyle = "#2d0a1e"; ctx.fillRect(0, 0, w, h); }

    if (!img) return;

    const geom = getLogoGeom(t, fmt, img);

    // Clip + draw logo
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(geom.cx, geom.cy, geom.rx, geom.ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(geom.lx, geom.ly);
    ctx.rotate(t.angle);
    ctx.drawImage(img, -geom.hw, -geom.hh, geom.hw * 2, geom.hh * 2);
    ctx.restore();

    // Corner handles (drawn outside clip so always visible)
    geom.corners.forEach((c, i) => {
      const CURSORS = ["nw-resize", "ne-resize", "se-resize", "sw-resize"];
      void CURSORS[i];
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.fillStyle   = "rgba(255,255,255,0.15)";
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, HANDLE_RADIUS * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }, [bgImgL, bgImgP, getLogoGeom]);

  useEffect(() => { draw(xform); }, [draw, xform, format, logo]);

  // ── Mouse interaction ────────────────────────────────────────────────────
  const onMouseMove = (e: React.MouseEvent) => {
    if (!logoRef.current) return;
    const pt   = toCanvas(e);
    const t    = xformRef.current;
    const geom = getLogoGeom(t, formatRef.current, logoRef.current);
    const { w, h } = DIMS[formatRef.current];
    const ov   = OVAL[formatRef.current];
    const rx   = ov.rx * w;
    const ry   = ov.ry * h;

    if (interact.current.mode === "moving") {
      const dx = (pt.x - interact.current.lastCanvas.x) / rx;
      const dy = (pt.y - interact.current.lastCanvas.y) / ry;
      interact.current.lastCanvas = pt;
      setXform(prev => {
        const next = { ...prev, x: prev.x + dx, y: prev.y + dy };
        xformRef.current = next;
        draw(next);
        return next;
      });
      return;
    }

    if (interact.current.mode === "resizing") {
      // Scale = initial_scale * (current dist / start dist)
      const { lx, ly } = getLogoGeom(interact.current.startXform, formatRef.current, logoRef.current);
      const curDist = Math.hypot(pt.x - lx, pt.y - ly);
      const newScale = Math.max(0.05, interact.current.startXform.scale * (curDist / interact.current.startDist));
      setXform(prev => {
        const next = { ...prev, scale: newScale };
        xformRef.current = next;
        draw(next);
        return next;
      });
      return;
    }

    // Hover: update cursor
    const cornerIdx = nearestCornerIndex(pt, geom);
    const CORNER_CURSORS = ["nw-resize", "ne-resize", "se-resize", "sw-resize"];
    if (cornerIdx >= 0) {
      setCursor(CORNER_CURSORS[cornerIdx]);
    } else if (insideLogo(pt, geom)) {
      setCursor("grab");
    } else {
      setCursor("default");
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!logoRef.current) return;
    const pt   = toCanvas(e);
    const t    = xformRef.current;
    const geom = getLogoGeom(t, formatRef.current, logoRef.current);

    const cornerIdx = nearestCornerIndex(pt, geom);
    if (cornerIdx >= 0) {
      const startDist = Math.hypot(pt.x - geom.lx, pt.y - geom.ly);
      interact.current = { mode: "resizing", lastCanvas: pt, startXform: { ...t }, startDist };
      setCursor("se-resize");
    } else if (insideLogo(pt, geom)) {
      interact.current = { mode: "moving", lastCanvas: pt, startXform: { ...t }, startDist: 0 };
      setCursor("grabbing");
    }
  };

  const onMouseUp = () => {
    interact.current.mode = "idle";
    setCursor(logoRef.current ? "grab" : "default");
  };

  // ── File handling ─────────────────────────────────────────────────────────
  const loadLogoFromFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setLogo(img);
    img.src = url;
  };

  const applyRemoveBg = async (file: File) => {
    setRemoving(true);
    try {
      const form = new FormData();
      form.append("image_file", file);
      const res = await fetch("/api/remove-bg", { method: "POST", body: form });
      if (!res.ok) throw new Error("failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const img  = new Image();
      img.onload = () => setLogo(img);
      img.src = url;
    } catch {
      alert("Background removal failed. Is REMOVE_BG_API_KEY set?");
      loadLogoFromFile(file);
    } finally {
      setRemoving(false);
    }
  };

  const handleFile = async (file: File) => {
    setLogoFile(file);
    if (removeBg) await applyRemoveBg(file);
    else loadLogoFromFile(file);
  };

  const handleToggleRemoveBg = async (checked: boolean) => {
    setRemoveBg(checked);
    if (logoFile) {
      if (checked) await applyRemoveBg(logoFile);
      else loadLogoFromFile(logoFile);
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Re-draw without handles for clean export
    const fmt = formatRef.current;
    const img = logoRef.current;
    const { w, h } = DIMS[fmt];
    const offscreen = document.createElement("canvas");
    offscreen.width = w; offscreen.height = h;
    const ctx = offscreen.getContext("2d")!;
    const bgImg = fmt === "landscape" ? bgImgL : bgImgP;
    if (bgImg) ctx.drawImage(bgImg, 0, 0, w, h);
    if (img) {
      const geom = getLogoGeom(xform, fmt, img);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(geom.cx, geom.cy, geom.rx, geom.ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(geom.lx, geom.ly);
      ctx.rotate(xform.angle);
      ctx.drawImage(img, -geom.hw, -geom.hh, geom.hw * 2, geom.hh * 2);
      ctx.restore();
    }
    const a = document.createElement("a");
    a.download = `community-partner-${fmt}.png`;
    a.href = offscreen.toDataURL("image/png");
    a.click();
  };

  const angleDeg = Math.round((xform.angle * 180) / Math.PI);
  const { w, h } = DIMS[format];

  return (
    <main className="min-h-screen bg-[#1a0612] text-white flex flex-col items-center py-10 px-4">
      <h1 className="text-3xl font-bold mb-1 tracking-wide text-center">Community Partner Card Generator</h1>
      <p className="text-white/40 mb-8 text-sm">TUM Blockchain Conference 26 + Hackathon</p>

      <div className="flex gap-3 mb-6">
        {(["landscape", "portrait"] as Format[]).map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className={`px-6 py-2 rounded-full font-semibold border transition-all text-sm ${
              format === f
                ? "bg-white text-black border-white"
                : "bg-transparent text-white/60 border-white/30 hover:border-white/60"
            }`}
          >
            {f === "landscape" ? "⬛ Landscape (16:9)" : "▯ Portrait (4:5)"}
          </button>
        ))}
      </div>

      <div
        className="w-full max-w-3xl mb-6 rounded-xl overflow-hidden shadow-2xl border border-white/10"
        style={{ aspectRatio: `${w}/${h}`, cursor }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", userSelect: "none" }} />
      </div>

      {logo && (
        <p className="text-white/30 text-xs mb-5">
          Drag logo to move · Drag corner circles to resize
        </p>
      )}

      <div className="w-full max-w-md flex flex-col gap-5">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">Upload Partner Logo</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={removing}
            className="w-full py-3 rounded-xl border border-dashed border-white/40 hover:border-white/80 transition-all text-white/70 hover:text-white text-sm"
          >
            {removing ? "⏳ Removing background…" : logoFile ? `✓ ${logoFile.name}` : "Choose file"}
          </button>
        </div>

        {logo && (
          <Slider
            label={`Rotation: ${angleDeg}°`}
            value={angleDeg} min={-180} max={180} step={1}
            onChange={(v) => setXform(t => ({ ...t, angle: (v * Math.PI) / 180 }))}
          />
        )}

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <button
            role="switch"
            aria-checked={removeBg}
            onClick={() => handleToggleRemoveBg(!removeBg)}
            className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${removeBg ? "bg-purple-500" : "bg-white/20"}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${removeBg ? "left-6" : "left-1"}`} />
          </button>
          <span className="text-sm text-white/80">Remove logo background (remove.bg)</span>
        </label>

        <button
          onClick={handleDownload}
          className="w-full py-3 rounded-xl bg-white text-black font-bold hover:bg-white/90 transition-all"
        >
          Download as PNG
        </button>
      </div>
    </main>
  );
}
