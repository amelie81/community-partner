"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type Format = "landscape" | "portrait";

const DIMS = {
  landscape: { w: 1920, h: 1080 },
  portrait:  { w: 1080, h: 1350 },
};

// Oval for partner logo slot (relative coords 0-1)
const OVAL = {
  landscape: { cx: 0.745, cy: 0.5,   rx: 0.165, ry: 0.265 },
  portrait:  { cx: 0.5,   cy: 0.735, rx: 0.32,  ry: 0.185 },
};

export default function Home() {
  const [format, setFormat] = useState<Format>("landscape");
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [bgImgL, setBgImgL] = useState<HTMLImageElement | null>(null);
  const [bgImgP, setBgImgP] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = (src: string, set: (img: HTMLImageElement) => void) => {
      const img = new Image();
      img.onload = () => set(img);
      img.src = src;
    };
    load("/bg-landscape.png", setBgImgL);
    load("/bg-portrait.png", setBgImgP);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = DIMS[format];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);

    const bgImg = format === "landscape" ? bgImgL : bgImgP;
    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, w, h);
    } else {
      ctx.fillStyle = "#2d0a1e";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 4;
      // Draw placeholder oval so user sees where logo goes
      const ov = OVAL[format];
      ctx.beginPath();
      ctx.ellipse(ov.cx * w, ov.cy * h, ov.rx * w, ov.ry * h, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = `${w * 0.02}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("bg-landscape.png / bg-portrait.png", w / 2, h / 2);
      ctx.fillText("in /public ablegen", w / 2, h / 2 + w * 0.025);
    }

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

      const maxW = rx * 2 * 0.8;
      const maxH = ry * 2 * 0.8;
      const scale = Math.min(maxW / logo.width, maxH / logo.height);
      const lw = logo.width * scale;
      const lh = logo.height * scale;
      ctx.drawImage(logo, cx - lw / 2, cy - lh / 2, lw, lh);
      ctx.restore();
    }
  }, [format, logo, bgImgL, bgImgP]);

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
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => setLogo(img);
      img.src = url;
    } catch {
      alert("Hintergrundentfernung fehlgeschlagen. Ist REMOVE_BG_API_KEY gesetzt?");
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
      <h1 className="text-3xl font-bold mb-1 tracking-wide text-center">Community Partner Card</h1>
      <p className="text-white/40 mb-8 text-sm">TUM Blockchain Conference 26 + Hackathon</p>

      {/* Format toggle */}
      <div className="flex gap-3 mb-8">
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
            {f === "landscape" ? "⬛ Querformat (16:9)" : "▯ Hochformat (4:5)"}
          </button>
        ))}
      </div>

      {/* Preview */}
      <div
        className="w-full max-w-3xl mb-8 rounded-xl overflow-hidden shadow-2xl border border-white/10"
        style={{ aspectRatio: `${w}/${h}` }}
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>

      {/* Controls */}
      <div className="w-full max-w-md flex flex-col gap-5">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">Partner-Logo hochladen</label>
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
            {removing
              ? "⏳ Hintergrund wird entfernt…"
              : logoFile
              ? `✓ ${logoFile.name}`
              : "Datei auswählen"}
          </button>
        </div>

        {/* Remove BG toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <button
            role="switch"
            aria-checked={removeBg}
            onClick={() => handleToggleRemoveBg(!removeBg)}
            className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
              removeBg ? "bg-purple-500" : "bg-white/20"
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                removeBg ? "left-6" : "left-1"
              }`}
            />
          </button>
          <span className="text-sm text-white/80">Logo-Hintergrund entfernen (remove.bg)</span>
        </label>

        <button
          onClick={handleDownload}
          className="w-full py-3 rounded-xl bg-white text-black font-bold hover:bg-white/90 transition-all"
        >
          Als PNG herunterladen
        </button>
      </div>
    </main>
  );
}
