import { db } from '../db.js';
import { findPickerClashes, formatClashMessage } from '../college/sectionPicker.js';
import { enrollStudent, getRegistrationOverview } from './registrationService.js';
import { pickSection } from './teachingStaffService.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

async function assertNoSectionClashes(sectionIds) {
  const ids = [...new Set((sectionIds || []).map(Number).filter(Number.isFinite))];
  if (ids.length < 2) return;
  const meetings = await db.prepare(`
    SELECT m.day_of_week, m.start_time, m.end_time,
           s.id AS section_id, s.kind, s.code AS section_code,
           uc.course_code
    FROM section_meetings m
    INNER JOIN sections s ON s.id = m.section_id
    INNER JOIN course_offerings o ON o.id = s.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    WHERE s.id IN (${ids.map(() => '?').join(', ')})
  `).all(...ids);
  const clashes = findPickerClashes(meetings || []);
  if (clashes.length) httpError(409, formatClashMessage(clashes, false));
}

export async function confirmRegistrationSections(user, items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) httpError(400, 'Select at least one course');
  const sectionIds = list.flatMap((item) => [item?.theory_section_id, item?.practical_section_id]);
  await assertNoSectionClashes(sectionIds);
  for (const item of list) {
    const offeringId = parseInt(item?.offering_id, 10);
    if (!Number.isFinite(offeringId)) httpError(400, 'offering_id is required');
    try {
      await enrollStudent(user, offeringId);
    } catch (err) {
      if (!(err?.status === 400 && /Already enrolled/i.test(err.message || ''))) throw err;
    }
    const theoryId = parseInt(item?.theory_section_id, 10);
    const practicalId = parseInt(item?.practical_section_id, 10);
    if (Number.isFinite(theoryId)) await pickSection(user, theoryId);
    if (Number.isFinite(practicalId)) await pickSection(user, practicalId);
  }
  return getRegistrationOverview(user);
}
