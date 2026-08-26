"use client";

// The notes editor, rebuilt on TipTap (Tess, 2026-08-24: "go with TipTap"). It
// replaces the plain-text NotesField: bullets and sub-bullets are real editor
// structure you make with the toolbar and Tab / Shift-Tab, so what you see is
// what saves — no invisible leading spaces deciding nesting, no CSS list-marker
// tricks that cached wrong.
//
// It stays drop-in for the server-action forms: a hidden <input name=…> carries
// the note, so the form posts exactly as it did with the textarea. The value is
// TipTap JSON (see lib/richNote.ts) — or "" when the note is empty, so a cleared
// note reads as blank everywhere. An OLD plain-text note is imported into the
// editor via blocksToDoc(parseNoteBlocks(...)), so every existing note opens as
// the list it reads as and can be edited on.

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { parseNoteBlocks } from "@/lib/noteBlocks";
import { parseRich, blocksToDoc, docToText, isEmptyDoc, type RichDoc } from "@/lib/richNote";

/** The editor's starting content: the stored doc if rich, else the old plain-text
 *  note imported as a doc so it opens looking identical to how it rendered. */
function docFor(value: string | null | undefined): RichDoc {
  return parseRich(value) ?? blocksToDoc(parseNoteBlocks(value));
}

/** What to store for the current editor content: the JSON, or "" when empty. */
function storageValue(doc: unknown): string {
  const s = JSON.stringify(doc);
  return isEmptyDoc(s) ? "" : s;
}

export default function RichNotesField({
  name,
  defaultValue,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  /** Accepted for a drop-in signature with NotesField; the editor has its own box. */
  className?: string;
  rows?: number;
  "aria-label"?: string;
}) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(isEmptyDoc(defaultValue));

  const editor = useEditor({
    // Next renders this on the server first; TipTap must not render immediately or
    // it mismatches hydration.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        codeBlock: false,
        blockquote: false,
      }),
    ],
    content: docFor(defaultValue),
    editorProps: {
      attributes: {
        class: "rich-input",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
      // Tab nests the current bullet a level deeper; Shift-Tab lifts it back —
      // the two gestures people expect, and the only way to make a sub-bullet.
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
      if (hiddenRef.current) hiddenRef.current.value = value;
      setEmpty(value === "");
    },
  });
  // handleKeyDown closes over the editor before it exists; a ref bridges that.
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
      {/* The value the form actually posts — kept in step with the editor. Its
          initial value is the stored note (or "" if empty), so a submit that
          never touches the editor still saves what was there. */}
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        defaultValue={empty ? "" : storageValue(docFor(defaultValue))}
      />
      {/* className is accepted for signature parity; not applied to the box. */}
      <span hidden aria-hidden className={className} />
    </div>
  );
}

/** Re-export so callers can import the plain-text view of a value from one place. */
export { docToText };
