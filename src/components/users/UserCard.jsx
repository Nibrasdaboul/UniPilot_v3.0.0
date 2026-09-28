import { mediaUrl } from '@/lib/mediaUrl';

export function UserCard({ person, roleLabel, subtitle, onClick, ar }) {
  const name = person.full_name_ar || person.full_name || person.full_name_en || '—';
  const secondary = person.full_name_en && person.full_name_en !== name ? person.full_name_en : null;
  const status = person.account_status === 'suspended'
    ? (ar ? 'معلق' : 'Suspended')
    : (ar ? 'نشط' : 'Active');

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-start rounded-2xl border border-border bg-card p-4 shadow-sm hover:border-primary/50 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        {person.avatar_url ? (
          <img src={mediaUrl(person.avatar_url)} alt="" className="w-14 h-14 rounded-2xl object-cover border shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0">
            {String(name).charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold truncate">{name}</p>
            <span className="text-[11px] rounded-full px-2 py-0.5 bg-muted shrink-0">{status}</span>
          </div>
          {secondary && <p className="text-xs text-muted-foreground truncate">{secondary}</p>}
          <p className="text-sm text-primary font-medium">{roleLabel}</p>
          <p className="text-xs text-muted-foreground font-mono">{person.person_code || person.university_id || '—'}</p>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>
    </button>
  );
}
