"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type Format = "landscape" | "portrait";

const DIMS = {
  landscape: { w: 1920, h: 1080 },
  portrait:  { w: 1080, h: 1350 },
};

// Oval slot for partner logo (relative coords 0–1)
const OVAL = {
  landscape: { cx: 0.745, cy: 0.5,   rx: 0.165, ry: 0.265 },
  portrait:  { cx: 0.5,   cy: 0.735, rx: 0.32,  ry: 0.185 },
};

interface Transform { x: number; y: number; scale: number; angle: number }

export default function Home() {
  const [format, setFormat]     = useState<Format>("landscape");
  const [logo, setLogo]         = useState<HTMLImageElement | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [bgImgL, setBgImgL]     = useState<HTMLImageElement | null>(null);
  const [bgImgP, setBgImgP]     = useState<HTMLImageElement | null>(null);

  // Logo transform: offsets relative to oval centre (in canvas px), scale, rotation (rad)
  const [xform, setXform] = useState<Transform>({ x: 0, y: 0, scale: 1, angle: 0 });

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Interaction state (refs → no re-render needed mid-gesture)
  const drag = useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 });
  const pinch = useRef<{ active: boolean; lastDist: number; lastAngle: number }>({ active: false, lastDist: 0, lastAngle: 0 });

  useEffect(() => {
    const load = (src: string, set: (img: HTMLImageElement) => void) => {
      const img = new Image();
      img.onload = () => set(img);
      img.src = src;
    };
    load("/bg-landscape.png", setBgImgL);
    load("/bg-portrait.png",  setBgImgP);
  }, []);

  // Reset transform when logo or format changes
  useEffect(() => { setXform({ x: 0, y: 0, scale: 1, angle: 0 }); }, [logo, format]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = DIMS[format];
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);

    const bgImg = format === "landscape" ? bgImgL : bgImgP;
    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, w, h);
    } else {
      ctx.fillStyle = "#2d0a1e";
      ctx.fillRect(0, 0, w, h);
    }

    if (logo) {
      const ov  = OVAL[format];
      const cx  = ov.cx * w;
      const cy  = ov.cy * h;
      const rx  = ov.rx * w;
      const ry  = ov.ry * h;

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();

      // Fit logo to oval initially, then apply user transform
      const fitScale = Math.min((rx * 2 * 0.85) / logo.width, (ry * 2 * 0.85) / logo.height);
      const s = fitScale * xform.scale;

      ctx.translate(cx + xform.x, cy + xform.y);
      ctx.rotate(xform.angle);
      ctx.drawImage(logo, -logo.width * s / 2, -logo.height * s / 2, logo.width * s, logo.height * s);
      ctx.restore();
    }
  }, [format, logo, bgImgL, bgImgP, xform]);

  useEffect(() => { draw(); }, [draw]);

  // ── Canvas → canvas-space coordinate helper ──────────────────────────────
  const canvasPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  // ── Mouse events ──────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (!logo) return;
    drag.current = { active: true, lastX: e.clientX, lastY: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current.active || !logo) return;
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    const dx = (e.clientX - drag.current.lastX) * sx;
    const dy = (e.clientY - drag.current.lastY) * sy;
    drag.current.lastX = e.clientX;
    drag.current.lastY = e.clientY;
    setXform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
  };
  const onMouseUp = () => { drag.current.active = false; };

  // ── Scroll to scale ───────────────────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    if (!logo) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.05 : 0.95;
    setXform(t => ({ ...t, scale: Math.max(0.1, Math.min(10, t.scale * factor)) }));
  };

  // ── Touch events ──────────────────────────────────────────────────────────
  const getTouchDist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const getTouchAngle = (t: React.TouchList) =>
    Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!logo) return;
    if (e.touches.length === 1) {
      drag.current = { active: true, lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      drag.current.active = false;
      pinch.current = { active: true, lastDist: getTouchDist(e.touches), lastAngle: getTouchAngle(e.touches) };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!logo) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;

    if (e.touches.length === 1 && drag.current.active) {
      const dx = (e.touches[0].clientX - drag.current.lastX) * sx;
      const dy = (e.touches[0].clientY - drag.current.lastY) * sy;
      drag.current.lastX = e.touches[0].clientX;
      drag.current.lastY = e.touches[0].clientY;
      setXform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
    } else if (e.touches.length === 2 && pinch.current.active) {
      const dist  = getTouchDist(e.touches);
      const angle = getTouchAngle(e.touches);
      const scaleFactor = dist / pinch.current.lastDist;
      const dAngle      = angle - pinch.current.lastAngle;
      pinch.current.lastDist  = dist;
      pinch.current.lastAngle = angle;
      setXform(t => ({
        ...t,
        scale: Math.max(0.1, Math.min(10, t.scale * scaleFactor)),
        angle: t.angle + dAngle,
      }));
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) { drag.current.active = false; pinch.current.active = false; }
    if (e.touches.length === 1) {
      pinch.current.active = false;
      drag.current = { active: true, lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
    }
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
    const a = document.createElement("a");
    a.download = `community-partner-${format}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const { w, h } = DIMS[format];

  return (
    <main className="min-h-screen bg-[#1a0612] text-white flex flex-col items-center py-10 px-4">
      <h1 className="text-3xl font-bold mb-1 tracking-wide text-center">Community Partner Card Generator</h1>
      <p className="text-white/40 mb-8 text-sm">TUM Blockchain Conference 26 + Hackathon</p>

      {/* Format toggle */}
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

      {/* Hint */}
      {logo && (
        <p className="text-white/40 text-xs mb-3">
          Drag to move · Scroll / pinch to zoom · Two-finger twist to rotate
        </p>
      )}

      {/* Canvas preview */}
      <div
        ref={wrapperRef}
        className="w-full max-w-3xl mb-8 rounded-xl overflow-hidden shadow-2xl border border-white/10"
        style={{ aspectRatio: `${w}/${h}`, cursor: logo ? "grab" : "default" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", userSelect: "none" }} />
      </div>

      {/* Controls */}
      <div className="w-full max-w-md flex flex-col gap-5">
        {/* Rotation slider */}
        {logo && (
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Rotation: {Math.round((xform.angle * 180) / Math.PI)}°
            </label>
            <input
              type="range" min="-180" max="180" step="1"
              value={Math.round((xform.angle * 180) / Math.PI)}
              onChange={(e) => setXform(t => ({ ...t, angle: (Number(e.target.value) * Math.PI) / 180 }))}
              className="w-full accent-purple-500"
            />
          </div>
        )}

        {/* Upload */}
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

        {/* Remove BG toggle */}
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
