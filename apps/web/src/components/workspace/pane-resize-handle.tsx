import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

const KEYBOARD_STEP = 16;

type PaneResizeHandleProps = {
  /** Accessible name of the separator, e.g. "Resize sidebar". */
  label: string;
  width: number;
  defaultWidth: number;
  min: number;
  /** Upper bound; a function is read at drag time so it can follow the
   * window (the column to the right keeps a usable minimum). */
  max: number | (() => number);
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  /** Lets the column drop its width transition while it follows the pointer. */
  onResizingChange?: (resizing: boolean) => void;
};

/**
 * The draggable right edge of a column. It sits over the column's own border
 * line and highlights on hover; dragging moves the edge, double-click restores
 * the default width, and as a focusable separator the arrow keys (Home/End)
 * resize it without a pointer.
 */
export function PaneResizeHandle({
  label,
  width,
  defaultWidth,
  min,
  max,
  onResize,
  onResizeEnd,
  onResizingChange,
}: PaneResizeHandleProps) {
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ detach: () => void } | null>(null);
  const latestRef = useRef(width);
  latestRef.current = width;

  const upperBound = () =>
    Math.max(min, typeof max === "function" ? max() : max);
  const clamp = (value: number) =>
    Math.round(Math.min(upperBound(), Math.max(min, value)));
  const setDragging = (next: boolean) => {
    setResizing(next);
    onResizingChange?.(next);
    // The pointer leaves the thin handle mid-drag; keep the resize cursor and
    // stop text selection page-wide until it is released.
    document.body.style.cursor = next ? "col-resize" : "";
    document.body.style.userSelect = next ? "none" : "";
  };

  // The drag follows the pointer through window listeners rather than
  // pointer capture: capture can be dropped without a matching release
  // (focus loss, a release outside the window), which would leave the edge
  // glued to the cursor. Any move with no button held also ends the drag.
  const endDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    drag.detach();
    setDragging(false);
    onResizeEnd(latestRef.current);
  };
  const endDragRef = useRef(endDrag);
  endDragRef.current = endDrag;
  const resizeRef = useRef(onResize);
  resizeRef.current = onResize;
  const clampRef = useRef(clamp);
  clampRef.current = clamp;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    endDragRef.current();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.buttons === 0) {
        endDragRef.current();
        return;
      }
      const next = clampRef.current(startWidth + moveEvent.clientX - startX);
      latestRef.current = next;
      resizeRef.current(next);
    };
    const end = () => endDragRef.current();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    dragRef.current = {
      detach: () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        window.removeEventListener("blur", end);
      },
    };
    setDragging(true);
  };
  // Unmounting mid-drag (the layout collapses under the pointer) must not
  // leave window listeners or the page-wide cursor behind.
  useEffect(() => () => endDragRef.current(), []);

  const commit = (next: number) => {
    const value = clamp(next);
    onResize(value);
    onResizeEnd(value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEYBOARD_STEP * 4 : KEYBOARD_STEP;
    const next =
      event.key === "ArrowLeft"
        ? width - step
        : event.key === "ArrowRight"
          ? width + step
          : event.key === "Home"
            ? min
            : event.key === "End"
              ? upperBound()
              : null;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable, value-bearing splitter is role="separator"; <hr> cannot take focus or pointer drags
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={typeof max === "number" ? max : undefined}
      aria-valuemin={min}
      aria-valuenow={width}
      className={cn(
        "group/resize absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize touch-none select-none outline-none",
        "after:absolute after:inset-y-0 after:right-0 after:w-0.5 after:bg-transparent motion-safe:after:transition-colors motion-safe:after:duration-150",
        "hover:after:bg-brand-400/70 focus-visible:after:bg-brand-500",
        resizing && "after:bg-brand-500",
      )}
      data-resizing={resizing || undefined}
      role="separator"
      tabIndex={0}
      title={label}
      onDoubleClick={() => commit(defaultWidth)}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    />
  );
}
