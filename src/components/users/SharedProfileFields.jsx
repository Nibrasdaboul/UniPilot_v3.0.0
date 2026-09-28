import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const emptySharedProfile = {
  full_name_ar: '',
  full_name_en: '',
  national_id: '',
  gender: 'male',
  birth_date: '',
  birth_place: '',
  nationality: '',
  email_official: '',
  email_personal: '',
  phone: '',
  home_address: '',
  account_status: 'active',
  avatar_base64: '',
  avatar_filename: '',
  avatar_preview: '',
};

export function SharedProfileFields({ value, onChange, options, ar, required = true }) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  const genders = options?.genders || [];
  const statuses = options?.account_statuses || [];

  const onPhoto = (file) => {
    if (!file) {
      onChange({ ...value, avatar_base64: '', avatar_filename: '', avatar_preview: '' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        ...value,
        avatar_base64: String(reader.result || ''),
        avatar_filename: file.name,
        avatar_preview: String(reader.result || ''),
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2 flex items-center gap-3">
        <div className="w-16 h-16 rounded-full border overflow-hidden bg-muted shrink-0">
          {value.avatar_preview ? (
            <img src={value.avatar_preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">{ar ? 'صورة' : 'Photo'}</div>
          )}
        </div>
        <div className="space-y-1 flex-1">
          <Label>{ar ? 'الصورة الشخصية' : 'Profile photo'}</Label>
          <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onPhoto(e.target.files?.[0])} className="rounded-xl" />
          <p className="text-xs text-muted-foreground">{ar ? 'JPG أو PNG أو WebP، حتى 2 ميغابايت.' : 'JPG, PNG, or WebP, up to 2 MB.'}</p>
        </div>
      </div>
      <div className="space-y-1">
        <Label>{ar ? 'الاسم الكامل (عربي)' : 'Full name (Arabic)'}</Label>
        <Input required={required} value={value.full_name_ar || ''} onChange={(e) => set('full_name_ar', e.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-1">
        <Label>{ar ? 'الاسم الكامل (إنجليزي)' : 'Full name (English)'}</Label>
        <Input required={required} value={value.full_name_en || ''} onChange={(e) => set('full_name_en', e.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-1">
        <Label>{ar ? 'الرقم الوطني / جواز السفر' : 'National ID / passport'}</Label>
        <Input required={required} value={value.national_id || ''} onChange={(e) => set('national_id', e.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-1">
        <Label>{ar ? 'الجنس' : 'Gender'}</Label>
        <select required={required} className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={value.gender || 'male'} onChange={(e) => set('gender', e.target.value)}>
          {genders.map((g) => (
            <option key={g.key} value={g.key}>{ar ? g.ar : g.en}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>{ar ? 'تاريخ الميلاد' : 'Date of birth'}</Label>
        <Input required={required} type="date" value={value.birth_date || ''} onChange={(e) => set('birth_date', e.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-1">
        <Label>{ar ? 'مكان الميلاد' : 'Place of birth'}</Label>
        <Input value={value.birth_place || ''} onChange={(e) => set('birth_place', e.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-1">
        <Label>{ar ? 'الجنسية' : 'Nationality'}</Label>
        <Input value={value.nationality || ''} onChange={(e) => set('nationality', e.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-1">
        <Label>{ar ? 'حالة الحساب' : 'Account status'}</Label>
        <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={value.account_status || 'active'} onChange={(e) => set('account_status', e.target.value)}>
          {statuses.map((s) => (
            <option key={s.key} value={s.key}>{ar ? s.ar : s.en}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>{ar ? 'البريد الرسمي' : 'Official email'}</Label>
        <Input type="email" value={value.email_official || ''} onChange={(e) => set('email_official', e.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-1">
        <Label>{ar ? 'البريد الشخصي' : 'Personal email'}</Label>
        <Input type="email" value={value.email_personal || ''} onChange={(e) => set('email_personal', e.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-1">
        <Label>{ar ? 'رقم الهاتف' : 'Phone'}</Label>
        <Input value={value.phone || ''} onChange={(e) => set('phone', e.target.value)} className="rounded-xl" />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label>{ar ? 'عنوان السكن' : 'Home address'}</Label>
        <Input value={value.home_address || ''} onChange={(e) => set('home_address', e.target.value)} className="rounded-xl" />
      </div>
    </div>
  );
}
