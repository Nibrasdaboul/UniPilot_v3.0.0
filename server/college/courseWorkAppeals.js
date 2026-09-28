import { COURSE_WORK_COMPONENTS, parseCourseWorkComponent } from './courseWorkGrades.js';

export const COURSE_WORK_APPEAL_STATUSES = ['pending', 'accepted', 'rejected'];

export function parseAppealReason(value) {
  const reason = String(value || '').trim();
  if (reason.length < 5) return { error: 'reason must be at least 5 characters' };
  if (reason.length > 2000) return { error: 'reason is too long' };
  return { error: null, reason };
}

export function parseAppealDecision(value) {
  const decision = String(value || '').trim().toLowerCase();
  if (decision === 'accept' || decision === 'accepted') return { error: null, decision: 'accepted' };
  if (decision === 'reject' || decision === 'rejected') return { error: null, decision: 'rejected' };
  return { error: 'decision must be accept or reject' };
}

export function componentLabel(component, ar) {
  const hit = COURSE_WORK_COMPONENTS.find((c) => c.key === component);
  if (!hit) return component || '—';
  return ar ? hit.ar : hit.en;
}

export function publicAppeal(row) {
  const status = COURSE_WORK_APPEAL_STATUSES.includes(row?.status) ? row.status : 'pending';
  return {
    id: row?.id != null ? Number(row.id) : null,
    catalog_course_id: row?.catalog_course_id != null ? Number(row.catalog_course_id) : null,
    user_id: row?.user_id != null ? Number(row.user_id) : null,
    full_name: row?.full_name || null,
    person_code: row?.person_code || null,
    component: row?.component || null,
    reason: row?.reason || '',
    status,
    decision_note: row?.decision_note || null,
    created_at: row?.created_at || null,
    decided_at: row?.decided_at || null,
    can_appeal: false,
    used: true,
    tone: status === 'rejected' ? 'danger' : (status === 'pending' ? 'muted' : 'muted'),
    label_ar: status === 'rejected' ? 'العلامة صحيحة' : (status === 'pending' ? 'قيد المراجعة' : 'تم الاعتراض'),
    label_en: status === 'rejected' ? 'The mark is correct' : (status === 'pending' ? 'Under review' : 'Already appealed'),
  };
}

export function appealActionForComponent(appeal) {
  if (!appeal) {
    return {
      can_appeal: true,
      used: false,
      status: null,
      tone: 'default',
      label_ar: 'اعتراض',
      label_en: 'Appeal',
    };
  }
  return publicAppeal(appeal);
}

export { parseCourseWorkComponent };
