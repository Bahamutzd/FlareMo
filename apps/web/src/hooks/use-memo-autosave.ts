import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Memo, MemoVisibility } from "@/api";
import { createMemo, updateMemo } from "@/api";
import { useI18n } from "@/i18n";
import { getMemoResourceId } from "@/lib/memo";
import { optimisticallyPatchMemo } from "@/lib/memo-cache";

const AUTOSAVE_DEBOUNCE_MS = 1500;

export type MemoAutosaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** A new, not yet stored memo: its first save creates it. */
export type MemoAutosaveDraft = {
  visibility: MemoVisibility;
  onCreated: (memo: Memo) => void;
};

/**
 * Always-on editing for the reading pane: every change lands in a debounced
 * PATCH, a pending change flushes when the pane unmounts (switching memo,
 * Back) and rides a keepalive request when the tab closes. Saves are silent —
 * the list is patched in place and the pane shows a small status instead of
 * a toast per keystroke burst.
 *
 * Without a memo (`draft` given) the first non-empty save creates it, and
 * every later save updates the created memo.
 */
export function useMemoAutosave(
  memo: Memo | undefined,
  draft?: MemoAutosaveDraft,
) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const createdIdRef = useRef<string | undefined>(undefined);
  const idRef = useRef<string | undefined>(undefined);
  idRef.current = memo ? getMemoResourceId(memo) : createdIdRef.current;
  const [state, setState] = useState<MemoAutosaveState>("idle");
  const savedRef = useRef(memo?.content ?? "");
  const latestRef = useRef(memo?.content ?? "");
  const visibility: MemoVisibility =
    memo?.visibility ?? draft?.visibility ?? "private";
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasSavedRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const schedule = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(
      () => flushRef.current(),
      AUTOSAVE_DEBOUNCE_MS,
    );
  }, [clearTimer]);

  flushRef.current = () => {
    clearTimer();
    const content = latestRef.current;
    if (content === savedRef.current) {
      // TipTap normalizes the markdown on mount; a round trip back to the
      // stored body is no edit, so an untouched memo shows no status.
      setState((current) =>
        current === "dirty"
          ? hasSavedRef.current
            ? "saved"
            : "idle"
          : current,
      );
      return;
    }
    // An emptied body is not a valid memo; it stays unsaved until it has
    // text again.
    if (!content.trim()) return;
    // One request at a time, so an older body can never land after a newer
    // one; whatever was typed meanwhile goes out when this one settles.
    if (inFlightRef.current) return;
    setState("saving");
    const targetId = idRef.current;
    let request: Promise<unknown>;
    if (targetId) {
      optimisticallyPatchMemo(queryClient, targetId, { content });
      request = updateMemo(targetId, {
        content,
        visibility: visibilityRef.current,
      });
    } else {
      request = createMemo({
        content,
        visibility: visibilityRef.current,
        source: "web",
      }).then((created) => {
        createdIdRef.current = getMemoResourceId(created);
        idRef.current = createdIdRef.current;
        draftRef.current?.onCreated(created);
      });
    }
    inFlightRef.current = request
      .then(() => {
        savedRef.current = content;
        hasSavedRef.current = true;
        setState(latestRef.current === content ? "saved" : "dirty");
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ["memos"] }),
          queryClient.invalidateQueries({ queryKey: ["memo-stats"] }),
          queryClient.invalidateQueries({ queryKey: ["tag-hierarchy"] }),
          queryClient.invalidateQueries({
            queryKey: ["memo-context", idRef.current],
          }),
        ]);
      })
      .catch(() => {
        setState("error");
        toast.error(t("memo.autosaveFailed"));
      })
      .finally(() => {
        inFlightRef.current = null;
        if (latestRef.current !== savedRef.current) schedule();
      });
  };

  const change = useCallback(
    (content: string) => {
      latestRef.current = content;
      setState("dirty");
      schedule();
    },
    [schedule],
  );

  const flush = useCallback(() => flushRef.current(), []);

  /**
   * Hand the memo to another write (a visibility change): drop the pending
   * debounce and wait out the request in flight, so neither can land after
   * that write and revert it. Resolves with the body to write.
   */
  const settle = useCallback(async () => {
    clearTimer();
    await inFlightRef.current;
    return latestRef.current;
  }, [clearTimer]);

  /** The stored memo's id, once a new memo has been created. */
  const resolveId = useCallback(() => idRef.current, []);

  /** Drop the pending change, e.g. a draft thrown away before its first save. */
  const discard = useCallback(() => {
    clearTimer();
    latestRef.current = savedRef.current;
    setState(hasSavedRef.current ? "saved" : "idle");
  }, [clearTimer]);

  /** Record a body another write already persisted. */
  const markSaved = useCallback((content: string) => {
    savedRef.current = content;
    hasSavedRef.current = true;
    if (latestRef.current === content) setState("saved");
  }, []);

  useEffect(() => {
    const keepaliveFlush = () => {
      const content = latestRef.current;
      if (content === savedRef.current || !content.trim()) return;
      const targetId = idRef.current;
      // A create already on its way would be duplicated by a second POST.
      if (!targetId && inFlightRef.current) return;
      void fetch(
        targetId
          ? `/api/app/memos/${encodeURIComponent(targetId)}`
          : "/api/app/memos",
        {
          body: JSON.stringify({ content, visibility: visibilityRef.current }),
          headers: { "content-type": "application/json" },
          keepalive: true,
          method: targetId ? "PATCH" : "POST",
        },
      );
    };
    window.addEventListener("beforeunload", keepaliveFlush);
    return () => {
      window.removeEventListener("beforeunload", keepaliveFlush);
      flushRef.current();
    };
  }, []);

  return { change, discard, flush, markSaved, resolveId, settle, state };
}
