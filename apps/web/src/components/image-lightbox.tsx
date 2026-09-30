import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  DownloadIcon,
  RotateCcwIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

const MIN_SCALE = 1;
const MAX_SCALE = 8;
/** One wheel notch / zoom-button step. */
const SCALE_STEP = 0.25;

type ImageLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src?: string;
  alt?: string;
  downloadUrl?: string;
  filename?: string;
};

/**
 * Full-surface image preview. The image opens fitted to the viewport width
 * and centered, so a wide photo fills a phone screen and a tall screenshot
 * stays fully readable by scrolling instead of being shrunk into an 85vh
 * box. Wheel zoom (ctrl-free, plain wheel scales like a viewer) or a
 * two-finger pinch grows it beyond the viewport and the overflow pans;
 * Reset returns to the fit view.
 */
export function ImageLightbox({
  open,
  onOpenChange,
  src,
  alt,
  downloadUrl,
  filename,
}: ImageLightboxProps) {
  const { t } = useI18n();
  const [scale, setScale] = useState(MIN_SCALE);
  // Set once the img loads; lets the viewport give the scrollable content the
  // intrinsic height before the bytes arrive (no scrollbar jump mid-load).
  const [intrinsic, setIntrinsic] = useState<{ w: number; h: number } | null>(
    null,
  );
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setScale(MIN_SCALE);
      setIntrinsic(null);
    }
  }, [open]);

  const zoomTo = useCallback((next: number) => {
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)));
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.deltaY) return;
    event.preventDefault();
    setScale((current) => {
      const next =
        current * (event.deltaY < 0 ? 1 + SCALE_STEP : 1 / (1 + SCALE_STEP));
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    });
  }, []);

  // Two-finger pinch: the scale follows the ratio of the finger distance to
  // the distance when the second finger landed. One finger keeps native
  // scrolling (the viewport allows panning only, not browser pinch-zoom).
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const touchDistance = (touches: React.TouchList) => {
    const [a, b] = [touches[0], touches[1]];
    if (!a || !b) return 0;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    pinchRef.current = { distance: touchDistance(event.touches), scale };
  };
  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2 || !pinch.distance) return;
    zoomTo((pinch.scale * touchDistance(event.touches)) / pinch.distance);
  };
  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinchRef.current = null;
  };

  if (!src) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md transition-opacity duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className="fixed inset-0 z-50 flex flex-col px-2 py-3 outline-none select-none sm:p-4"
          initialFocus={viewportRef}
        >
          {/* Top action bar */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="truncate max-w-[50vw] text-xs font-mono text-white/70">
              {filename ?? alt ?? ""}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t("imageViewer.zoomOut")}
                title={t("imageViewer.zoomOut")}
                disabled={scale <= MIN_SCALE}
                className="size-8 text-white/90 hover:bg-white/20 hover:text-white"
                onClick={() => zoomTo(scale - SCALE_STEP)}
              >
                <ZoomOutIcon className="size-4" />
              </Button>
              <span className="min-w-10 text-center font-mono text-xs text-white/70">
                {Math.round(scale * 100)}%
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t("imageViewer.zoomIn")}
                title={t("imageViewer.zoomIn")}
                disabled={scale >= MAX_SCALE}
                className="size-8 text-white/90 hover:bg-white/20 hover:text-white"
                onClick={() => zoomTo(scale + SCALE_STEP)}
              >
                <ZoomInIcon className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t("imageViewer.reset")}
                title={t("imageViewer.reset")}
                disabled={scale === MIN_SCALE}
                className="size-8 text-white/90 hover:bg-white/20 hover:text-white"
                onClick={() => zoomTo(MIN_SCALE)}
              >
                <RotateCcwIcon className="size-4" />
              </Button>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={filename}
                  aria-label={t("common.download")}
                  title={t("common.download")}
                  className="inline-flex size-8 items-center justify-center rounded-lg bg-white/10 text-white/90 hover:bg-white/20 transition-colors"
                >
                  <DownloadIcon className="size-4" />
                </a>
              )}
              <DialogPrimitive.Close
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("common.close")}
                    title={t("common.close")}
                    className="size-8 text-white/90 hover:bg-white/20 hover:text-white"
                  >
                    <XIcon className="size-4" />
                  </Button>
                }
              />
            </div>
          </div>

          {/* Scrollable viewport: fit-width by default (scale 1), so a wide
              image fills a phone screen and a tall screenshot scrolls;
              wheel, buttons or a two-finger pinch scale it and the overflow
              pans with native scroll. `m-auto` centers the image while it
              fits and falls back to the start edge once it overflows, so
              the top of a zoomed image stays reachable. */}
          <div
            className="mt-2 flex flex-1 overflow-auto outline-none [touch-action:pan-x_pan-y]"
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
            onTouchStart={handleTouchStart}
            onWheel={handleWheel}
            ref={viewportRef}
          >
            <img
              src={src}
              alt={alt ?? filename ?? ""}
              className="m-auto block shrink-0 rounded-lg shadow-2xl"
              decoding="async"
              draggable={false}
              onLoad={(event) => {
                const img = event.currentTarget;
                if (img.naturalWidth) {
                  setIntrinsic({ w: img.naturalWidth, h: img.naturalHeight });
                }
              }}
              style={{
                // Fit view: the viewport width, but never beyond the image's
                // own pixels, so a small image is not blown up and blurred.
                // Zoom multiplies that base; the browser keeps the intrinsic
                // ratio. Hidden until loaded so it never flashes at an
                // unscaled size.
                width: intrinsic
                  ? `min(${scale * 100}%, ${scale * intrinsic.w}px)`
                  : "100%",
                maxWidth: "none",
                visibility: intrinsic ? "visible" : "hidden",
              }}
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
