import type { Editor } from "@tiptap/react";
import { FileTextIcon } from "lucide-react";
import { memo, type RefObject, Suspense, useId, useRef, useState } from "react";
import { toast } from "sonner";
import type { Attachment, Memo, MemoVisibility, Share } from "@/api";
import { bindMemoAttachments, uploadAttachment } from "@/api";
import { AttachmentGallery } from "@/components/attachment-gallery";
import { ImageLightbox } from "@/components/image-lightbox";
import { MemoCardBody } from "@/components/memo-card/memo-card-body";
import { MemoCardHeader } from "@/components/memo-card/memo-card-header";
import { useMemoCardActions } from "@/components/memo-card/use-memo-card-actions";
import {
  EMPTY_MEMO_EDITOR_FORMATS,
  type MemoEditorFormats,
  MemoEditorToolbar,
  readMemoEditorFormats,
  sameMemoEditorFormats,
} from "@/components/memo-editor-toolbar";
import { RichComposerEditor } from "@/components/rich-composer-editor-lazy";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  type MemoAutosaveDraft,
  useMemoAutosave,
} from "@/hooks/use-memo-autosave";
import { useI18n } from "@/i18n";
import { filterUnreferencedAttachments } from "@/lib/attachment-refs";
import { restoreMarkdownEntities } from "@/lib/markdown-entities";
import { getMemoResourceId } from "@/lib/memo";
import { uploadAndInsertImages } from "@/lib/rich-editor-upload";

type MemoReadingPaneProps = {
  memo: Memo;
  attachments: Attachment[];
  share?: Share;
  searchQuery?: string;
  onArchive: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onShare: (id: string) => Promise<Share>;
  onRevokeShare?: (share: Share) => void;
  onUpdate: (
    id: string,
    input: { content: string; visibility: MemoVisibility },
  ) => Promise<void>;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onHardDelete: (id: string) => Promise<void>;
  onTagClick?: (tag: string) => void;
};

/**
 * The selected memo at full length: the right column on desktop, a full
 * screen on narrow layouts. Like a note app, the body is the editor — there
 * is no separate edit mode; a formatting bar sits across the top and changes
 * save in the background. Memos the viewer cannot edit (read-only team notes,
 * the trash) render as the read view. Keyed by memo name at the call site, so
 * each selection gets a fresh editor. The pane fills its container and
 * scrolls its own body under the fixed bar.
 */
export const MemoReadingPane = memo(function MemoReadingPane(
  props: MemoReadingPaneProps,
) {
  const editable =
    props.memo.can_manage === true && props.memo.state !== "trashed";
  return editable ? (
    <EditableMemoPane {...props} />
  ) : (
    <ReadOnlyMemoPane {...props} />
  );
});

type EditableMemoPaneProps = Omit<
  MemoReadingPaneProps,
  "memo" | "searchQuery" | "onTagClick"
> & {
  /** Missing while a new memo has not been saved yet. */
  memo?: Memo;
  /** Set for a new memo: its first save creates it. */
  draft?: MemoAutosaveDraft;
  /** Throws away a new memo that was never saved (the toolbar's delete). */
  onDiscardDraft?: () => void;
};

/**
 * The right pane for a memo being written from scratch ("new" in the list
 * header): the same editor, empty and focused. The first text creates the
 * memo; the pane stays mounted, so typing continues into the saved memo.
 */
export function NewMemoPane(
  props: EditableMemoPaneProps & { draft: MemoAutosaveDraft },
) {
  return <EditableMemoPane {...props} />;
}

function EditableMemoPane({
  memo,
  draft,
  attachments,
  share,
  onArchive,
  onPin,
  onShare,
  onRevokeShare,
  onUpdate,
  onTrash,
  onRestore,
  onHardDelete,
  onDiscardDraft,
}: EditableMemoPaneProps) {
  const { t } = useI18n();
  const imageInputId = useId();
  // Seeded once per mount: the editor owns the text from here on, and the
  // list refetches that follow each save must not re-parse it under the
  // caret.
  const [initialContent] = useState(memo?.content ?? "");
  const [startsEmpty] = useState(!memo);
  const editorRef = useRef<Editor | null>(null);
  // Images dropped into a new memo before its first save upload unbound and
  // are claimed once the memo exists.
  const createdNameRef = useRef<string | undefined>(undefined);
  const pendingImagesRef = useRef<string[]>([]);
  const autosave = useMemoAutosave(
    memo,
    draft && {
      visibility: draft.visibility,
      onCreated: (created) => {
        createdNameRef.current = created.name;
        const pending = pendingImagesRef.current;
        pendingImagesRef.current = [];
        if (pending.length > 0) {
          void bindMemoAttachments(created.name, pending).catch(() =>
            toast.error(t("composer.imageUploadFailed")),
          );
        }
        draft.onCreated(created);
      },
    },
  );
  // Mounting re-serializes the stored markdown (escapes, normalization), and
  // that update must not be saved as if the user had written it: opening a
  // memo would rewrite it. Only a change made while the editor has focus —
  // typing, pasting, a to-do toggle — or one made from the toolbar or an
  // inline image the user dropped in counts as an edit.
  const userEditedRef = useRef(false);
  const [formats, setFormats] = useState<MemoEditorFormats>(
    EMPTY_MEMO_EDITOR_FORMATS,
  );
  const handleTransaction = (editor: Editor) => {
    const next = readMemoEditorFormats(editor);
    setFormats((current) =>
      sameMemoEditorFormats(current, next) ? current : next,
    );
  };
  const handleContentChange = (content: string) => {
    if (!userEditedRef.current && !editorRef.current?.isFocused) return;
    userEditedRef.current = true;
    // The serializer stores `->` as `-&gt;`; save what the user typed.
    autosave.change(restoreMarkdownEntities(content));
  };

  const insertInlineImages = (files: File[], position: number) => {
    if (files.length === 0) return;
    userEditedRef.current = true;
    void uploadAndInsertImages({
      editorRef,
      files,
      position,
      upload: async (file) => {
        const target = memo?.name ?? createdNameRef.current;
        const attachment = await uploadAttachment({ file, memo: target });
        if (!target) pendingImagesRef.current.push(attachment.name);
        return attachment;
      },
      onError: () => toast.error(t("composer.imageUploadFailed")),
    });
  };

  const handleToolbarTrash = () => {
    const storedId = memo ? getMemoResourceId(memo) : autosave.resolveId();
    if (storedId) {
      autosave.flush();
      onTrash(storedId);
      return;
    }
    // A new memo that never reached the server is simply dropped.
    autosave.discard();
    onDiscardDraft?.();
  };

  const galleryAttachments = memo
    ? filterUnreferencedAttachments(attachments, memo.content)
    : [];
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    alt?: string;
  } | null>(null);

  const autosaveStatus =
    autosave.state === "saving"
      ? t("memo.saving")
      : autosave.state === "saved"
        ? t("memo.saved")
        : autosave.state === "dirty" || autosave.state === "error"
          ? t("memo.unsaved")
          : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Same height as the list header so the two bars read as one row;
          the buttons share the body's centered column, so undo lines up
          with the text and delete ends where the text ends. */}
      <div className="flex h-14 shrink-0 items-center border-b">
        <MemoEditorToolbar
          editorRef={editorRef}
          formats={formats}
          inputId={imageInputId}
          status={
            <span
              aria-live="polite"
              className="shrink-0 px-2 text-xs text-muted-foreground"
              data-testid="memo-autosave-status"
            >
              {autosaveStatus}
            </span>
          }
          onEdit={() => {
            userEditedRef.current = true;
          }}
          onImageFiles={insertInlineImages}
          onPin={
            memo
              ? () => onPin(getMemoResourceId(memo), !memo.pinned)
              : undefined
          }
          onTrash={handleToolbarTrash}
          pinned={memo?.pinned}
        />
      </div>
      {/* The body scrolls under the fixed bar. A press on the blank space
          below the text puts the caret at the end, as in a note app; a tap
          on an image in the text opens it large. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer shortcuts only; the editor itself stays the keyboard target */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same as above */}
      <div
        className="min-h-0 flex-1 cursor-text overflow-y-auto"
        data-testid="memo-pane-scroll"
        // Capture phase, ahead of the editor: pressing an image must not
        // focus the text (and pop the phone keyboard). Both the browser's
        // default action and the editor's own press handling (which selects
        // the image and focuses on release) are kept out; the click that
        // follows still fires and opens the preview.
        onMouseDownCapture={(event) => {
          if (!bodyImage(event.target)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          const image = bodyImage(event.target);
          if (!image) return;
          const src = image.getAttribute("src");
          if (!src) return;
          // A tap after the keyboard was already up (the user was typing)
          // closes it too, so the preview gets the whole screen. A plain DOM
          // blur: the editor command runs a transaction, and one over a
          // memo whose image sits outside a paragraph throws.
          editorRef.current?.view.dom.blur();
          setPreviewImage({ src, alt: image.alt });
        }}
        onMouseDown={(event) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          editorRef.current?.commands.focus("end");
        }}
      >
        <article
          className="group mx-auto flex w-full max-w-[720px] cursor-auto flex-col gap-3 px-6 py-5 motion-safe:animate-fade"
          data-memo-id={memo?.id}
        >
          {memo && (
            <EditableMemoHeader
              autosave={autosave}
              editorRef={editorRef}
              memo={memo}
              share={share}
              onArchive={onArchive}
              onHardDelete={onHardDelete}
              onPin={onPin}
              onRestore={onRestore}
              onRevokeShare={onRevokeShare}
              onShare={onShare}
              onTrash={onTrash}
              onUpdate={onUpdate}
            />
          )}
          <Suspense
            fallback={<div className="min-h-[50vh]" aria-hidden="true" />}
          >
            <RichComposerEditor
              ariaLabel={t("list.readingPaneLabel")}
              autoFocus={startsEmpty}
              content={initialContent}
              disabled={false}
              editorRef={editorRef}
              inputId="flaremo-pane-editor-input"
              // The article editor's body: reading-surface typography,
              // unclipped, so a long memo grows the pane instead of
              // scrolling in a box.
              contentClassName="article-editor-content"
              onContentChange={handleContentChange}
              onEscape={() => editorRef.current?.commands.blur()}
              onImageFiles={insertInlineImages}
              onSubmitRequest={autosave.flush}
              onTransaction={handleTransaction}
              placeholder={t("composer.placeholder")}
              submitOnEnter={false}
            />
          </Suspense>
          {galleryAttachments.length > 0 && (
            <AttachmentGallery attachments={galleryAttachments} />
          )}
        </article>
      </div>
      <ImageLightbox
        alt={previewImage?.alt}
        open={previewImage !== null}
        // Closing must not hand focus back to the editor: on a phone that
        // brings the keyboard up although the user never tapped the text.
        restoreFocus={false}
        src={previewImage?.src}
        onOpenChange={(open) => {
          if (!open) setPreviewImage(null);
        }}
      />
    </div>
  );
}

/** The image an event landed on, when it is part of the pane's memo text. */
function bodyImage(target: EventTarget | null): HTMLImageElement | null {
  return target instanceof HTMLImageElement &&
    target.closest("#flaremo-pane-editor-input")
    ? target
    : null;
}

/** The editable pane's identity row: time, badges and the ⋯ menu. */
function EditableMemoHeader({
  autosave,
  editorRef,
  memo,
  share,
  onArchive,
  onHardDelete,
  onPin,
  onRestore,
  onRevokeShare,
  onShare,
  onTrash,
  onUpdate,
}: Pick<
  MemoReadingPaneProps,
  | "memo"
  | "share"
  | "onArchive"
  | "onHardDelete"
  | "onPin"
  | "onRestore"
  | "onRevokeShare"
  | "onShare"
  | "onTrash"
  | "onUpdate"
> & {
  autosave: ReturnType<typeof useMemoAutosave>;
  editorRef: RefObject<Editor | null>;
}) {
  const { changeVisibility, id, prefetchDetail } = useMemoCardActions({
    canManage: true,
    draftContent: memo.content,
    isTrashed: false,
    memo,
    onRevokeShare,
    onShare,
    onUpdate: async (memoId, input) => {
      await onUpdate(memoId, input);
      autosave.markSaved(input.content);
    },
    resolveContent: autosave.settle,
    share,
    setIsEditing: () => {},
    setIsSaving: () => {},
  });

  return (
    <MemoCardHeader
      memo={memo}
      id={id}
      isTrashed={false}
      canManage
      canGovern={memo.can_govern === true}
      prefetchDetail={prefetchDetail}
      onArchive={onArchive}
      onHardDelete={onHardDelete}
      onPin={onPin}
      onRestore={onRestore}
      onStartEditing={() => editorRef.current?.commands.focus("end")}
      onTrash={onTrash}
      share={share}
      onShare={onShare}
      onRevokeShare={onRevokeShare}
      onUpdateVisibility={changeVisibility}
    />
  );
}

function ReadOnlyMemoPane({
  memo,
  attachments,
  share,
  searchQuery,
  onArchive,
  onPin,
  onShare,
  onRevokeShare,
  onUpdate,
  onTrash,
  onRestore,
  onHardDelete,
  onTagClick,
}: MemoReadingPaneProps) {
  const isTrashed = memo.state === "trashed";
  const canManage = memo.can_manage === true;
  const { changeVisibility, id, prefetchDetail, taskInteraction } =
    useMemoCardActions({
      canManage,
      draftContent: memo.content,
      isTrashed,
      memo,
      onRevokeShare,
      onShare,
      onUpdate,
      share,
      setIsEditing: () => {},
      setIsSaving: () => {},
    });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <article
        className="group mx-auto flex w-full max-w-[720px] flex-col gap-3 px-6 py-5 motion-safe:animate-fade"
        data-memo-id={memo.id}
      >
        <MemoCardHeader
          memo={memo}
          id={id}
          isTrashed={isTrashed}
          canManage={canManage}
          canGovern={memo.can_govern === true}
          prefetchDetail={prefetchDetail}
          onArchive={onArchive}
          onHardDelete={onHardDelete}
          onPin={onPin}
          onRestore={onRestore}
          onStartEditing={() => {}}
          onTrash={onTrash}
          share={share}
          onShare={onShare}
          onRevokeShare={onRevokeShare}
          onUpdateVisibility={changeVisibility}
        />
        <MemoCardBody
          attachments={attachments}
          canManage={canManage}
          expanded
          fullLength
          memo={memo}
          onTagClick={onTagClick}
          onToggleExpanded={() => {}}
          searchQuery={searchQuery}
          taskInteraction={taskInteraction}
        />
      </article>
    </div>
  );
}

export function MemoReadingPaneEmpty() {
  const { t } = useI18n();
  return (
    <Empty className="flex-1 text-muted-foreground">
      <EmptyHeader>
        <EmptyMedia className="bg-accent text-accent-foreground" variant="icon">
          <FileTextIcon />
        </EmptyMedia>
        <EmptyTitle>{t("list.selectTitle")}</EmptyTitle>
        <EmptyDescription>{t("list.selectDescription")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
