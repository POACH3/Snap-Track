import { ImageOff, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./ImageViewer.module.css";
import { FIT, bounded, zoomAt, type View } from "./zoom.ts";

interface ImageViewerProps {
  /** The photos' addresses, top of the receipt first. */
  sources: readonly string[];
  /** Zoom out, zoom in and Fit buttons, for a mouse (desktop). Phones pinch instead. */
  controls?: boolean;
  className?: string;
}

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SCALE = 2.5;
const BUTTON_STEP = 1.5;

interface Pinch {
  distance: number;
  midX: number;
  midY: number;
  view: View;
}

/**
 * A receipt's photos in order, in one strip that zooms and pans as a piece (SPEC.md §6.5).
 * Pinch or Ctrl/⌘ + wheel to zoom, drag or wheel to move, double-tap to zoom in or back to fit.
 * Written by hand on pointer events (decided 2026-11-15; a library only if this falls short).
 */
export function ImageViewer({ sources, controls = false, className }: ImageViewerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(FIT);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  const pinch = useRef<Pinch | null>(null);
  const lastTap = useRef(0);

  const sizes = useCallback(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (frame === null || content === null) return undefined;
    return {
      frame: { width: frame.clientWidth, height: frame.clientHeight },
      // Unscaled size: the transform doesn't change offset sizes.
      content: { width: content.offsetWidth, height: content.offsetHeight },
    };
  }, []);

  const apply = useCallback(
    (next: View) => {
      const measured = sizes();
      setView(measured === undefined ? next : bounded(next, measured.content, measured.frame));
    },
    [sizes],
  );

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = frameRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  // Wheel: Ctrl/⌘ (and trackpad pinch, which browsers report with Ctrl) zooms; otherwise it moves
  // the strip. Added by hand because React's wheel listener is passive and can't stop the page.
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = local(event);
      setView((current) => {
        const measured = sizes();
        const next =
          event.ctrlKey || event.metaKey
            ? zoomAt(current, current.scale * Math.exp(-event.deltaY * 0.01), point.x, point.y)
            : { ...current, x: current.x - event.deltaX, y: current.y - event.deltaY };
        return measured === undefined ? next : bounded(next, measured.content, measured.frame);
      });
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      frame.removeEventListener("wheel", onWheel);
    };
  }, [sizes]);

  // A new frame size (rotation, the photo card resizing) re-fits the strip.
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setView((current) => {
        const measured = sizes();
        return measured === undefined ? current : bounded(current, measured.content, measured.frame);
      });
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  }, [sizes]);

  function startPinch() {
    const [a, b] = [...pointers.current.values()];
    if (a === undefined || b === undefined) return;
    pinch.current = {
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      view,
    };
    drag.current = null;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2) {
      startPinch();
      return;
    }
    drag.current = { ...point, view };
    const now = Date.now();
    if (event.pointerType !== "mouse" && now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      apply(view.scale > 1 ? FIT : zoomAt(view, DOUBLE_TAP_SCALE, point.x, point.y));
      drag.current = null;
      return;
    }
    lastTap.current = now;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    const start = pinch.current;
    if (start !== null && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      if (a === undefined || b === undefined) return;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const scale = start.view.scale * (Math.hypot(b.x - a.x, b.y - a.y) / start.distance);
      const zoomed = zoomAt(start.view, scale, start.midX, start.midY);
      apply({ ...zoomed, x: zoomed.x + midX - start.midX, y: zoomed.y + midY - start.midY });
      return;
    }
    const from = drag.current;
    if (from !== null)
      apply({ ...from.view, x: from.view.x + point.x - from.x, y: from.view.y + point.y - from.y });
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const [remaining] = [...pointers.current.values()];
    drag.current = remaining === undefined ? null : { ...remaining, view };
  }

  function zoomBy(factor: number) {
    const measured = sizes();
    const cx = (measured?.frame.width ?? 0) / 2;
    const cy = (measured?.frame.height ?? 0) / 2;
    apply(zoomAt(view, view.scale * factor, cx, cy));
  }

  return (
    <div className={[styles.viewer, className].filter(Boolean).join(" ")}>
      <div
        ref={frameRef}
        className={styles.frame}
        role="group"
        aria-label="Receipt photos. Pinch or use the zoom buttons to zoom; drag to move."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div
          ref={contentRef}
          className={styles.content}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          {sources.map((src, index) => (
            <Photo key={src} src={src} label={`Photo ${index + 1} of ${sources.length}`} />
          ))}
        </div>
      </div>
      {controls && (
        <div role="toolbar" aria-label="Zoom" className={styles.toolbar}>
          <button
            type="button"
            className={styles.tool}
            aria-label="Zoom out"
            onClick={() => {
              zoomBy(1 / BUTTON_STEP);
            }}
          >
            <ZoomOut size={18} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.tool}
            aria-label="Zoom in"
            onClick={() => {
              zoomBy(BUTTON_STEP);
            }}
          >
            <ZoomIn size={18} aria-hidden />
          </button>
          <button
            type="button"
            className={`${styles.tool} ${styles.fit}`}
            onClick={() => {
              apply(FIT);
            }}
          >
            Fit
          </button>
        </div>
      )}
    </div>
  );
}

/** One photo; a plain tile when it can't be shown (deleted under the retention rules, or offline). */
function Photo({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={styles.missing} role="img" aria-label={`${label}: image not available`}>
        <ImageOff size={20} aria-hidden />
        <span>Image not available</span>
      </div>
    );
  }
  return (
    <img
      className={styles.photo}
      src={src}
      alt={label}
      draggable={false}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}
