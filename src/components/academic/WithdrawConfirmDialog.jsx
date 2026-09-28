import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { withdrawErrorMessage } from '@/lib/withdrawalErrors';

function copyFor(mode, course, ar) {
  if (mode === 'freeze') {
    return ar
      ? {
          title: 'تجميد الفصل',
          warning: 'سيتم سحب جميع موادك المسجّلة في هذا الفصل. تُخفى علاماتها ويظهر لها الحرف W، ولا تدخل في المعدل الفصلي ولا التراكمي، ولا يمكنك تنزيل مواد جديدة حتى فتح فصل جديد. لا يمكن التراجع عن هذه العملية.',
          confirm: 'تأكيد تجميد الفصل',
        }
      : {
          title: 'Freeze term',
          warning: 'All your enrolled courses this term will be withdrawn. Their marks are hidden and shown as W, they do not count toward semester or cumulative GPA, and you cannot register new courses until a new term opens. This cannot be undone.',
          confirm: 'Confirm term freeze',
        };
  }
  const name = course ? `${course.course_code} — ${course.course_name}` : '';
  return ar
    ? {
        title: 'سحب المادة',
        warning: `سيتم سحب المادة ${name}. تُخفى علاماتها ويظهر لها الحرف W، ولا تدخل في المعدل الفصلي ولا التراكمي، ولا يمكنك تنزيلها مجدداً إلا في فصل جديد. لا يمكن التراجع عن هذه العملية.`,
        confirm: 'تأكيد سحب المادة',
      }
    : {
        title: 'Withdraw course',
        warning: `${name} will be withdrawn. Its marks are hidden and shown as W, it does not count toward semester or cumulative GPA, and you can only register it again in a new term. This cannot be undone.`,
        confirm: 'Confirm withdrawal',
      };
}

export default function WithdrawConfirmDialog({ open, mode, course, ar, onOpenChange, onConfirm }) {
  const [universityId, setUniversityId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setUniversityId('');
      setPassword('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const copy = copyFor(mode, course, ar);

  const submit = async (e) => {
    e.preventDefault();
    if (!universityId.trim() || !password) {
      setError(ar ? 'أدخل رقمك الجامعي وكلمة المرور.' : 'Enter your university ID and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm({ university_id: universityId.trim(), password });
    } catch (err) {
      setError(withdrawErrorMessage(err, ar));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="rounded-3xl sm:max-w-md" data-testid="withdraw-dialog" data-mode={mode}>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {copy.title}
            </DialogTitle>
            <DialogDescription className="text-start leading-relaxed" data-testid="withdraw-dialog-warning">
              {copy.warning}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">
            {ar ? 'للأمان، أدخل رقمك الجامعي وكلمة المرور لتأكيد العملية.' : 'For security, enter your university ID and password to confirm.'}
          </p>
          <div className="space-y-1">
            <Label htmlFor="withdraw-university-id">{ar ? 'الرقم الجامعي' : 'University ID'}</Label>
            <Input
              id="withdraw-university-id"
              inputMode="numeric"
              autoComplete="off"
              value={universityId}
              onChange={(e) => setUniversityId(e.target.value)}
              className="rounded-xl"
              data-testid="withdraw-university-id"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="withdraw-password">{ar ? 'كلمة المرور' : 'Password'}</Label>
            <Input
              id="withdraw-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl"
              data-testid="withdraw-password"
            />
          </div>
          {error ? (
            <p className="text-sm font-medium text-destructive" role="alert" data-testid="withdraw-dialog-error">{error}</p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="rounded-xl" disabled={busy} onClick={() => onOpenChange(false)}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" variant="destructive" className="rounded-xl" disabled={busy} data-testid="withdraw-dialog-confirm">
              {busy ? (ar ? 'جارٍ التنفيذ...' : 'Working...') : copy.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
