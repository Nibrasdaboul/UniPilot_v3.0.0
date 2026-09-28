ALTER TABLE course_work_marks DROP CONSTRAINT IF EXISTS course_work_marks_component_check;
ALTER TABLE course_work_marks ADD CONSTRAINT course_work_marks_component_check
  CHECK (component = ANY (ARRAY['midterm_theory'::text, 'sai_theory'::text, 'practical'::text, 'final_theory'::text]));
