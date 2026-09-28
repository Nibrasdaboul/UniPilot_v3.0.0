import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function roleLabel(role, ar) {
  if (role === 'vice_dean_academic') return ar ? 'نائب أكاديمي' : 'Vice dean';
  if (role === 'teaching_assistant' || role === 'engineer') return ar ? 'معيد' : 'TA';
  if (role === 'instructor' || role === 'doctor') return ar ? 'مدرّس' : 'Instructor';
  return role || '';
}

export default function CourseStaffChat({
  chat,
  ar,
  canChat = false,
  onSend,
  busy = false,
}) {
  const items = chat?.items || [];
  const [text, setText] = useState('');
  const [pending, setPending] = useState(null);
  const endRef = useRef(null);
  const shown = pending && !items.some((msg) => msg.mine && msg.body === pending.body)
    ? [...items, pending]
    : items;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [shown.length]);

  useEffect(() => {
    if (pending && items.some((msg) => msg.mine && msg.body === pending.body)) {
      setPending(null);
    }
  }, [items, pending]);

  return (
    <div className="space-y-2" data-testid="course-staff-chat">
      <p className="text-xs text-muted-foreground">
        {ar
          ? 'فورية: الرسالة تظهر فور الإرسال، والرسائل الجديدة تصل دون إعادة تحميل.'
          : 'Realtime: your message appears immediately, and incoming messages arrive without reload.'}
      </p>
      <div className="rounded-xl border max-h-[28rem] overflow-y-auto p-3 space-y-2 bg-muted/20">
        {shown.length === 0 ? (
          <p className="text-xs text-muted-foreground">{ar ? 'لا رسائل بعد.' : 'No messages yet.'}</p>
        ) : shown.map((msg) => (
          <div key={msg.id} className={`text-sm ${msg.mine ? 'text-end' : 'text-start'}`} data-testid={`chat-msg-${msg.id}`}>
            <p className="text-xs text-muted-foreground">
              {msg.full_name || '—'} · {roleLabel(msg.role, ar)}
            </p>
            <p className={`inline-block rounded-xl px-3 py-1.5 ${msg.mine ? 'bg-primary text-primary-foreground' : 'bg-background border'}`}>
              {msg.body}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {canChat ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const body = text.trim();
            if (!body) return;
            setPending({
              id: `pending-${Date.now()}`,
              body,
              mine: true,
              full_name: ar ? 'أنت' : 'You',
              role: '',
            });
            setText('');
            Promise.resolve(onSend?.(body)).catch(() => setPending(null));
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={ar ? 'اكتب رسالة للكادر والنائب' : 'Write to staff and the vice dean'}
            className="rounded-xl"
            disabled={busy}
            data-testid="course-chat-input"
          />
          <Button type="submit" className="rounded-xl" disabled={busy || !text.trim()}>
            {ar ? 'إرسال' : 'Send'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
