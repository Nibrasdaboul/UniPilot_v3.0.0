import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Lock, Layers, Snowflake } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';
import RegistrationCourseCard from '@/components/academic/RegistrationCourseCard';
import WithdrawConfirmDialog from '@/components/academic/WithdrawConfirmDialog';
import { formatWindowTime } from '@/lib/withdrawalWindowStatus';
import { Button } from '@/components/ui/button';
import { readRegistrationCart, removeFromRegistrationCart, toggleRegistrationCart, writeRegistrationCart } from '@/lib/registrationCart';

function closedWindowCopy(kind, ar) {
  if (kind === 'no_term') {
    return ar
      ? { title: 'التسجيل مغلق', body: 'لا يوجد فصل دراسي حالي مفتوح. لا يمكنك تنزيل المواد الآن.' }
      : { title: 'Registration is closed', body: 'There is no current academic term. You cannot register for courses.' };
  }
  if (kind === 'not_eligible') {
    return ar
      ? { title: 'لا يمكنك التسجيل الآن', body: 'نافذة التسجيل مفتوحة لغيرك، لكنك لا تستوفي شروطها بعد. لا يمكنك تنزيل المواد.' }
      : { title: 'You cannot register now', body: 'A registration window is open, but you do not meet its requirements yet.' };
  }
  return ar
    ? {
        title: 'التسجيل أُغلق بالفعل',
        body: 'لا يمكنك تنزيل المواد لأن نافذة التسجيل قد أُغلقت. تصفّح القائمة فقط حتى يعيد العميد أو نائب الشؤون الأكاديمية فتح النافذة.',
      }
    : {
        title: 'Registration is already closed',
        body: 'You cannot register for courses because the registration window has been closed. Browse the list only until the dean or academic vice dean opens it again.',
      };
}

export default function Registration() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [cart, setCart] = useState(() => readRegistrationCart());
  const [withdrawTarget, setWithdrawTarget] = useState(null);

  const load = async () => {
    try {
      const regRes = await api.get('/academic/registration');
      const next = regRes.data || null;
      setData(next);
      const allowed = new Set(
        (next?.courses || [])
          .filter((c) => c.eligible && c.offered && c.offering_id)
          .map((c) => Number(c.id)),
      );
      setCart(writeRegistrationCart(readRegistrationCart().filter((id) => allowed.has(id))));
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل التسجيل' : 'Failed to load registration'));
    }
  };

  useEffect(() => { load(); }, []);

  const toggleCourse = (course) => {
    if (!data?.can_enroll || !course?.eligible || !course?.offered || !course?.offering_id) return;
    setCart(toggleRegistrationCart(course.id));
  };

  const openSections = () => {
    if (!data?.can_enroll) {
      toast.error(ar ? 'نافذة التسجيل مغلقة' : 'Registration window is closed');
      return;
    }
    if (!cart.length) {
      toast.error(ar ? 'اختر مادة واحدة على الأقل' : 'Select at least one course');
      return;
    }
    navigate('/registration/sections');
  };

  const drop = async (offeringId) => {
    if (!confirm(ar ? 'إلغاء تسجيل هذه المادة؟' : 'Cancel registration for this course?')) return;
    setBusy(offeringId);
    try {
      const res = await api.post('/academic/registration/drop', { offering_id: offeringId });
      setData(res.data);
      const dropped = (data?.courses || []).find((c) => Number(c.offering_id) === Number(offeringId));
      if (dropped) setCart(removeFromRegistrationCart(dropped.id));
      toast.success(ar ? 'تم إلغاء التسجيل' : 'Registration cancelled');
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل إلغاء التسجيل' : 'Cancel failed'));
    } finally {
      setBusy(null);
    }
  };

  const confirmWithdraw = async (credentials) => {
    const target = withdrawTarget;
    if (!target) return;
    const res = target.mode === 'freeze'
      ? await api.post('/academic/registration/freeze', credentials)
      : await api.post('/academic/registration/withdraw', { ...credentials, offering_id: target.course.offering_id });
    setData(res.data);
    if (target.mode === 'freeze') {
      writeRegistrationCart([]);
      setCart([]);
    } else {
      setCart(removeFromRegistrationCart(target.course.id));
    }
    setWithdrawTarget(null);
    toast.success(target.mode === 'freeze'
      ? (ar ? 'تم تجميد الفصل وسحب جميع موادك' : 'Term frozen. All courses withdrawn.')
      : (ar ? `تم سحب المادة ${target.course.course_code} (W)` : `${target.course.course_code} withdrawn (W)`));
  };

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="registration-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6" />
            {ar ? 'تسجيل المواد' : 'Course registration'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {ar
              ? 'اختر المواد التي تريد تنزيلها (الزر يتحوّل للأخضر)، ثم اضغط تسجيل الشعب أسفل الصفحة.'
              : 'Select the courses you want (the button turns green), then tap Register sections at the bottom.'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="destructive"
            className="rounded-xl font-bold"
            disabled={!data?.can_freeze || busy != null}
            onClick={() => setWithdrawTarget({ mode: 'freeze', course: null })}
            data-testid="registration-freeze"
          >
            <Snowflake className="w-4 h-4" />
            {ar ? 'تجميد الفصل' : 'Freeze term'}
          </Button>
          {data && !data.can_freeze && !data.term_frozen ? (
            <span className="text-xs text-muted-foreground" data-testid="registration-freeze-hint">
              {data.withdraw_open
                ? (ar ? 'لا توجد مواد مسجّلة لتجميدها.' : 'No enrolled courses to freeze.')
                : (ar ? 'يتفعّل عند فتح نافذة السحب.' : 'Unlocks when the withdrawal window opens.')}
            </span>
          ) : null}
        </div>
      </div>

      {data?.term_frozen ? (
        <div
          className="rounded-2xl border border-muted-foreground/30 bg-muted/60 p-4 space-y-1"
          data-testid="registration-frozen-banner"
        >
          <p className="font-semibold flex items-center gap-2">
            <Snowflake className="w-4 h-4" />
            {ar ? 'الفصل مجمّد' : 'Term frozen'}
          </p>
          <p className="text-sm text-muted-foreground">
            {ar
              ? 'سحبت جميع مواد هذا الفصل. لا يمكنك تنزيل مواد جديدة حتى فتح فصل جديد.'
              : 'All courses this term are withdrawn. You cannot register new courses until a new term opens.'}
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'حالة النافذة' : 'Window status'}</CardTitle>
          <CardDescription>
            {data?.term ? (ar ? `الفصل الحالي: ${data.term.name}` : `Current term: ${data.term.name}`) : (ar ? 'لا يوجد فصل حالي مفتوح.' : 'No current term is open.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {data?.open ? (
              <Badge>{ar ? 'التسجيل مفتوح' : 'Registration open'}</Badge>
            ) : (
              <Badge variant="outline">{ar ? 'التسجيل مغلق' : 'Registration closed'}</Badge>
            )}
            {data?.window && (
              <Badge variant="secondary">
                {data.window.name} · {data.window.opens_at ? String(data.window.opens_at).slice(0, 16).replace('T', ' ') : ''}
                {data.window.closes_at ? ` → ${String(data.window.closes_at).slice(0, 16).replace('T', ' ')}` : ''}
              </Badge>
            )}
            {data?.withdraw_open ? (
              <Badge variant="destructive" data-testid="registration-withdraw-open">
                {ar ? 'نافذة السحب مفتوحة' : 'Withdrawal open'}
                {data.withdrawal_window?.closes_at ? ` · ${ar ? 'حتى' : 'until'} ${formatWindowTime(data.withdrawal_window.closes_at)}` : ''}
              </Badge>
            ) : (
              <Badge variant="outline" data-testid="registration-withdraw-closed">
                {ar ? 'نافذة السحب مغلقة' : 'Withdrawal closed'}
              </Badge>
            )}
            <Badge variant="outline">
              {ar ? 'ساعات مسجلة' : 'Registered'}: {data?.registered_credits ?? 0}
              {data?.max_credits != null ? ` / ${data.max_credits}` : ''}
            </Badge>
          </div>
          {data && !data.open && (
            <div
              className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-1"
              data-testid="registration-closed-banner"
            >
              <p className="font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4" />
                {closedWindowCopy(data?.closed_kind, ar).title}
              </p>
              <p className="text-sm text-muted-foreground">
                {closedWindowCopy(data?.closed_kind, ar).body}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {(data?.courses || []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{ar ? 'لا توجد مواد في خطة الكلية.' : 'No catalog courses for this college.'}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="registration-course-cards">
          {data.courses.map((course) => (
            <RegistrationCourseCard
              key={course.id}
              course={course}
              ar={ar}
              canEnroll={Boolean(data.can_enroll)}
              busy={busy}
              selected={cart.includes(Number(course.id))}
              onToggle={toggleCourse}
              onDrop={drop}
              canWithdraw={Boolean(data.can_withdraw)}
              onWithdraw={(c) => setWithdrawTarget({ mode: 'withdraw', course: c })}
            />
          ))}
        </div>
      )}

      <WithdrawConfirmDialog
        open={withdrawTarget != null}
        mode={withdrawTarget?.mode || 'withdraw'}
        course={withdrawTarget?.course || null}
        ar={ar}
        onOpenChange={(next) => { if (!next) setWithdrawTarget(null); }}
        onConfirm={confirmWithdraw}
      />

      <div className="sticky bottom-4 z-10">
        <Button
          className="w-full rounded-2xl h-12 font-bold text-base shadow-lg"
          disabled={!data?.can_enroll || cart.length === 0}
          onClick={openSections}
          data-testid="registration-open-sections"
        >
          <Layers className="w-5 h-5" />
          {ar ? 'تسجيل الشعب' : 'Register sections'}
          {cart.length ? ` (${cart.length})` : ''}
        </Button>
      </div>
    </div>
  );
}
