import { ImageIcon, Loader2Icon, PinIcon } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import type { Memo } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { formatMemoTime, memoListPreview } from "@/lib/memo";
import { cn } from "@/lib/utils";

type MemoIndexListProps = {
  memos: Memo[];
  selectedMemoName: string | undefined;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  hasError: boolean;
  isPaginationError: boolean;
  isRetrying: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onSelect: (memo: Memo) => void;
};

/**
 * The three-pane workspace's middle column: one compact row per memo (title,
 * excerpt, date). Selection is owned by the caller so it can live in the URL.
 */
export const MemoIndexList = memo(function MemoIndexList({
  memos,
  selectedMemoName,
  hasNextPage,
  isFetchingNextPage,
  hasError,
  isPaginationError,
  isRetrying,
  onLoadMore,
  onRetry,
  onSelect,
}: MemoIndexListProps) {
  const { locale, t } = useI18n();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || hasError) return;
    const element = sentinelRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, hasError, onLoadMore]);

  const retryNotice = hasError ? (
    <Alert className="m-3 flex w-auto items-center justify-between gap-3">
      <AlertDescription>
        {t(isPaginationError ? "list.loadMoreError" : "list.refreshError")}
      </AlertDescription>
      <Button
        disabled={isRetrying}
        size="sm"
        variant="outline"
        onClick={onRetry}
      >
        {isRetrying && (
          <Loader2Icon
            className="motion-safe:animate-spin"
            data-icon="inline-start"
          />
        )}
        {t("common.retry")}
      </Button>
    </Alert>
  ) : null;

  return (
    <nav aria-label={t("list.indexLabel")} className="flex flex-col">
      {!isPaginationError && retryNotice}
      <ul className="flex flex-col">
        {memos.map((item) => {
          const preview = memoListPreview(item.content);
          const selected = item.name === selectedMemoName;
          return (
            <li key={item.name}>
              <button
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col gap-1 border-b border-border/50 px-4 py-3 text-left motion-safe:transition-colors motion-safe:duration-150",
                  selected ? "bg-accent" : "hover:bg-muted/60",
                )}
                // Same hook the j/k shortcuts scroll to; the row precedes the
                // reading pane in the DOM, so the list row wins the lookup.
                data-memo-id={item.id || item.name}
                type="button"
                onClick={() => onSelect(item)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {item.pinned && (
                    <PinIcon
                      aria-label={t("memo.pinnedBadge")}
                      className="size-3.5 shrink-0 fill-current text-brand-500 dark:text-brand-400"
                    />
                  )}
                  <span className="truncate text-sm font-medium text-foreground">
                    {preview.title ||
                      (preview.hasImage
                        ? t("list.imageOnly")
                        : t("list.untitled"))}
                  </span>
                </span>
                {preview.excerpt && (
                  <span className="truncate text-xs text-muted-foreground">
                    {preview.excerpt}
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
                  {formatMemoTime(item.display_time, locale)}
                  {preview.hasImage && preview.title && (
                    <ImageIcon aria-hidden="true" className="size-3" />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {isPaginationError && retryNotice}
      {hasNextPage && !hasError && (
        <div className="flex flex-col items-center py-4">
          <div ref={sentinelRef} aria-hidden="true" className="h-2 w-full" />
          <Button
            disabled={isFetchingNextPage}
            size="sm"
            variant="ghost"
            onClick={onLoadMore}
          >
            {isFetchingNextPage && (
              <Loader2Icon
                className="motion-safe:animate-spin"
                data-icon="inline-start"
              />
            )}
            {isFetchingNextPage ? t("common.loading") : t("list.loadMore")}
          </Button>
        </div>
      )}
    </nav>
  );
});

export function MemoIndexListSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((key) => (
        <div
          className="flex flex-col gap-2 border-b border-border/50 px-4 py-3"
          key={key}
        >
          <Skeleton className="h-3.5 w-3/4 rounded" />
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}
