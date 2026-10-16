import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { IconButton } from '../ui/Button';

interface Props {
  onChange: (html: string, isEmpty: boolean) => void;
  placeholder?: string;
}

export function RichTextEditor({ onChange, placeholder = 'Type Your Reply...' }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: { attributes: { class: 'rich-text text-xs leading-relaxed' } },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.isEmpty),
  });

  return (
    <div className="flex min-h-80 flex-1 flex-col rounded-lg bg-[#f9f9f9] p-2.5">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="flex-1 cursor-text px-1.5 pt-3" onClick={() => editor?.commands.focus()} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus();
  const align = (['left', 'center', 'right'] as const).find((a) => editor.isActive({ textAlign: a })) ?? 'left';
  const nextAlign = { left: 'center', center: 'right', right: 'left' } as const;
  const AlignIcon = { left: AlignLeft, center: AlignCenter, right: AlignRight }[align];
  const level = editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : 'p';

  const btn = (label: string, Icon: LucideIcon, run: () => void, active = false, disabled = false) => (
    <IconButton key={label} aria-label={label} title={label} active={active} disabled={disabled} onClick={run}>
      <Icon className="size-3.5" />
    </IconButton>
  );
  const sep = (k: string) => <span key={k} className="mx-1 h-4 w-px bg-line" />;

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-md bg-white px-2 py-1">
      {btn('Undo', Undo2, () => chain().undo().run(), false, !editor.can().undo())}
      {btn('Redo', Redo2, () => chain().redo().run(), false, !editor.can().redo())}
      {sep('s1')}
      <select
        aria-label="Text size"
        value={level}
        onChange={(e) =>
          e.target.value === 'p'
            ? chain().setParagraph().run()
            : chain().toggleHeading({ level: Number(e.target.value) as 2 | 3 }).run()
        }
        className="h-7 rounded-md bg-transparent px-1 text-xs text-muted outline-none hover:bg-field"
      >
        <option value="p">Tт Normal</option>
        <option value="3">Tт Large</option>
        <option value="2">Tт Huge</option>
      </select>
      {sep('s2')}
      {btn('Bold', Bold, () => chain().toggleBold().run(), editor.isActive('bold'))}
      {btn('Italic', Italic, () => chain().toggleItalic().run(), editor.isActive('italic'))}
      {btn('Underline', UnderlineIcon, () => chain().toggleUnderline().run(), editor.isActive('underline'))}
      {sep('s3')}
      {btn(`Align ${nextAlign[align]}`, AlignIcon, () => chain().setTextAlign(nextAlign[align]).run(), align !== 'left')}
      {sep('s4')}
      {btn('Numbered list', ListOrdered, () => chain().toggleOrderedList().run(), editor.isActive('orderedList'))}
      {btn('Bullet list', List, () => chain().toggleBulletList().run(), editor.isActive('bulletList'))}
      {btn('Indent', IndentIncrease, () => chain().sinkListItem('listItem').run(), false, !editor.can().sinkListItem('listItem'))}
      {btn('Outdent', IndentDecrease, () => chain().liftListItem('listItem').run(), false, !editor.can().liftListItem('listItem'))}
      {btn('Quote', Quote, () => chain().toggleBlockquote().run(), editor.isActive('blockquote'))}
      {sep('s5')}
      {btn('Strikethrough', Strikethrough, () => chain().toggleStrike().run(), editor.isActive('strike'))}
    </div>
  );
}
