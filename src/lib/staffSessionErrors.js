const MESSAGES = {
  staff_only: { ar: 'هذه الصفحة للمدرّسين والمعيدين فقط.', en: 'Teaching staff only.' },
  session_not_found: { ar: 'الجلسة غير موجودة أو ليست من جلساتك.', en: 'Session not found.' },
  already_checked_in: { ar: 'سُجّل حضورك في هذه الجلسة مسبقاً.', en: 'Attendance is already recorded for this session.' },
  session_not_open: { ar: 'هذه الجلسة غير متاحة لبدئها.', en: 'This session is not open for check-in.' },
  check_in_too_early: { ar: 'لم يُفتح زر «بدء الجلسة» بعد.', en: 'Check-in has not opened yet.' },
  check_in_closed: { ar: 'انتهى وقت الجلسة، ولا يمكن بدؤها الآن.', en: 'Check-in closed when the session ended.' },
  reason_required: { ar: 'اكتب سبب الغياب.', en: 'Write the reason for the absence.' },
  absence_already_notified: { ar: 'أبلغت عن غيابك في هذه الجلسة مسبقاً.', en: 'You already reported this absence.' },
  absence_notice_closed: { ar: 'الإبلاغ عن الغياب متاح قبل بدء الجلسة فقط.', en: 'Absence can only be reported before the session starts.' },
  request_already_pending: { ar: 'يوجد طلب معلّق لهذه الجلسة.', en: 'A pending request already exists for this session.' },
  makeup_already_requested: { ar: 'طلبت تعويضاً لهذه الجلسة مسبقاً.', en: 'A makeup was already requested for this session.' },
  makeup_deadline_passed: { ar: 'انتهت مهلة طلب التعويض لهذه الجلسة.', en: 'The makeup request deadline has passed.' },
  makeup_not_allowed: { ar: 'التعويض متاح فقط لجلسة غبت عنها أو أبلغت عن غيابك فيها.', en: 'A makeup can be requested only for a missed session or a reported absence.' },
  makeup_fields_required: { ar: 'حدّد تاريخ الجلسة التعويضية ووقت البداية والنهاية.', en: 'Choose the makeup date, start and end.' },
  makeup_time_order: { ar: 'وقت النهاية يجب أن يكون بعد وقت البداية.', en: 'The makeup must end after it starts.' },
  makeup_outside_term: { ar: 'تاريخ التعويض يجب أن يكون ضمن الفصل الحالي.', en: 'The makeup date must be inside the current term.' },
  makeup_in_past: { ar: 'موعد التعويض يجب أن يكون في المستقبل.', en: 'The makeup must be in the future.' },
  makeup_staff_clash: { ar: 'لديك جلسة أخرى في هذا الوقت.', en: 'You have another session at that time.' },
  makeup_room_clash: { ar: 'القاعة محجوزة في هذا الوقت. اختر وقتاً أو قاعة أخرى.', en: 'The room is booked at that time.' },
  request_not_found: { ar: 'الطلب غير موجود.', en: 'Request not found.' },
  request_not_pending: { ar: 'يمكن إلغاء الطلبات المعلّقة فقط.', en: 'Only pending requests can be cancelled.' },
  vda_only: { ar: 'هذا الإجراء لنائب العميد للشؤون الأكاديمية فقط.', en: 'Academic Vice Dean only.' },
  decision_invalid: { ar: 'القرار غير صالح.', en: 'Invalid decision.' },
  decision_note_required: { ar: 'اكتب سبب الرفض.', en: 'Write the reason for rejecting.' },
  session_already_held: { ar: 'بدأ المدرّس هذه الجلسة فعلاً، فلا يمكن اعتماد الغياب.', en: 'The staff member already started this session.' },
  session_without_staff: { ar: 'لا يوجد مدرّس محدد لهذه الجلسة.', en: 'This session has no assigned staff member.' },
  attendance_status_invalid: { ar: 'اختر حالة الحضور.', en: 'Choose an attendance status.' },
  attendance_note_required: { ar: 'اكتب ملاحظة توضّح سبب التعديل.', en: 'Write a note explaining the change.' },
  late_minutes_invalid: { ar: 'دقائق التأخير يجب أن تكون بين 1 و300.', en: 'Late minutes must be from 1 to 300.' },
  attendance_before_start: { ar: 'لا يمكن تسجيل الحضور قبل بدء الجلسة. يمكنك فقط اعتبارها غياباً بعذر.', en: 'Attendance can be set only after the session starts.' },
};

export const VDA_MESSAGES = {
  makeup_staff_clash: { ar: 'للمدرّس أو المعيد جلسة أخرى في هذا الوقت.', en: 'The staff member has another session at that time.' },
  request_not_pending: { ar: 'اتُّخذ قرار في هذا الطلب مسبقاً.', en: 'This request was already decided.' },
  session_not_found: { ar: 'الجلسة غير موجودة أو ليست من كليتك.', en: 'Session not found.' },
};

export function staffSessionErrorMessage(error, ar, overrides = null) {
  const data = error?.response?.data;
  const entry = data?.code ? (overrides?.[data.code] || MESSAGES[data.code]) : null;
  if (entry) return ar ? entry.ar : (data.detail || entry.en);
  if (typeof data?.detail === 'string' && data.detail) return data.detail;
  return ar ? 'تعذّر إتمام العملية' : 'Could not complete the request';
}
