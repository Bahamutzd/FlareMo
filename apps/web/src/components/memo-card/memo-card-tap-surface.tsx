import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Targets that keep their own click instead of activating the surface. */
const OWN_CLICK_TARGETS =
  "a, button, input, label, img, audio, video, [role='button']";

type MemoCardTapSurfaceProps = {
  children: ReactNode;
  /** False when a tap should do nothing (e.g. a trashed memo in the editor
   * pane, or a memo the viewer cannot manage). */
  enabled: boolean;
  /** "text" for a tap that edits in place, "pointer" for one that opens. */
  cursor: "text" | "pointer";
  onActivate: () => void;
};

/**
 * Wraps a memo's read face so a click (or tap) on the text activates it: the
 * timeline card opens the memo, the reading pane opens the editor. Links,
 * to-do boxes, tags, images and media keep their own click, and finishing a
 * text selection does not count as a click. Keyboard users reach the same
 * actions through the ⋯ menu and the list rows, so the wrapper stays a plain
 * container.
 */
export function MemoCardTapSurface({
  children,
  cursor,
  enabled,
  onActivate,
}: MemoCardTapSurfaceProps) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer shortcut; the ⋯ menu and list rows are the accessible paths
    // biome-ignore lint/a11y/useKeyWithClickEvents: same as above
    <div
      className={cn(
        "flex flex-col gap-2",
        enabled && (cursor === "text" ? "cursor-text" : "cursor-pointer"),
      )}
      onClick={(event) => {
        if (!enabled) return;
        const target = event.target as HTMLElement;
        if (target.closest(OWN_CLICK_TARGETS)) return;
        if (window.getSelection()?.isCollapsed === false) return;
        onActivate();
      }}
    >
      {children}
    </div>
  );
}
