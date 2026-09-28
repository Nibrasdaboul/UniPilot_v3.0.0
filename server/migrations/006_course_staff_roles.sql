ALTER TABLE course_staff DROP CONSTRAINT IF EXISTS course_staff_staff_role_check;
ALTER TABLE course_staff ADD CONSTRAINT course_staff_staff_role_check
  CHECK (staff_role = ANY (ARRAY['doctor'::text, 'engineer'::text, 'instructor'::text, 'teaching_assistant'::text]));
