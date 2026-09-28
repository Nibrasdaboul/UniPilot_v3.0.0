import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const emptyRoleProfile = {
  employee_code: '',
  academic_rank: '',
  general_specialty: '',
  specific_specialty: '',
  highest_degree: '',
  degree_university: '',
  degree_year: '',
  thesis_title: '',
  contract_type: '',
  teaching_load_hours: '',
  start_date: '',
  specialty: '',
  supervisor_user_id: '',
  bachelor_gpa: '',
  bachelor_year: '',
  postgraduate_studying: false,
  postgraduate_program: '',
  assigned_labs: '',
  job_title: '',
  office_unit: '',
  access_permissions: [],
  hire_date: '',
  employment_type: '',
  work_shift: '',
  major: '',
  study_year: '',
  admission_type: 'general',
  academic_status: 'new',
  high_school_score: '',
  high_school_track: '',
  high_school_year: '',
  emergency_name: '',
  emergency_relation: '',
  emergency_phone: '',
};

export function profileKindForRole(role) {
  if (role === 'student') return 'student';
  if (role === 'teaching_assistant') return 'ta';
  if (['instructor', 'department_head', 'vice_dean_academic', 'dean'].includes(role)) return 'faculty';
  if (['student_affairs', 'exams_office', 'hr', 'finance', 'library', 'it', 'quality', 'archive', 'vice_dean_students'].includes(role)) return 'staff';
  return null;
}

export function RoleSpecificFields({ role, value, onChange, options, ar }) {
  const kind = profileKindForRole(role);
  if (!kind) return null;
  const set = (key, next) => onChange({ ...value, [key]: next });
  const togglePerm = (key) => {
    const current = Array.isArray(value.access_permissions) ? value.access_permissions : [];
    set('access_permissions', current.includes(key) ? current.filter((x) => x !== key) : [...current, key]);
  };

  if (kind === 'student') {
    return (
      <div className="space-y-3 rounded-2xl border border-border p-3">
        <p className="text-sm font-semibold">{ar ? 'الملف الأكاديمي للطالب' : 'Student academic file'}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{ar ? 'التخصص' : 'Major'}</Label>
            <Input value={value.major || ''} onChange={(e) => set('major', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'السنة الدراسية' : 'Study year'}</Label>
            <Input type="number" min="1" max="8" value={value.study_year || ''} onChange={(e) => set('study_year', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'نوع القبول' : 'Admission type'}</Label>
            <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={value.admission_type || 'general'} onChange={(e) => set('admission_type', e.target.value)}>
              {(options?.admission_types || []).map((t) => <option key={t.key} value={t.key}>{ar ? t.ar : t.en}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'الحالة الأكاديمية' : 'Academic status'}</Label>
            <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={value.academic_status || 'new'} onChange={(e) => set('academic_status', e.target.value)}>
              {(options?.academic_statuses || []).map((t) => <option key={t.key} value={t.key}>{ar ? t.ar : t.en}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'مجموع الثانوية' : 'High-school score'}</Label>
            <Input type="number" value={value.high_school_score || ''} onChange={(e) => set('high_school_score', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'فرع الثانوية' : 'High-school track'}</Label>
            <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={value.high_school_track || ''} onChange={(e) => set('high_school_track', e.target.value)}>
              <option value="">—</option>
              {(options?.high_school_tracks || []).map((t) => <option key={t.key} value={t.key}>{ar ? t.ar : t.en}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'جهة اتصال للطوارئ' : 'Emergency contact'}</Label>
            <Input value={value.emergency_name || ''} onChange={(e) => set('emergency_name', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'هاتف الطوارئ' : 'Emergency phone'}</Label>
            <Input value={value.emergency_phone || ''} onChange={(e) => set('emergency_phone', e.target.value)} className="rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'faculty') {
    return (
      <div className="space-y-3 rounded-2xl border border-border p-3">
        <p className="text-sm font-semibold">{ar ? 'ملف الهيئة التدريسية' : 'Faculty file'}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{ar ? 'الرقم الوظيفي (اختياري)' : 'Employee ID (optional)'}</Label>
            <Input value={value.employee_code || ''} onChange={(e) => set('employee_code', e.target.value)} className="rounded-xl" placeholder={ar ? 'يُستخدم المعرّف إن تُرك فارغاً' : 'Uses generated ID if empty'} />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'الرتبة الأكاديمية' : 'Academic rank'}</Label>
            <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={value.academic_rank || ''} onChange={(e) => set('academic_rank', e.target.value)}>
              <option value="">{ar ? 'اختر' : 'Select'}</option>
              {(options?.academic_ranks || []).map((r) => <option key={r.key} value={r.key}>{ar ? r.ar : r.en}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'التخصص العام' : 'General specialty'}</Label>
            <Input value={value.general_specialty || ''} onChange={(e) => set('general_specialty', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'التخصص الدقيق' : 'Specific specialty'}</Label>
            <Input value={value.specific_specialty || ''} onChange={(e) => set('specific_specialty', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'أعلى درجة علمية' : 'Highest degree'}</Label>
            <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={value.highest_degree || ''} onChange={(e) => set('highest_degree', e.target.value)}>
              <option value="">{ar ? 'اختر' : 'Select'}</option>
              {(options?.highest_degrees || []).map((r) => <option key={r.key} value={r.key}>{ar ? r.ar : r.en}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'الجامعة المتخرَّج منها' : 'Degree university'}</Label>
            <Input value={value.degree_university || ''} onChange={(e) => set('degree_university', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'سنة الشهادة' : 'Degree year'}</Label>
            <Input type="number" min="1950" max="2099" value={value.degree_year || ''} onChange={(e) => set('degree_year', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{ar ? 'عنوان الرسالة' : 'Thesis title'}</Label>
            <Input value={value.thesis_title || ''} onChange={(e) => set('thesis_title', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'نوع التعاقد' : 'Contract type'}</Label>
            <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={value.contract_type || ''} onChange={(e) => set('contract_type', e.target.value)}>
              <option value="">{ar ? 'اختر' : 'Select'}</option>
              {(options?.contract_types || []).map((r) => <option key={r.key} value={r.key}>{ar ? r.ar : r.en}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'النصاب (ساعات)' : 'Teaching load (hours)'}</Label>
            <Input type="number" min="0" max="40" value={value.teaching_load_hours || ''} onChange={(e) => set('teaching_load_hours', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'تاريخ المباشرة' : 'Start date'}</Label>
            <Input type="date" value={value.start_date || ''} onChange={(e) => set('start_date', e.target.value)} className="rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'ta') {
    return (
      <div className="space-y-3 rounded-2xl border border-border p-3">
        <p className="text-sm font-semibold">{ar ? 'ملف المعيد' : 'Teaching assistant file'}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{ar ? 'الرقم الوظيفي (اختياري)' : 'Employee ID (optional)'}</Label>
            <Input value={value.employee_code || ''} onChange={(e) => set('employee_code', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'التخصص' : 'Specialty'}</Label>
            <Input value={value.specialty || ''} onChange={(e) => set('specialty', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{ar ? 'المشرف الأكاديمي' : 'Academic supervisor'}</Label>
            <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={value.supervisor_user_id || ''} onChange={(e) => set('supervisor_user_id', e.target.value)}>
              <option value="">{ar ? 'بدون' : 'None'}</option>
              {(options?.supervisors || []).map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}{s.person_code ? ` (${s.person_code})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'معدل البكالوريوس' : 'Bachelor GPA'}</Label>
            <Input type="number" min="0" max="100" step="0.01" value={value.bachelor_gpa || ''} onChange={(e) => set('bachelor_gpa', e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'سنة التخرج' : 'Bachelor year'}</Label>
            <Input type="number" min="1950" max="2099" value={value.bachelor_year || ''} onChange={(e) => set('bachelor_year', e.target.value)} className="rounded-xl" />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!value.postgraduate_studying} onChange={(e) => set('postgraduate_studying', e.target.checked)} />
            {ar ? 'يدرس حالياً ماجستير/دكتوراه' : 'Currently in a postgraduate program'}
          </label>
          {value.postgraduate_studying && (
            <div className="space-y-1 sm:col-span-2">
              <Label>{ar ? 'برنامج الدراسات العليا' : 'Postgraduate program'}</Label>
              <Input value={value.postgraduate_program || ''} onChange={(e) => set('postgraduate_program', e.target.value)} className="rounded-xl" />
            </div>
          )}
          <div className="space-y-1 sm:col-span-2">
            <Label>{ar ? 'المختبرات / الجلسات العملية' : 'Assigned labs / practical sessions'}</Label>
            <Input value={value.assigned_labs || ''} onChange={(e) => set('assigned_labs', e.target.value)} className="rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <p className="text-sm font-semibold">{ar ? 'ملف الموظف الإداري' : 'Administrative staff file'}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{ar ? 'الرقم الوظيفي (اختياري)' : 'Employee ID (optional)'}</Label>
          <Input value={value.employee_code || ''} onChange={(e) => set('employee_code', e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-1">
          <Label>{ar ? 'المسمى الوظيفي' : 'Job title'}</Label>
          <Input value={value.job_title || ''} onChange={(e) => set('job_title', e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-1">
          <Label>{ar ? 'الدائرة / المكتب' : 'Office / unit'}</Label>
          <Input value={value.office_unit || ''} onChange={(e) => set('office_unit', e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-1">
          <Label>{ar ? 'تاريخ التعيين' : 'Hire date'}</Label>
          <Input type="date" value={value.hire_date || ''} onChange={(e) => set('hire_date', e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-1">
          <Label>{ar ? 'نوع الملاك' : 'Employment type'}</Label>
          <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={value.employment_type || ''} onChange={(e) => set('employment_type', e.target.value)}>
            <option value="">{ar ? 'اختر' : 'Select'}</option>
            {(options?.employment_types || []).map((r) => <option key={r.key} value={r.key}>{ar ? r.ar : r.en}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>{ar ? 'وردية الدوام' : 'Work shift'}</Label>
          <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={value.work_shift || ''} onChange={(e) => set('work_shift', e.target.value)}>
            <option value="">{ar ? 'اختر' : 'Select'}</option>
            {(options?.work_shifts || []).map((r) => <option key={r.key} value={r.key}>{ar ? r.ar : r.en}</option>)}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>{ar ? 'الصلاحيات على النظام' : 'System access'}</Label>
          <div className="grid sm:grid-cols-2 gap-2">
            {(options?.access_permissions || []).map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(value.access_permissions || []).includes(p.key)}
                  onChange={() => togglePerm(p.key)}
                />
                {ar ? p.ar : p.en}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
