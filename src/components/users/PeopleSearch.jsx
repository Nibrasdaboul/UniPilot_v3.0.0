import { Input } from '@/components/ui/input';

export function PeopleSearch({ name, role, roles, roleLabel, onName, onRole, ar, hideRole = false }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <Input
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder={ar ? 'بحث بالاسم أو المعرّف' : 'Search by name or ID'}
        className="rounded-xl"
      />
      {!hideRole && (
        <select
          className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
          value={role}
          onChange={(e) => onRole(e.target.value)}
        >
          <option value="">{ar ? 'كل الأدوار' : 'All roles'}</option>
          {roles.map((r) => (
            <option key={r} value={r}>{roleLabel(r)}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export function matchesPerson(person, nameQuery, roleQuery) {
  if (roleQuery && person.role !== roleQuery) return false;
  const q = String(nameQuery || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [
    person.full_name,
    person.full_name_ar,
    person.full_name_en,
    person.person_code,
    person.university_id,
    person.phone,
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}
