"use client";

// The TipTap editor itself (Tess, 2026-08-24: "go with TipTap" + "the app feels
// slow"). Split out from RichNotesField and loaded on demand: TipTap + ProseMirror
// are ~130kB, and the notes editor only appears when a form is being edited, so
// keeping this in its own chunk keeps that weight off the style profile's first
// load. RichNotesField owns the hidden <input> and dynamic()-imports this.
//
// It reports its value up through onValue rather than writing a hidden input of
// its own — one place owns the form field (the wrapper), so there is never a
// window with two inputs of the same name during the lazy load.

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { parseNoteBlocks } from "@/lib/noteBlocks";
import { parseRich, blocksToDoc, isEmptyDoc, type RichDoc } from "@/lib/richNote";

function docFor(value: string | null | undefined): RichDoc {
  return parseRich(value) ?? blocksToDoc(parseNoteBlocks(value));
}
function storageValue(doc: unknown): string {
  const s = JSON.stringify(doc);
  return isEmptyDoc(s) ? "" : s;
}

export default function RichEditorImpl({
  initialValue,
  placeholder,
  ariaLabel,
  onValue,
}: {
  initialValue?: string | null;
  placeholder?: string;
  ariaLabel?: string;
  /** Called with the note's storage string on every edit (JSON, or "" if empty). */
  onValue: (value: string) => void;
}) {
  const [empty, setEmpty] = useState(isEmptyDoc(initialValue));

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        codeBlock: false,
        blockquote: false,
      }),
    ],
    content: docFor(initialValue),
    editorProps: {
      attributes: {
        class: "rich-input",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
      handleKeyDown: (_view, event) => {
        if (event.key !== "Tab") return false;
        const ed = editorRef.current;
        if (!ed) return false;
        event.preventDefault();
        if (event.shiftKey) ed.chain().focus().liftListItem("listItem").run();
        else ed.chain().focus().sinkListItem("listItem").run();
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const value = storageValue(editor.getJSON());
      onValue(value);
      setEmpty(value === "");
    },
  });
  const editorRef = useRef<typeof editor>(null);
  editorRef.current = editor;

  const active = (fn: () => boolean) => (editor && fn() ? " on" : "");

  return (
    <div className="rich-field">
      <div className="rich-toolbar">
        <button
          type="button"
          className={"rich-btn" + (editor ? active(() => editor.isActive("bulletList")) : "")}
          title="Bullet list"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          • List
        </button>
        <button
          type="button"
          className={"rich-btn" + (editor ? active(() => editor.isActive("bold")) : "")}
          title="Bold"
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className={"rich-btn" + (editor ? active(() => editor.isActive("italic")) : "")}
          title="Italic"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <span className="rich-hint">Tab indents to a sub-bullet · Shift+Tab outdents</span>
      </div>
      <div className={"rich-editor" + (empty ? " is-empty" : "")} data-placeholder={placeholder ?? ""}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
