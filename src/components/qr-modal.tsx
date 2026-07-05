import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import QRCode from "qrcode";

export function QrModal({ value, label, onClose }: { value: string; label?: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, { width: 260, margin: 1, color: { dark: "#1a1714", light: "#f4efe6" } });
  }, [value]);

  return (
    <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="relative bg-card border border-border rounded-3xl p-6 max-w-[320px] w-full" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 h-9 w-9 rounded-full bg-accent flex items-center justify-center" aria-label="Cerrar">
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground text-center">Escanéame</div>
        <div className="mt-4 flex justify-center">
          <canvas ref={canvasRef} className="rounded-2xl" />
        </div>
        {label && <div className="mt-4 font-display text-2xl tracking-[0.05em] text-center">{label}</div>}
      </div>
    </div>
  );
}
