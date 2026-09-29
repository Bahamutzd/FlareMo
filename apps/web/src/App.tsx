import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  EyeIcon,
  SparklesIcon,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Memo, MemoVisibility } from "@/api";
import {
  MemoIndexList,
  MemoIndexListSkeleton,
} from "@/components/memo-index-list";
import { MemoList } from "@/components/memo-list";
import {
  MemoReadingPane,
  MemoReadingPaneEmpty,
  NewMemoPane,
} from "@/components/memo-reading-pane";
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import { SpotlightSearch } from "@/components/spotlight-search";
import { Button } from "@/components/ui/button";
import { PaneResizeHandle } from "@/components/workspace/pane-resize-handle";
import { ShortcutsDialog } from "@/components/workspace/shortcuts-dialog";
import { TaskSearchResults } from "@/components/workspace/task-search-results";
import { WorkspaceFilterChips } from "@/components/workspace/workspace-filter-chips";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import {
  useSidebarWidth,
  WorkspaceSidebar,
  type WorkspaceSidebarContent,
} from "@/components/workspace/workspace-sidebar";
import { WorkspaceComposer } from "@/components/workspace-composer";
import { WorkspaceSearch } from "@/components/workspace-search";
import { useDataTransfer } from "@/hooks/use-data-transfer";
import { useMediaQuery, WIDE_WORKSPACE_QUERY } from "@/hooks/use-media-query";
import { useMemoMutations } from "@/hooks/use-memo-mutations";
import { usePaneWidth } from "@/hooks/use-pane-width";
import { useWorkspaceFilters } from "@/hooks/use-workspace-filters";
import { useWorkspaceQueries } from "@/hooks/use-workspace-queries";
import { useWorkspaceShortcuts } from "@/hooks/use-workspace-shortcuts";
import { useI18n } from "@/i18n";
import { focusComposerInput } from "@/lib/composer-focus";
import { getMemoResourceId } from "@/lib/memo";
import { cn } from "@/lib/utils";
import { AppRoutes } from "@/router-tree";
import { indexRoute, registerWorkspaceComponent } from "@/routes/index-route";

// The settings modal is opened in place over the workspace; the chunk (and
// its account-page dependency graph) only downloads on first open.
const AccountSettingsDialog = lazy(() =>
  import("@/pages/account-page").then((module) => ({
    default: module.AccountSettingsDialog,
  })),
);

// Persisted so a collapsed desktop sidebar stays collapsed across reloads.
const SIDEBAR_COLLAPSED_KEY = "flaremo.sidebar.collapsed";
// The three-pane list column: dragged to taste, remembered per device.
const LIST_WIDTH_KEY = "flaremo.list.width";
const LIST_DEFAULT_WIDTH = 340;
const LIST_MIN_WIDTH = 260;
const LIST_MAX_WIDTH = 640;
// Space the reading pane always keeps, so a wide list cannot squeeze it out.
const READING_PANE_MIN_WIDTH = 360;

// Breaks the App ↔ router-tree import cycle: the route tree renders the
// workspace through this registry instead of importing `@/App`. Module-eval
// order guarantees registration before the router's first render.
registerWorkspaceComponent(FlareMoApp);

export function FlareMoApp() {
  const { t } = useI18n();
  const search = indexRoute.useSearch();
  const {
    activeTag,
    clearComposeRequest,
    clearFilters,
    composeRequested,
    dayFilter,
    openMemo,
    query,
    selectedMemoId,
    setActiveTag,
    setQuery,
    setSelectedMemoId,
    setSpace,
    setUntagged,
    setView,
    space,
    untagged,
    view,
  } = useWorkspaceFilters(search);
  // Desktop is three-pane (sidebar | list | reading pane); below `lg` the
  // single-column card timeline stays, since three columns cannot fit.
  const threePane = useMediaQuery(WIDE_WORKSPACE_QUERY);
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const [isTimelineScrolled, setIsTimelineScrolled] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);

  const scrollToTop = useCallback(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Persistence is best-effort; the in-memory choice still applies.
      }
      return next;
    });
  }, []);
  const sidebarWidth = useSidebarWidth();
  const listWidth = usePaneWidth(
    LIST_WIDTH_KEY,
    LIST_DEFAULT_WIDTH,
    LIST_MIN_WIDTH,
    LIST_MAX_WIDTH,
  );
  const listMaxWidth = useCallback(
    () =>
      Math.min(
        LIST_MAX_WIDTH,
        window.innerWidth -
          (sidebarCollapsed ? 0 : sidebarWidth.width) -
          READING_PANE_MIN_WIDTH,
      ),
    [sidebarCollapsed, sidebarWidth.width],
  );
  const searchQuery = query.trim();
  const isSearching = Boolean(searchQuery);

  const {
    attachmentsByMemo,
    canPublishTeam,
    captureStatusQuery,
    currentUserQuery,
    displayedMemos,
    isReader,
    isSemanticSearch,
    keywordSearch,
    matchingTasks,
    memosQuery,
    onThisDayQuery,
    semanticEnabled,
    semanticMode,
    semanticResultsQuery,
    showOnThisDayBanner,
    stats,
    tagHierarchyQuery,
    taskSearchQuery,
    teamExpired,
    toggleSemantic,
    vectorUsageQuery,
  } = useWorkspaceQueries({
    activeTag,
    dayFilter,
    isSearching,
    searchQuery,
    space,
    timeZone,
    untagged,
    view,
  });

  const {
    displayedMemosRef,
    focusedMemoIndex,
    handleArchiveRef,
    handlePinRef,
    newMemoRef,
    setShowShortcutsOpen,
    setSpotlightOpen,
    shortcutsOpen,
    spotlightOpen,
  } = useWorkspaceShortcuts();
  const {
    deleteTagMutation,
    handleMutationError,
    hardDeleteMutation,
    invalidateWorkspace,
    renameTagMutation,
    restoreMutation,
    revokeShareMutation,
    sharesByMemo,
    shareMutation,
    trashMutation,
    updateMutation,
  } = useMemoMutations();

  const { handleExport, handleImportFile } = useDataTransfer({
    handleMutationError,
    invalidateWorkspace,
  });

  const { mutate: updateMemo, mutateAsync: updateMemoAsync } = updateMutation;
  const { mutate: trashMemo } = trashMutation;
  const { mutate: restoreMemo } = restoreMutation;
  const { mutateAsync: shareMemo } = shareMutation;
  const { mutateAsync: hardDeleteMemo } = hardDeleteMutation;
  const handleArchive = useCallback(
    (id: string) => {
      const source = displayedMemos.find(
        (item) => item.name === id || item.id === id,
      );
      updateMemo({
        id,
        input: { status: source?.state === "archived" ? "normal" : "archived" },
      });
    },
    [displayedMemos, updateMemo],
  );
  const handlePin = useCallback(
    (id: string, pinned: boolean) => updateMemo({ id, input: { pinned } }),
    [updateMemo],
  );
  displayedMemosRef.current = displayedMemos;
  handleArchiveRef.current = handleArchive;
  handlePinRef.current = handlePin;
  const handleUpdate = useCallback(
    async (
      id: string,
      input: { content: string; visibility: MemoVisibility },
    ) => {
      await updateMemoAsync({ id, input });
    },
    [updateMemoAsync],
  );
  const handleHardDelete = useCallback(
    async (id: string) => {
      await hardDeleteMemo(id);
    },
    [hardDeleteMemo],
  );
  const { fetchNextPage, refetch, isFetchNextPageError } = memosQuery;
  const { refetch: refetchSemantic } = semanticResultsQuery;
  const handleLoadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  const handleRetry = useCallback(() => {
    if (isSemanticSearch) void refetchSemantic();
    else if (isFetchNextPageError) void fetchNextPage();
    else void refetch();
  }, [
    isSemanticSearch,
    isFetchNextPageError,
    fetchNextPage,
    refetch,
    refetchSemantic,
  ]);
  const isUpdating = isSemanticSearch
    ? semanticResultsQuery.isFetching
    : memosQuery.isFetching && !memosQuery.isFetchingNextPage;
  const hasFilters = Boolean(query.trim() || activeTag || untagged);

  // Reading-pane selection lives in `?memo=`. With no selection, or once the
  // selected memo leaves the list (archived, trashed, filtered out), the pane
  // falls back to the row at the old position so it is never left stale.
  const selectedIndex = selectedMemoId
    ? displayedMemos.findIndex(
        (item) => getMemoResourceId(item) === selectedMemoId,
      )
    : -1;
  const selectedMemo: Memo | undefined =
    selectedIndex >= 0 ? displayedMemos[selectedIndex] : undefined;
  const lastSelectedIndexRef = useRef(0);
  if (selectedIndex >= 0) lastSelectedIndexRef.current = selectedIndex;
  const listSettled = isSemanticSearch
    ? !semanticResultsQuery.isFetching
    : !memosQuery.isFetching;
  // A memo written from scratch in the right pane ("new" in the list
  // header). It has no selection until its first save creates it; from then
  // on it tracks the created memo, keeping the same editor on screen.
  const [newMemo, setNewMemo] = useState<{
    key: number;
    createdId?: string;
  } | null>(null);
  const newMemoKeyRef = useRef(0);
  const activeNewMemoKeyRef = useRef<number | undefined>(undefined);
  activeNewMemoKeyRef.current = newMemo?.key;
  const newMemoActive = newMemo !== null;
  // The created memo, once the selection and the list have caught up.
  const createdMemo =
    newMemo?.createdId &&
    selectedMemo &&
    getMemoResourceId(selectedMemo) === newMemo.createdId
      ? selectedMemo
      : undefined;
  const canCompose = view === "all" && !(isReader && space === "team");
  const startNewMemo = useCallback(() => {
    newMemoKeyRef.current += 1;
    setNewMemo({ key: newMemoKeyRef.current });
  }, []);
  const closeNewMemo = useCallback(() => setNewMemo(null), []);
  // Any other selection (list, j/k, spotlight, history) ends the session;
  // the created memo becoming the selection keeps it.
  const previousSelectedIdRef = useRef(selectedMemoId);
  useEffect(() => {
    if (previousSelectedIdRef.current === selectedMemoId) return;
    previousSelectedIdRef.current = selectedMemoId;
    setNewMemo((current) =>
      current && current.createdId !== selectedMemoId ? null : current,
    );
  }, [selectedMemoId]);
  // The PWA "new note" shortcut (`/?compose=1`) opens the new-memo pane;
  // the narrow layout's composer consumes it on its own.
  useEffect(() => {
    if (!threePane || !composeRequested) return;
    if (canCompose) startNewMemo();
    clearComposeRequest();
  }, [
    threePane,
    composeRequested,
    canCompose,
    startNewMemo,
    clearComposeRequest,
  ]);
  newMemoRef.current = threePane && canCompose ? startNewMemo : null;
  const spaceVisibility: MemoVisibility =
    canPublishTeam && space === "team" ? "protected" : "private";

  useEffect(() => {
    if (!threePane || selectedMemo || !listSettled || newMemoActive) return;
    const fallback =
      displayedMemos[
        Math.min(lastSelectedIndexRef.current, displayedMemos.length - 1)
      ];
    const nextId = fallback ? getMemoResourceId(fallback) : undefined;
    if (nextId !== selectedMemoId) setSelectedMemoId(nextId);
  }, [
    threePane,
    selectedMemo,
    listSettled,
    newMemoActive,
    displayedMemos,
    selectedMemoId,
    setSelectedMemoId,
  ]);
  const handleSelectMemo = useCallback(
    (item: Memo) => {
      setNewMemo(null);
      setSelectedMemoId(getMemoResourceId(item));
    },
    [setSelectedMemoId],
  );
  // Narrow layout: a tapped card opens full screen with its own history
  // entry; Back pops it, or clears the selection when the page was loaded
  // straight onto `?memo=` and there is nothing to pop.
  const handleOpenMemo = useCallback(
    (item: Memo) => openMemo(getMemoResourceId(item)),
    [openMemo],
  );
  const canGoBack = useCanGoBack();
  const { history } = useRouter();
  const handleCloseMemo = useCallback(() => {
    if (canGoBack) history.back();
    else setSelectedMemoId(undefined);
  }, [canGoBack, history, setSelectedMemoId]);
  // j/k walks the list; in three-pane mode the focused row also opens. Only
  // a keyboard step may move the selection, not a list refresh, so the list
  // and current selection are read through refs instead of dependencies.
  const selectedMemoIdRef = useRef(selectedMemoId);
  selectedMemoIdRef.current = selectedMemoId;
  useEffect(() => {
    if (!threePane || focusedMemoIndex === null) return;
    const focused = displayedMemosRef.current[focusedMemoIndex];
    if (focused && getMemoResourceId(focused) !== selectedMemoIdRef.current) {
      setNewMemo(null);
      setSelectedMemoId(getMemoResourceId(focused));
    }
  }, [threePane, focusedMemoIndex, displayedMemosRef, setSelectedMemoId]);

  const sidebarContent: WorkspaceSidebarContent = {
    activeTag,
    hierarchy: tagHierarchyQuery.data?.tags ?? [],
    hierarchyPending: tagHierarchyQuery.isPending,
    space,
    stats,
    timeZone,
    untagged,
    user: currentUserQuery.data,
    onDeleteTag: (tag) => deleteTagMutation.mutate(tag),
    onExport: handleExport,
    onImportFile: handleImportFile,
    onOpenSettings: () => setAccountSettingsOpen(true),
    onRenameTag: (from, to) => renameTagMutation.mutate({ from, to }),
    onTagChange: setActiveTag,
    onToggleCollapsed: toggleSidebarCollapsed,
    onUntaggedChange: setUntagged,
  };

  return (
    <div className="h-svh overflow-hidden bg-background">
      <div
        className={cn(
          "flex h-full w-full",
          !threePane && "mx-auto max-w-[950px]",
        )}
      >
        <WorkspaceSidebar
          collapsed={sidebarCollapsed}
          explorer={sidebarContent}
          resize={sidebarWidth}
        />
        <div
          className={cn(
            "relative flex h-full min-w-0 flex-col",
            threePane ? "shrink-0 border-r" : "flex-1",
          )}
          style={threePane ? { width: listWidth.width } : undefined}
        >
          {threePane && (
            <PaneResizeHandle
              defaultWidth={listWidth.defaultWidth}
              label={t("list.resize")}
              max={listMaxWidth}
              min={listWidth.min}
              width={listWidth.width}
              onResize={listWidth.setWidth}
              onResizeEnd={listWidth.saveWidth}
            />
          )}
          <WorkspaceHeader
            activeQuery={dayFilter ? "" : query}
            explorer={sidebarContent}
            isTimelineScrolled={isTimelineScrolled}
            mobileSheetOpen={mobileSheetOpen}
            onNewMemo={threePane && canCompose ? startNewMemo : undefined}
            setMobileSheetOpen={setMobileSheetOpen}
            setQuery={setQuery}
            setSpace={setSpace}
            setSpotlightOpen={setSpotlightOpen}
            setView={setView}
            sidebarCollapsed={sidebarCollapsed}
            space={space}
            team={currentUserQuery.data?.team ?? null}
            toggleSidebarCollapsed={toggleSidebarCollapsed}
            view={view}
          />
          <main
            ref={mainRef}
            className={cn(
              "mx-auto min-h-0 w-full flex-1 overflow-y-auto pt-1 pb-8",
              threePane ? "px-2" : "max-w-[640px] px-5 lg:px-3",
            )}
            onScroll={(event) => {
              const top = event.currentTarget.scrollTop;
              const scrolled = top > 4;
              setIsTimelineScrolled((prev) =>
                prev === scrolled ? prev : scrolled,
              );
              const showTop = top > 400;
              setShowScrollToTop((prev) => (prev === showTop ? prev : showTop));
            }}
          >
            <WorkspaceSearch
              className="mb-3 md:hidden motion-safe:animate-rise"
              inputRef={mobileSearchRef}
              onToggleSemantic={semanticEnabled ? toggleSemantic : undefined}
              query={dayFilter ? "" : query}
              semanticMode={semanticMode}
              semanticPending={vectorUsageQuery.isPending}
              onQueryChange={setQuery}
              isPending={isUpdating}
            />
            <div className="flex flex-col gap-3">
              {teamExpired && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground motion-safe:animate-rise">
                  <EyeIcon aria-hidden="true" className="size-3.5 shrink-0" />
                  {t("space.expiredNotice")}
                </div>
              )}
              {isReader && space === "team" && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground motion-safe:animate-rise">
                  <EyeIcon aria-hidden="true" className="size-3.5 shrink-0" />
                  {t("space.readonlyNotice")}
                </div>
              )}
              <WorkspaceComposer
                visible={!threePane && canCompose}
                composeRequested={composeRequested}
                space={space}
                hasTeam={canPublishTeam}
                tags={stats.tags}
                captureAvailable={Boolean(captureStatusQuery.data?.available)}
              />
              {hasFilters && (
                <WorkspaceFilterChips
                  activeTag={activeTag}
                  clearFilters={clearFilters}
                  dayFilter={dayFilter}
                  hasFilters={hasFilters}
                  isSemanticSearch={isSemanticSearch}
                  query={query}
                  setActiveTag={setActiveTag}
                  setQuery={setQuery}
                  setUntagged={setUntagged}
                  untagged={untagged}
                />
              )}
              {isSemanticSearch && semanticResultsQuery.data?.degraded ? (
                <p className="mb-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {t("search.semanticDegraded")}
                </p>
              ) : null}
              {keywordSearch && matchingTasks.length > 0 && (
                <TaskSearchResults tasks={matchingTasks} />
              )}
              {showOnThisDayBanner && (
                <Link
                  className="mb-3 flex items-center gap-2.5 rounded-xl border border-brand-300/40 bg-brand-50/50 px-3.5 py-2.5 text-sm text-foreground motion-safe:animate-rise motion-safe:transition-[background-color,border-color] motion-safe:duration-150 hover:bg-brand-50 dark:border-brand-400/25 dark:bg-brand-400/5 dark:hover:bg-brand-400/10"
                  data-testid="on-this-day-banner"
                  to="/review/daily"
                >
                  <CalendarDaysIcon className="shrink-0 text-brand-500 dark:text-brand-400" />
                  <span className="min-w-0 flex-1 truncate">
                    {t("review.onThisDayBanner", {
                      count: onThisDayQuery.data?.memos.length ?? 0,
                    })}
                  </span>
                  <ChevronRightIcon className="shrink-0 text-muted-foreground" />
                </Link>
              )}
              {semanticEnabled &&
                !isSemanticSearch &&
                !dayFilter &&
                searchQuery &&
                displayedMemos.length === 0 &&
                !memosQuery.isLoading &&
                !memosQuery.isFetchingNextPage &&
                !memosQuery.isError && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground motion-safe:animate-rise">
                    <SparklesIcon className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      {t("search.noResultsHint")}
                    </span>
                    <Button
                      className="h-7 px-2 text-xs"
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={toggleSemantic}
                    >
                      {t("search.semanticToggle")}
                    </Button>
                  </div>
                )}
              {threePane && displayedMemos.length > 0 ? (
                <MemoIndexList
                  hasError={
                    isSemanticSearch
                      ? semanticResultsQuery.isError
                      : memosQuery.isError
                  }
                  hasNextPage={
                    isSemanticSearch ? false : Boolean(memosQuery.hasNextPage)
                  }
                  isFetchingNextPage={
                    isSemanticSearch ? false : memosQuery.isFetchingNextPage
                  }
                  isPaginationError={!isSemanticSearch && isFetchNextPageError}
                  isRetrying={
                    isSemanticSearch
                      ? semanticResultsQuery.isFetching
                      : memosQuery.isFetching
                  }
                  memos={displayedMemos}
                  selectedMemoName={
                    newMemoActive ? createdMemo?.name : selectedMemo?.name
                  }
                  onLoadMore={handleLoadMore}
                  onRetry={handleRetry}
                  onSelect={handleSelectMemo}
                />
              ) : threePane &&
                (isSemanticSearch
                  ? semanticResultsQuery.isLoading
                  : memosQuery.isLoading) ? (
                <MemoIndexListSkeleton />
              ) : (
                <MemoList
                  attachmentsByMemo={attachmentsByMemo}
                  emptyDescription={
                    isSemanticSearch
                      ? t("search.semanticEmpty")
                      : hasFilters
                        ? t("list.filteredEmptyDescription")
                        : view === "archived"
                          ? t("list.archiveEmptyDescription")
                          : view === "trashed"
                            ? t("list.trashEmptyDescription")
                            : undefined
                  }
                  hasError={
                    isSemanticSearch
                      ? semanticResultsQuery.isError
                      : memosQuery.isError
                  }
                  hasNextPage={
                    isSemanticSearch ? false : Boolean(memosQuery.hasNextPage)
                  }
                  isFetchingNextPage={
                    isSemanticSearch ? false : memosQuery.isFetchingNextPage
                  }
                  isLoading={
                    isSemanticSearch
                      ? semanticResultsQuery.isLoading
                      : memosQuery.isLoading
                  }
                  memos={displayedMemos}
                  focusedMemoId={
                    focusedMemoIndex !== null
                      ? displayedMemos[focusedMemoIndex]?.id ||
                        displayedMemos[focusedMemoIndex]?.name
                      : null
                  }
                  searchQuery={searchQuery || undefined}
                  sharesByMemo={sharesByMemo}
                  onArchive={handleArchive}
                  onHardDelete={handleHardDelete}
                  onLoadMore={handleLoadMore}
                  onPin={handlePin}
                  onRestore={restoreMemo}
                  onRetry={handleRetry}
                  onRevokeShare={(share) =>
                    revokeShareMutation.mutate(share.id)
                  }
                  onShare={shareMemo}
                  onTagClick={setActiveTag}
                  onTrash={trashMemo}
                  onUpdate={handleUpdate}
                  onOpenMemo={handleOpenMemo}
                  onClearFilters={hasFilters ? clearFilters : undefined}
                  isUpdating={isUpdating}
                  isPaginationError={!isSemanticSearch && isFetchNextPageError}
                  isRetrying={
                    isSemanticSearch
                      ? semanticResultsQuery.isFetching
                      : memosQuery.isFetching
                  }
                  emptyTitle={
                    hasFilters
                      ? t("list.filteredEmptyTitle")
                      : view === "all"
                        ? t("list.emptyTitle")
                        : view === "archived"
                          ? t("list.archiveEmptyTitle")
                          : t("list.trashEmptyTitle")
                  }
                />
              )}
              {showScrollToTop && !threePane && (
                <Button
                  aria-label={t("common.scrollToTop")}
                  className="fixed bottom-6 right-6 z-30 size-9 rounded-full border border-border/60 bg-background/85 p-0 text-muted-foreground shadow-sm backdrop-blur-md hover:bg-muted hover:text-foreground active:scale-95 motion-safe:animate-scale-in motion-safe:transition-all sm:right-8"
                  size="icon"
                  title={t("common.scrollToTop")}
                  type="button"
                  variant="outline"
                  onClick={scrollToTop}
                >
                  <ArrowUpIcon className="size-4" />
                </Button>
              )}
            </div>
          </main>
        </div>
        {(threePane || selectedMemo) && (
          // Desktop: the right column. Narrow: a full-screen reading view
          // laid over the timeline, which stays mounted underneath so its
          // scroll position survives the round trip.
          <section
            aria-label={t("list.readingPaneLabel")}
            className={cn(
              "flex min-w-0 flex-col overflow-hidden",
              threePane
                ? "flex-1"
                : "fixed inset-0 z-40 bg-background motion-safe:animate-fade",
            )}
          >
            {!threePane && (
              <div className="flex h-14 shrink-0 items-center border-b bg-background px-3">
                <Button
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  size="sm"
                  variant="ghost"
                  onClick={handleCloseMemo}
                >
                  <ArrowLeftIcon className="size-4 rtl:-rotate-180" />
                  {t("common.back")}
                </Button>
              </div>
            )}
            {threePane && newMemoActive && newMemo ? (
              <NewMemoPane
                attachments={
                  createdMemo
                    ? (attachmentsByMemo.get(createdMemo.name) ?? [])
                    : []
                }
                draft={{
                  visibility: spaceVisibility,
                  onCreated: (created) => {
                    // A save flushed while leaving the pane must not pull
                    // the selection back to it.
                    if (activeNewMemoKeyRef.current !== newMemo.key) return;
                    const createdId = getMemoResourceId(created);
                    setNewMemo((current) =>
                      current ? { ...current, createdId } : current,
                    );
                    setSelectedMemoId(createdId);
                  },
                }}
                key={`new-${newMemo.key}`}
                memo={createdMemo}
                share={
                  createdMemo ? sharesByMemo.get(createdMemo.name) : undefined
                }
                onArchive={(id) => {
                  closeNewMemo();
                  handleArchive(id);
                }}
                onDiscardDraft={closeNewMemo}
                onHardDelete={handleHardDelete}
                onPin={handlePin}
                onRestore={restoreMemo}
                onRevokeShare={(share) => revokeShareMutation.mutate(share.id)}
                onShare={shareMemo}
                onTrash={(id) => {
                  closeNewMemo();
                  trashMemo(id);
                }}
                onUpdate={handleUpdate}
              />
            ) : selectedMemo ? (
              <MemoReadingPane
                attachments={attachmentsByMemo.get(selectedMemo.name) ?? []}
                key={selectedMemo.name}
                memo={selectedMemo}
                searchQuery={searchQuery || undefined}
                share={sharesByMemo.get(selectedMemo.name)}
                onArchive={handleArchive}
                onHardDelete={handleHardDelete}
                onPin={handlePin}
                onRestore={restoreMemo}
                onRevokeShare={(share) => revokeShareMutation.mutate(share.id)}
                onShare={shareMemo}
                onTagClick={setActiveTag}
                onTrash={trashMemo}
                onUpdate={handleUpdate}
              />
            ) : (
              <MemoReadingPaneEmpty />
            )}
          </section>
        )}
      </div>
      <Suspense fallback={null}>
        {accountSettingsOpen && (
          <AccountSettingsDialog
            open
            onClose={() => setAccountSettingsOpen(false)}
          />
        )}
      </Suspense>
      <SpotlightSearch
        open={spotlightOpen}
        onOpenChange={setSpotlightOpen}
        query={dayFilter ? "" : query}
        onQueryChange={setQuery}
        onNewMemo={threePane && canCompose ? startNewMemo : focusComposerInput}
        tasks={taskSearchQuery.data?.tasks ?? []}
        memos={displayedMemos}
        semanticMode={semanticMode}
        onToggleSemantic={semanticEnabled ? toggleSemantic : undefined}
        semanticPending={vectorUsageQuery.isPending}
        isSearching={isUpdating}
      />
      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShowShortcutsOpen}
      />
    </div>
  );
}

export default function App() {
  return (
    <>
      <PwaUpdatePrompt />
      <AppRoutes />
    </>
  );
}
