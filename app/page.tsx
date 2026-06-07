"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type Format = "landscape" | "portrait";

const DIMS = {
  landscape: { w: 1920, h: 1080 },
  portrait:  { w: 1080, h: 1350 },
};

// Oval slot for partner logo (relative coords 0–1)
// Measured from actual pixel borders of the oval in the background images
const OVAL = {
  landscape: { cx: 0.735, cy: 0.500, rx: 0.225, ry: 0.210 },
  portrait:  { cx: 0.500, cy: 0.710, rx: 0.330, ry: 0.110 },
};

interface Transform { x: number; y: number; scale: number; angle: number }

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

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = DIMS[format];
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);

    const bgImg = format === "landscape" ? bgImgL : bgImgP;
    if (bgImg) ctx.drawImage(bgImg, 0, 0, w, h);
    else { ctx.fillStyle = "#2d0a1e"; ctx.fillRect(0, 0, w, h); }

    if (logo) {
      const ov = OVAL[format];
      const cx = ov.cx * w;
      const cy = ov.cy * h;
      const rx = ov.rx * w;
      const ry = ov.ry * h;

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();

      const fitScale = Math.min((rx * 2 * 0.85) / logo.width, (ry * 2 * 0.85) / logo.height);
      const s = fitScale * xform.scale;
      // x/y are in % of oval radius so sliders feel consistent across formats
      const ox = xform.x * rx;
      const oy = xform.y * ry;

      ctx.translate(cx + ox, cy + oy);
      ctx.rotate(xform.angle);
      ctx.drawImage(logo, -logo.width * s / 2, -logo.height * s / 2, logo.width * s, logo.height * s);
      ctx.restore();
    }
  }, [format, logo, bgImgL, bgImgP, xform]);

  useEffect(() => { draw(); }, [draw]);

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

  const angleDeg = Math.round((xform.angle * 180) / Math.PI);
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

      {/* Canvas preview */}
      <div
        className="w-full max-w-3xl mb-8 rounded-xl overflow-hidden shadow-2xl border border-white/10"
        style={{ aspectRatio: `${w}/${h}` }}
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>

      {/* Controls */}
      <div className="w-full max-w-md flex flex-col gap-5">

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

        {/* Sliders — only shown when logo is loaded */}
        {logo && (
          <>
            <Slider
              label={`Size: ${Math.round(xform.scale * 100)}%`}
              value={xform.scale} min={0.1} max={4} step={0.01}
              onChange={(v) => setXform(t => ({ ...t, scale: v }))}
            />
            <Slider
              label={`Position X: ${Math.round(xform.x * 100)}%`}
              value={xform.x} min={-2} max={2} step={0.01}
              onChange={(v) => setXform(t => ({ ...t, x: v }))}
            />
            <Slider
              label={`Position Y: ${Math.round(xform.y * 100)}%`}
              value={xform.y} min={-2} max={2} step={0.01}
              onChange={(v) => setXform(t => ({ ...t, y: v }))}
            />
            <Slider
              label={`Rotation: ${angleDeg}°`}
              value={angleDeg} min={-180} max={180} step={1}
              onChange={(v) => setXform(t => ({ ...t, angle: (v * Math.PI) / 180 }))}
            />
          </>
        )}

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
