import { useState, useEffect, useCallback } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  src: string;
  alt: string;
  isOpen: boolean;
  onClose: () => void;
}

const ImageLightbox = ({ src, alt, isOpen, onClose }: ImageLightboxProps) => {
  const [scale, setScale] = useState(1);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.5, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.5, 1));
  }, []);

  const handleClose = useCallback(() => {
    setScale(1);
    onClose();
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "+" || e.key === "=") handleZoomIn();
      if (e.key === "-") handleZoomOut();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleClose, handleZoomIn, handleZoomOut]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      onClick={handleClose}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
        aria-label="Fechar"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Zoom controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-black/50 rounded-full px-4 py-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleZoomOut();
          }}
          disabled={scale <= 1}
          className={cn(
            "p-1.5 rounded-full transition-colors",
            scale <= 1
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-white/20"
          )}
          aria-label="Diminuir zoom"
        >
          <ZoomOut className="w-5 h-5 text-white" />
        </button>
        <span className="text-white text-sm font-medium min-w-[3rem] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleZoomIn();
          }}
          disabled={scale >= 3}
          className={cn(
            "p-1.5 rounded-full transition-colors",
            scale >= 3
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-white/20"
          )}
          aria-label="Aumentar zoom"
        >
          <ZoomIn className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Image container */}
      <div
        className="relative max-w-[90vw] max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="transition-transform duration-200 ease-out cursor-grab active:cursor-grabbing"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
          draggable={false}
        />
      </div>
    </div>
  );
};

export default ImageLightbox;
