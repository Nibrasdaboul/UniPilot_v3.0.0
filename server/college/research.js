export const PUBLICATION_STATUSES = ['published'];

export const PROJECT_TRACKS = [
  {
    key: 'term',
    ar: 'المشروع الفصلي',
    en: 'Term project',
    unlocks_after: null,
    default_min_hours: 90,
    course_code: 'TERM-PRJ',
    course_name: 'المشروع الفصلي',
    credit_hours: 3,
    order: 900,
  },
  {
    key: 'graduation_1',
    ar: 'مشروع التخرج 1',
    en: 'Graduation project 1',
    unlocks_after: 'term',
    default_min_hours: 90,
    course_code: 'GP1',
    course_name: 'مشروع التخرج 1',
    credit_hours: 3,
    order: 901,
  },
  {
    key: 'graduation_2',
    ar: 'مشروع التخرج 2',
    en: 'Graduation project 2',
    unlocks_after: 'graduation_1',
    default_min_hours: 90,
    course_code: 'GP2',
    course_name: 'مشروع التخرج 2',
    credit_hours: 3,
    order: 902,
  },
];

export const PROJECT_KINDS = PROJECT_TRACKS.map(({ key, ar, en }) => ({ key, ar, en }));

const LEGACY_PROJECT_KINDS = {
  bachelor: 'graduation_1',
  master: 'graduation_2',
};

export const PROJECT_STATUSES = ['pending', 'approved', 'rejected'];

export const COMMITTEE_ROLES = [
  { key: 'chair', ar: 'رئيس اللجنة', en: 'Chair' },
  { key: 'member', ar: 'عضو', en: 'Member' },
  { key: 'external', ar: 'ممتحن خارجي', en: 'External examiner' },
];

export function isProjectKind(value) {
  return PROJECT_TRACKS.some((k) => k.key === value);
}

export function normalizeProjectKind(value) {
  const raw = String(value || '').trim();
  if (isProjectKind(raw)) return raw;
  return LEGACY_PROJECT_KINDS[raw] || null;
}

export function projectTrackSpec(kind) {
  const key = normalizeProjectKind(kind);
  return PROJECT_TRACKS.find((t) => t.key === key) || null;
}

export function requestHoursForKind(tracks, kind) {
  const key = normalizeProjectKind(kind);
  const row = (tracks || []).find((t) => t.kind === key);
  if (row?.request_min_hours != null) return Number(row.request_min_hours);
  return projectTrackSpec(key)?.default_min_hours ?? DEFAULT_PROJECT_REQUEST_MIN_HOURS;
}

export function canOpenProjectTrack({ kind, passedKinds = [] }) {
  const spec = projectTrackSpec(kind);
  if (!spec) return false;
  if (!spec.unlocks_after) return true;
  return passedKinds.includes(spec.unlocks_after);
}

export function isCommitteeRole(value) {
  return COMMITTEE_ROLES.some((k) => k.key === value);
}

export function parseProjectDecision(value) {
  const decision = String(value || '').trim();
  if (decision !== 'approved' && decision !== 'rejected') return null;
  return decision;
}

export function parseStudentRequestDecision(value) {
  const decision = String(value || '').trim();
  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'returned') return null;
  return decision;
}

export const DEFAULT_PROJECT_REQUEST_MIN_HOURS = 90;
export const PROJECT_REQUEST_MIN_HOURS_MAX = 250;

export function parseProjectMinHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || !Number.isInteger(hours) || hours < 0 || hours > PROJECT_REQUEST_MIN_HOURS_MAX) {
    return null;
  }
  return hours;
}

export function canSubmitProjectRequest({ completedHours, requiredHours }) {
  return Number(completedHours) >= Number(requiredHours);
}

export function evaluateStudentProjectTrack({
  kind,
  completedHours,
  requiredHours,
  passedKinds = [],
  latestStatus = null,
  windowOpen = true,
}) {
  const open = canOpenProjectTrack({ kind, passedKinds });
  const hoursMet = canSubmitProjectRequest({ completedHours, requiredHours });
  const passed = passedKinds.includes(normalizeProjectKind(kind));
  if (passed) {
    return { open: true, hours_met: hoursMet, passed, can_request: false, lock_reason: 'passed' };
  }
  if (!open) {
    return { open: false, hours_met: hoursMet, passed, can_request: false, lock_reason: 'chain' };
  }
  if (!hoursMet) {
    return { open: true, hours_met: false, passed, can_request: false, lock_reason: 'hours' };
  }
  if (latestStatus === 'pending') {
    return { open: true, hours_met: true, passed, can_request: false, lock_reason: 'pending' };
  }
  if (latestStatus === 'approved') {
    return { open: true, hours_met: true, passed, can_request: false, lock_reason: 'approved' };
  }
  if (!windowOpen) {
    return { open: true, hours_met: true, passed, can_request: false, lock_reason: 'window' };
  }
  return { open: true, hours_met: true, passed, can_request: true, lock_reason: null };
}

export function projectRequestLockMessage(reason, kind) {
  const spec = projectTrackSpec(kind);
  const name = spec?.en || 'this project';
  if (reason === 'chain') {
    const prev = projectTrackSpec(spec?.unlocks_after);
    return `Pass ${prev?.en || 'the previous project'} before requesting ${name}`;
  }
  if (reason === 'hours') return `Complete the required credit hours before requesting ${name}`;
  if (reason === 'pending') return `A request for ${name} is already awaiting review`;
  if (reason === 'approved') return `${name} is already approved`;
  if (reason === 'passed') return `${name} is already passed`;
  if (reason === 'window') return 'Project and specialization requests can only be submitted during the vice dean window';
  return `Cannot request ${name}`;
}

export function parseCommitteeMembers(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const members = [];
  for (const item of list) {
    const full_name = String(item?.full_name || item?.name || '').trim();
    if (!full_name) continue;
    const committee_role = isCommitteeRole(item?.committee_role) ? item.committee_role : 'member';
    members.push({ full_name, committee_role, user_id: item?.user_id != null ? Number(item.user_id) : null });
  }
  return members;
}

export const PROJECT_TEAM_MIN = 1;
export const PROJECT_TEAM_MAX = 8;

export function parseProjectTeamMembers(rawMembers, teamSize) {
  const size = Number(teamSize);
  if (!Number.isInteger(size) || size < PROJECT_TEAM_MIN || size > PROJECT_TEAM_MAX) {
    return { error: `team_size must be a whole number from ${PROJECT_TEAM_MIN} to ${PROJECT_TEAM_MAX}` };
  }
  const list = Array.isArray(rawMembers) ? rawMembers : [];
  const members = [];
  for (const item of list) {
    const full_name = String(item?.full_name || item?.name || '').trim();
    const university_id = String(item?.university_id || item?.person_code || '').replace(/\D/g, '');
    const gpa = Number(item?.gpa);
    const hours = Number(item?.completed_hours);
    if (!full_name && !university_id) continue;
    if (!full_name) return { error: 'Each team member needs a name' };
    if (!/^\d{10}$/.test(university_id)) return { error: 'Each team member needs a 10-digit university ID' };
    if (!Number.isFinite(gpa) || gpa < 0 || gpa > 100) return { error: 'Each team member GPA must be from 0 to 100' };
    if (!Number.isFinite(hours) || hours < 0 || hours > 400) return { error: 'Each team member completed hours must be 0 or more' };
    members.push({
      full_name,
      university_id,
      gpa: Math.round(gpa * 100) / 100,
      completed_hours: Math.round(hours * 100) / 100,
    });
  }
  if (members.length !== size) {
    return { error: 'team_size must match the number of team members' };
  }
  return { error: null, team_size: size, members };
}
