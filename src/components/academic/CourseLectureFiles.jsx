import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { mediaUrl } from '@/lib/mediaUrl';

function statusLabel(status, ar) {
  if (status === 'approved') return ar ? 'معتمد' : 'Approved';
  if (status === 'rejected') return ar ? 'مرفوض' : 'Rejected';
  return ar ? 'بانتظار المراجعة' : 'Pending';
}

function kindLabel(kind, ar) {
  return kind === 'practical' ? (ar ? 'عملي' : 'Practical') : (ar ? 'نظري' : 'Theory');
}

export default function CourseLectureFiles({
  lectures,
  ar,
  canUpload = false,
  canReview = false,
  onUpload,
  onDecide,
  busy = false,
}) {
  const items = lectures?.items || [];
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('theory');
  const [pdfName, setPdfName] = useState('');
  const [pdfBase64, setPdfBase64] = useState('');
  const [notes, setNotes] = useState({});

  const pickFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPdfName(file.name);
      setPdfBase64(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3" data-testid="course-lecture-files">
      <p className="text-sm font-medium">{ar ? 'ملفات المحاضرات' : 'Lecture files'}</p>
      {canUpload ? (
        <div className="rounded-xl border p-3 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{ar ? 'عنوان الملف' : 'Title'}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'النوع' : 'Kind'}</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="theory">{ar ? 'نظري' : 'Theory'}</SelectItem>
                  <SelectItem value="practical">{ar ? 'عملي' : 'Practical'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Input type="file" accept="application/pdf" className="rounded-xl" onChange={(e) => pickFile(e.target.files?.[0])} />
          {pdfName ? <p className="text-xs text-muted-foreground">{pdfName}</p> : null}
          <Button
            type="button"
            className="w-full rounded-xl"
            disabled={busy || !title.trim() || !pdfBase64}
            onClick={async () => {
              await onUpload?.({ title: title.trim(), kind, pdf_base64: pdfBase64, pdf_filename: pdfName });
              setTitle('');
              setPdfName('');
              setPdfBase64('');
            }}
          >
            {ar ? 'رفع للنائب للمراجعة' : 'Submit to the vice dean'}
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{ar ? 'لا ملفات محاضرة بعد.' : 'No lecture files yet.'}</p>
      ) : items.map((file) => (
        <div key={file.id} className="rounded-xl border p-3 space-y-2" data-testid={`lecture-file-${file.id}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">{file.title}</p>
              <p className="text-xs text-muted-foreground">{kindLabel(file.kind, ar)} · {file.file_name}</p>
            </div>
            <Badge variant={file.status === 'approved' ? 'default' : file.status === 'rejected' ? 'destructive' : 'outline'}>
              {statusLabel(file.status, ar)}
            </Badge>
          </div>
          {file.file_url ? (
            <a
              href={mediaUrl(file.file_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
              data-testid={`lecture-file-open-${file.id}`}
            >
              {ar ? 'فتح الملف ومعاينته' : 'Open and preview PDF'}
            </a>
          ) : null}
          {file.status === 'rejected' && file.review_note ? (
            <p className="text-xs text-destructive">{ar ? 'سبب الرفض:' : 'Rejection:'} {file.review_note}</p>
          ) : null}
          {canReview && file.status === 'pending' ? (
            <div className="space-y-2">
              <Input
                value={notes[file.id] || ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [file.id]: e.target.value }))}
                placeholder={ar ? 'ملاحظة الرفض إن وُجدت' : 'Rejection note if needed'}
                className="rounded-xl"
              />
              <div className="flex gap-2">
                <Button type="button" className="rounded-xl flex-1" disabled={busy} onClick={() => onDecide?.(file.id, 'approve')}>
                  {ar ? 'موافقة' : 'Approve'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl flex-1"
                  disabled={busy}
                  onClick={() => onDecide?.(file.id, 'reject', notes[file.id])}
                >
                  {ar ? 'رفض' : 'Reject'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
