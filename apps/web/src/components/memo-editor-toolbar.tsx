import type { Editor } from "@tiptap/react";
import {
  BoldIcon,
  CalendarPlusIcon,
  CodeIcon,
  HashIcon,
  Heading1Icon,
  Heading2Icon,
  ImageIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  PilcrowIcon,
  QuoteIcon,
  SquareCheckBigIcon,
  StrikethroughIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";

/** Format flags mirrored from the editor's selection on every transaction. */
export type MemoEditorFormats = {
  canUndo: boolean;
  h1: boolean;
  h2: boolean;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  quote: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
};

export const EMPTY_MEMO_EDITOR_FORMATS: MemoEditorFormats = {
  canUndo: false,
  h1: false,
  h2: false,
  bold: false,
  italic: false,
  strike: false,
  code: false,
  quote: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
};

export function readMemoEditorFormats(editor: Editor): MemoEditorFormats {
  return {
    canUndo: editor.can().undo(),
    h1: editor.isActive("heading", { level: 1 }),
    h2: editor.isActive("heading", { level: 2 }),
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    strike: editor.isActive("strike"),
    code: editor.isActive("code"),
    quote: editor.isActive("blockquote"),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    taskList: editor.isActive("taskList"),
  };
}

export function sameMemoEditorFormats(
  a: MemoEditorFormats,
  b: MemoEditorFormats,
) {
  return (Object.keys(a) as Array<keyof MemoEditorFormats>).every(
    (key) => a[key] === b[key],
  );
}

function ToolbarDivider() {
  return (
    <div aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
  );
}

function ToolButton({
  active,
  children,
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      size="icon-sm"
      title={label}
      type="button"
      variant={active ? "secondary" : "ghost"}
      // Keep the caret in the editor: a mousedown focus would collapse the
      // selection the command is about to format.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * The reading pane's formatting bar, laid out like a note app's: undo, the
 * to-do toggle, inline marks, block styles, lists and quote, then the insert
 * actions, with the save status and delete at the far end. Commands run on
 * the pane's editor and no-op while it is still loading; `onEdit` fires first
 * so the pane counts a toolbar change as the user's edit even when the
 * editor did not have focus.
 */
export function MemoEditorToolbar({
  editorRef,
  formats,
  inputId,
  onEdit,
  onImageFiles,
  onTrash,
  status,
}: {
  editorRef: React.RefObject<Editor | null>;
  formats: MemoEditorFormats;
  /** Id of the hidden image picker, unique per pane. */
  inputId: string;
  onEdit: () => void;
  onImageFiles: (files: File[], position: number) => void;
  onTrash: () => void;
  status?: ReactNode;
}) {
  const { t } = useI18n();
  const run = (action: (editor: Editor) => void) => {
    const editor = editorRef.current;
    if (!editor) return;
    onEdit();
    action(editor);
  };

  return (
    <div
      aria-label={t("memo.toolbar")}
      className="mx-auto flex w-full min-w-0 max-w-[720px] items-center gap-1 px-4.5"
      role="toolbar"
    >
      {/* The formatting group scrolls sideways when the pane is narrow;
          the save status and delete stay pinned at the right edge. */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ToolButton
          disabled={!formats.canUndo}
          label={t("common.undo")}
          onClick={() => run((editor) => editor.chain().focus().undo().run())}
        >
          <Undo2Icon />
        </ToolButton>
        <ToolbarDivider />
        <ToolButton
          active={formats.taskList}
          label={t("article.toolTaskList")}
          onClick={() =>
            run((editor) => editor.chain().focus().toggleTaskList().run())
          }
        >
          <SquareCheckBigIcon />
        </ToolButton>
        <ToolbarDivider />
        <ToolButton
          active={formats.bold}
          label={t("article.toolBold")}
          onClick={() =>
            run((editor) => editor.chain().focus().toggleBold().run())
          }
        >
          <BoldIcon />
        </ToolButton>
        <ToolButton
          active={formats.italic}
          label={t("article.toolItalic")}
          onClick={() =>
            run((editor) => editor.chain().focus().toggleItalic().run())
          }
        >
          <ItalicIcon />
        </ToolButton>
        <ToolButton
          active={formats.strike}
          label={t("article.toolStrike")}
          onClick={() =>
            run((editor) => editor.chain().focus().toggleStrike().run())
          }
        >
          <StrikethroughIcon />
        </ToolButton>
        <ToolButton
          active={formats.code}
          label={t("article.toolCode")}
          onClick={() =>
            run((editor) => editor.chain().focus().toggleCode().run())
          }
        >
          <CodeIcon />
        </ToolButton>
        <ToolbarDivider />
        <ToolButton
          active={formats.h1}
          label={t("memo.toolH1")}
          onClick={() =>
            run((editor) =>
              editor.chain().focus().toggleHeading({ level: 1 }).run(),
            )
          }
        >
          <Heading1Icon />
        </ToolButton>
        <ToolButton
          active={formats.h2}
          label={t("article.toolH2")}
          onClick={() =>
            run((editor) =>
              editor.chain().focus().toggleHeading({ level: 2 }).run(),
            )
          }
        >
          <Heading2Icon />
        </ToolButton>
        <ToolButton
          label={t("memo.toolParagraph")}
          onClick={() =>
            run((editor) => editor.chain().focus().clearNodes().run())
          }
        >
          <PilcrowIcon />
        </ToolButton>
        <ToolbarDivider />
        <ToolButton
          active={formats.orderedList}
          label={t("article.toolOrderedList")}
          onClick={() =>
            run((editor) => editor.chain().focus().toggleOrderedList().run())
          }
        >
          <ListOrderedIcon />
        </ToolButton>
        <ToolButton
          active={formats.bulletList}
          label={t("article.toolBulletList")}
          onClick={() =>
            run((editor) => editor.chain().focus().toggleBulletList().run())
          }
        >
          <ListIcon />
        </ToolButton>
        <ToolButton
          active={formats.quote}
          label={t("article.toolQuote")}
          onClick={() =>
            run((editor) => editor.chain().focus().toggleBlockquote().run())
          }
        >
          <QuoteIcon />
        </ToolButton>
        <ToolbarDivider />
        <ToolButton
          label={t("composer.insertDate")}
          onClick={() =>
            run((editor) => {
              const today = new Date().toISOString().slice(0, 10);
              editor.chain().focus().insertContent(`${today} `).run();
            })
          }
        >
          <CalendarPlusIcon />
        </ToolButton>
        <Button
          render={
            <label
              aria-label={t("composer.addAttachment")}
              htmlFor={inputId}
              title={t("composer.addAttachment")}
            />
          }
          size="icon-sm"
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
        >
          <ImageIcon />
          <Input
            accept="image/*"
            className="hidden"
            id={inputId}
            multiple
            type="file"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              const editor = editorRef.current;
              if (files.length === 0 || !editor) return;
              onImageFiles(files, editor.state.selection.to);
            }}
          />
        </Button>
        <ToolButton
          label={t("composer.addTag")}
          onClick={() =>
            run((editor) =>
              editor
                .chain()
                .focus()
                .insertContentAt(editor.state.selection.to, "#")
                .run(),
            )
          }
        >
          <HashIcon />
        </ToolButton>
      </div>
      {status}
      <Button
        aria-label={t("memo.moveToTrash")}
        className="shrink-0 text-muted-foreground hover:text-destructive"
        size="icon-sm"
        title={t("memo.moveToTrash")}
        type="button"
        variant="ghost"
        onClick={onTrash}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
