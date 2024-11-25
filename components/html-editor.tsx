import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';

const QuillEditor = dynamic(() => import('react-quill'), {
  ssr: false,
  loading: () => <p>Loading editor...</p>
});

interface HtmlEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function HtmlEditor({ value = '', onChange }: HtmlEditorProps) {
  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link', 'image'],
      ['clean']
    ],
  };

  return (
    <QuillEditor
      theme="snow"
      value={value}
      onChange={onChange}
      modules={modules}
      className="min-h-[200px]"
    />
  );
} 