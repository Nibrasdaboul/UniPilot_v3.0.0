import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Clock, XCircle, CalendarClock, RefreshCw } from 'lucide-react';

function sessionStatusBadge(s) {
  if (s.kind === 'makeup') return <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50">تعويضية</Badge>;
  if (s.status === 'cancelled') return <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50">ملغاة</Badge>;
  if (s.status === 'absent')   return <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-50">غاب الكادر</Badge>;
  if (s.status === 'held')     return <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">مُنعقدت</Badge>;
  if (s.status === 'late')     return <Badge variant="outline" className="text-yellow-700 border-yellow-300 bg-yellow-50">تأخّر</Badge>;
  return <Badge variant="outline" className="text-slate-600 border-slate-300">مجدولة</Badge>;
}

// -----------------------------------------------------------------------

function SessionCard({ session, onReport, reporting }) {
  const canReport = session.can_report;
  const alreadyReported = session.already_reported;

  return (
    <div className="flex flex-col gap-1 border rounded-lg p-3 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {sessionStatusBadge(session)}
          <span className="font-semibold text-sm">{session.course_code}</span>
          <span className="text-xs text-muted-foreground">{session.course_name?.trim()}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {session.session_date} · {session.start_time}–{session.end_time}
          {session.room ? ` · ${session.room}` : ''}
        </div>
      </div>

      {session.kind === 'makeup' && session.makeup_for_date && (
        <div className="text-xs text-blue-600 mt-0.5">
          تعويض لجلسة {session.makeup_for_date}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap mt-1">
        <div className="text-xs text-muted-foreground">
          {session.section_code ? `قسم ${session.section_code}` : ''}
          {session.report_count > 0 && (
            <span className="ms-2 text-red-600">· {session.report_count} {session.report_count === 1 ? 'بلاغ' : 'بلاغات'}</span>
          )}
        </div>
        {canReport && (
          <Button
            size="sm"
            variant="destructive"
            disabled={reporting}
            onClick={() => onReport(session.id)}
            className="text-xs h-7"
          >
            {reporting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <AlertCircle className="h-3 w-3 me-1" />}
            المدرّس لم يحضر
          </Button>
        )}
        {alreadyReported && (
          <span className="text-xs text-green-700 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> أرسلت بلاغاً
          </span>
        )}
      </div>
    </div>
  );
}

export default function StudentClassSessions() {
  const { api } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [reportMsg, setReportMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/academic/student/class-sessions');
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const handleReport = async (sessionId) => {
    setReporting(sessionId);
    setReportMsg(null);
    try {
      const r = await api.post(`/academic/student/class-sessions/${sessionId}/report`);
      setReportMsg({ ok: true, text: `تم إرسال البلاغ. إجمالي البلاغات: ${r.data.report_count}` });
      await load();
    } catch (e) {
      const code = e?.response?.data?.code;
      const msgs = {
        report_too_early: `لم يمضِ وقت كافٍ بعد بداية الجلسة. يرجى الانتظار.`,
        report_closed: 'انتهى وقت التبليغ (بعد نهاية الجلسة).',
        already_reported: 'أرسلت بلاغاً بالفعل لهذه الجلسة.',
        session_not_found: 'لم يتم العثور على الجلسة.',
        session_not_open: 'لا يمكن التبليغ — الجلسة لم تعد مجدولة.',
      };
      setReportMsg({ ok: false, text: msgs[code] || e?.response?.data?.detail || e?.message || 'حدث خطأ عند الإرسال' });
    } finally {
      setReporting(null);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
      <RefreshCw className="h-4 w-4 animate-spin" /> جارٍ التحميل...
    </div>
  );

  if (error) return (
    <div className="text-sm text-red-600 py-2 flex items-center gap-2">
      <XCircle className="h-4 w-4" /> {error}
    </div>
  );

  if (!data?.term) return null;

  const sessions = data.sessions || [];
  const todaySessions = sessions.filter(s => s.session_date === data.now?.slice(0, 10) && s.kind !== 'makeup');
  const makeups = sessions.filter(s => s.kind === 'makeup');
  const cancelled = sessions.filter(s => s.status === 'cancelled' || s.status === 'absent');

  if (!sessions.length) return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          جلسات الفصل
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">لا توجد جلسات ملغاة أو تعويضية هذا الفصل.</p>
      </CardContent>
    </Card>
  );

  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            جلسات الفصل — {data.term.name}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load} className="h-7 px-2">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        {reportMsg && (
          <div className={`text-sm mt-1 flex items-center gap-1 ${reportMsg.ok ? 'text-green-700' : 'text-red-600'}`}>
            {reportMsg.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            {reportMsg.text}
          </div>
        )}
        {data.settings?.student_report_after_minutes && (
          <p className="text-xs text-muted-foreground mt-0.5">
            <Clock className="inline h-3 w-3 me-0.5" />
            يمكن إرسال بلاغ بعد {data.settings.student_report_after_minutes} دقيقة من بدء الجلسة
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {todaySessions.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-slate-700">جلسات اليوم</h3>
            <div className="flex flex-col gap-2">
              {todaySessions.map(s => (
                <SessionCard key={s.id} session={s} onReport={handleReport} reporting={reporting === s.id} />
              ))}
            </div>
          </div>
        )}
        {makeups.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-blue-700">الجلسات التعويضية</h3>
            <div className="flex flex-col gap-2">
              {makeups.map(s => (
                <SessionCard key={s.id} session={s} onReport={handleReport} reporting={reporting === s.id} />
              ))}
            </div>
          </div>
        )}
        {cancelled.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-red-700">الجلسات الملغاة / الغيابات</h3>
            <div className="flex flex-col gap-2">
              {cancelled.map(s => (
                <SessionCard key={s.id} session={s} onReport={handleReport} reporting={reporting === s.id} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
