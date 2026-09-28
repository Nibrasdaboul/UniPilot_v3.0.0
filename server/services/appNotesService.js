import { db } from '../db.js';
import { getGradeStatus, markToLetter } from '../lib/gradeUtils.js';

export const RECOMMENDATIONS = {
  high_risk_ar: 'توصية: علامتك في هذه المادة منخفضة جداً. ننصحك بمراجعة المحتوى وزيادة ساعات الدراسة والاستعانة بالمراجع أو الأستاذ.',
  at_risk_ar: 'توصية: علامتك تحتاج تحسيناً. ننصحك بمراجعة الدروس والتركيز على النقاط الضعيفة لرفع المعدل.',
  general_ar: 'لديك أكثر من مادة تحتاج تركيزاً. ننصحك بترتيب أولويات المراجعة وزيادة ساعات الدراسة للمواد الحرجة.',
};

export const ENCOURAGEMENT = {
  safe: '💪 تشجيع: مستواك ممتاز. حافظ على هذا الانضباط والجدية، أنت على الطريق الصحيح.',
  normal: '✨ تشجيع: أداؤك جيد. واصل المراجعة والمثابرة لتحافظ على تقدمك وتطوّره.',
  at_risk: '🌟 تشجيع: لا تستسلم. كل تحسن يبدأ بخطوة؛ ركّز على نقاط التحسين وستلاحظ الفرق.',
  high_risk: '❤️ تشجيع: الإحباط طبيعي، لكنك أقوى منه. خذ وقتك، راجع خطوة بخطوة، ونحن معك.',
};

export function buildAppNoteContent(courseName, finalMark, { published = false } = {}) {
  const status = getGradeStatus(finalMark);
  const statusLabels = { safe: 'آمن', normal: 'وضع عادي', at_risk: 'خطر', high_risk: 'خطر عالي' };
  const letter = finalMark != null ? markToLetter(finalMark) : '—';
  let content = '';
  if (published) {
    content += 'نُشرت علامات هذه المادة من نائب العميد للشؤون الأكاديمية.\n\n';
  }
  content += finalMark != null
    ? `المادة: ${courseName}. العلامة: ${finalMark}، التقدير: ${letter}. الوضع: ${statusLabels[status] || status}.`
    : `المادة: ${courseName}. لم تُدخل علامات بعد.`;
  if (finalMark != null) {
    if (status === 'high_risk' || status === 'at_risk') {
      content += '\n\n' + (status === 'high_risk' ? RECOMMENDATIONS.high_risk_ar : RECOMMENDATIONS.at_risk_ar);
    }
    content += '\n\n' + (ENCOURAGEMENT[status] || ENCOURAGEMENT.normal);
  }
  return content;
}

export async function upsertAppNoteForCourse(userId, studentCourseId, courseName, finalMark, options = {}) {
  const existing = await db.prepare(
    'SELECT id, note_category FROM notes WHERE user_id = ? AND student_course_id = ? AND type = ?'
  ).get(userId, studentCourseId, 'app');
  const published = Boolean(options.published || existing?.note_category === 'course_work_published');
  const content = buildAppNoteContent(courseName, finalMark, { published });
  const status = getGradeStatus(finalMark);
  const category = published ? 'course_work_published' : (existing?.note_category || null);
  if (existing) {
    await db.prepare('UPDATE notes SET content = ?, note_category = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?').run(content, category, existing.id);
  } else {
    await db.prepare('INSERT INTO notes (user_id, student_course_id, content, type, note_category) VALUES (?, ?, ?, ?, ?)').run(userId, studentCourseId, content, 'app', category);
  }

  try {
    const title = `تحليل أداء جديد لمادة ${courseName}`;
    const type = status === 'high_risk' || status === 'at_risk' ? 'warning' : 'info';
    const link = `/courses/${studentCourseId}`;
    const source = options.published ? 'course_work_published' : 'app_note_course';
    if (options.published || !existing) {
      await db.prepare(
        'INSERT INTO notifications (user_id, title, body, type, link, source) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(userId, title, content.slice(0, 600), type, link, source);
    }
  } catch (_) {}
  return content;
}

export async function upsertGeneralAppNote(userId, contentAr) {
  const existing = await db.prepare('SELECT id FROM notes WHERE user_id = ? AND type = ? AND student_course_id IS NULL').get(userId, 'app');
  if (existing) {
    await db.prepare('UPDATE notes SET content = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?').run(contentAr, existing.id);
  } else {
    await db.prepare('INSERT INTO notes (user_id, student_course_id, content, type) VALUES (?, NULL, ?, ?)').run(userId, contentAr, 'app');
  }

  try {
    const title = 'تحديث جديد لتحليل أدائك الأكاديمي';
    await db.prepare(
      'INSERT INTO notifications (user_id, title, body, type, link, source) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, title, contentAr.slice(0, 600), 'info', '/analytics', 'app_note_general');
  } catch (_) {}
}

export async function refreshGeneralAppNote(userId) {
  const graded = await db.prepare(
    'SELECT current_grade FROM student_courses WHERE user_id = ? AND current_grade IS NOT NULL'
  ).all(userId);
  let atRiskCount = 0;
  for (const course of graded || []) {
    const status = getGradeStatus(course.current_grade);
    if (status === 'at_risk' || status === 'high_risk') atRiskCount += 1;
  }
  if (atRiskCount >= 2) {
    await upsertGeneralAppNote(userId, RECOMMENDATIONS.general_ar + '\n\n' + ENCOURAGEMENT.high_risk);
    return;
  }
  await db.prepare(
    "DELETE FROM notes WHERE user_id = ? AND type = 'app' AND student_course_id IS NULL AND (note_category IS NULL OR note_category = '')"
  ).run(userId);
}

export async function notifyPublishedCourseWork(userId, studentCourseId, courseName, percent) {
  await upsertAppNoteForCourse(userId, studentCourseId, courseName, percent, { published: true });
  await refreshGeneralAppNote(userId);
}
