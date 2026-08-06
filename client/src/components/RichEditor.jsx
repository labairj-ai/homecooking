import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import './RichEditor.css';

function ToolbarBtn({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      className={`rt-btn${active ? ' active' : ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

export default function RichEditor({ value, onChange, placeholder }) {
  const lastExternal = useRef(value);

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: value || '',
    editorProps: {
      attributes: { 'data-placeholder': placeholder || '' },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      lastExternal.current = html;
      onChange(html);
    },
  });

  // Sync when parent loads async data (e.g. edit form)
  useEffect(() => {
    if (!editor) return;
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      editor.commands.setContent(value || '');
    }
  }, [editor, value]);

  if (!editor) return null;

  const e = editor;

  return (
    <div className="rich-editor">
      <div className="rt-toolbar">
        <ToolbarBtn onClick={() => e.chain().focus().toggleBold().run()} active={e.isActive('bold')} title="Bold"><b>B</b></ToolbarBtn>
        <ToolbarBtn onClick={() => e.chain().focus().toggleItalic().run()} active={e.isActive('italic')} title="Italic"><i>I</i></ToolbarBtn>
        <ToolbarBtn onClick={() => e.chain().focus().toggleUnderline().run()} active={e.isActive('underline')} title="Underline"><u>U</u></ToolbarBtn>
        <span className="rt-divider" />
        <ToolbarBtn onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} active={e.isActive('heading', { level: 2 })} title="Heading 2">H2</ToolbarBtn>
        <ToolbarBtn onClick={() => e.chain().focus().toggleHeading({ level: 3 }). run()} active={e.isActive('heading', { level: 3 })} title="Heading 3">H3</ToolbarBtn>
        <span className="rt-divider" />
        <ToolbarBtn onClick={() => e.chain().focus().toggleBulletList().run()} active={e.isActive('bulletList')} title="Bullet list">• List</ToolbarBtn>
        <ToolbarBtn onClick={() => e.chain().focus().toggleOrderedList().run()} active={e.isActive('orderedList')} title="Numbered list">1. List</ToolbarBtn>
        <span className="rt-divider" />
        <ToolbarBtn onClick={() => e.chain().focus().toggleBlockquote().run()} active={e.isActive('blockquote')} title="Blockquote">"</ToolbarBtn>
        <span className="rt-divider" />
        <ToolbarBtn onClick={() => e.chain().focus().undo().run()} title="Undo">↩</ToolbarBtn>
        <ToolbarBtn onClick={() => e.chain().focus().redo().run()} title="Redo">↪</ToolbarBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
