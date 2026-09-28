const MESSAGES = {
  credentials_required: {
    ar: 'أدخل رقمك الجامعي وكلمة المرور.',
    en: 'Enter your university ID and password.',
  },
  university_id_mismatch: {
    ar: 'الرقم الجامعي لا يطابق حسابك.',
    en: 'This university ID does not match your account.',
  },
  wrong_password: {
    ar: 'كلمة المرور غير صحيحة.',
    en: 'Incorrect password.',
  },
  too_many_attempts: {
    ar: 'محاولات خاطئة كثيرة. حاول بعد 15 دقيقة.',
    en: 'Too many failed attempts. Try again in 15 minutes.',
  },
  withdraw_closed: {
    ar: 'نافذة السحب مغلقة.',
    en: 'The withdrawal window is closed.',
  },
  no_term: {
    ar: 'لا يوجد فصل دراسي حالي مفتوح.',
    en: 'There is no current academic term.',
  },
  not_enrolled: {
    ar: 'لست مسجّلاً في هذه المادة هذا الفصل.',
    en: 'You are not enrolled in this course this term.',
  },
  nothing_enrolled: {
    ar: 'لا توجد مواد مسجّلة لسحبها.',
    en: 'You have no enrolled courses to withdraw.',
  },
  term_frozen: {
    ar: 'جمّدت هذا الفصل، لا يمكنك تسجيل مواد حتى فتح فصل جديد.',
    en: 'You froze this term. You cannot register until a new term opens.',
  },
  withdrawn_this_term: {
    ar: 'سحبت هذه المادة هذا الفصل، يمكنك تنزيلها مجدداً في فصل جديد.',
    en: 'You withdrew from this course this term. Register it again in a new term.',
  },
};

export function withdrawErrorMessage(error, ar) {
  const data = error?.response?.data;
  const entry = data?.code ? MESSAGES[data.code] : null;
  if (entry) return ar ? entry.ar : entry.en;
  if (typeof data?.detail === 'string' && data.detail) return data.detail;
  return ar ? 'تعذّر إتمام العملية' : 'Could not complete the request';
}
