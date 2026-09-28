const STUDENT = {
  titleAr: 'دليل المستخدم',
  titleEn: 'User Guide',
  welcomeAr: 'مرحباً! أنا مساعد دليل استخدام يوني بايلوت. اختر سؤالاً أدناه أو اكتب سؤالك.',
  welcomeEn: "Hi! I'm the UniPilot user guide assistant. Pick a question below or type your own.",
  placeholderAr: 'اسأل عن أي ميزة...',
  placeholderEn: 'Ask about any feature...',
  promptsAr: [
    'كيف أضيف مقرراً دراسياً؟',
    'ما هي أدوات الدراسة وكيف أستخدمها؟',
    'كيف أستخدم الملخص والبطاقات التعليمية والاختبار؟',
    'أين أجد المخطط الدراسي وكيف أضيف أحداثاً؟',
    'كيف أسجل ملاحظاتي وأين تظهر؟',
    'ما الفرق بين المستشار الذكي ودليل المستخدم؟',
    'كيف أغير اللغة أو الإعدادات؟',
  ],
  promptsEn: [
    'How do I add a course?',
    'What are Study Tools and how do I use them?',
    'How do I use the summarizer, flashcards, and quiz?',
    'Where is the planner and how do I add events?',
    'How do I take notes and where do they appear?',
    'What is the difference between AI Coach and User Guide?',
    'How do I change language or settings?',
  ],
};

const DEAN = {
  titleAr: 'دليل العميد',
  titleEn: 'Dean Guide',
  welcomeAr: 'مرحباً! أنا دليل استخدام العميد في يوني بايلوت. اختر سؤالاً أدناه أو اكتب عن لوحة التحكم، الموافقات، الامتحانات، الكادر، أو شؤون الطلاب.',
  welcomeEn: "Hi! I'm the UniPilot dean guide. Pick a question below or ask about the dashboard, approvals, exams, teaching staff, or student affairs.",
  placeholderAr: 'اسأل عن لوحة العميد أو صفحات الإشراف...',
  placeholderEn: 'Ask about the dean dashboard or oversight pages...',
  promptsAr: [
    'كيف أستخدم لوحة تحكم العميد وماذا تعني البطاقات؟',
    'كيف أعتمد أو أرفض الطلبات المعلّقة؟',
    'كيف أفتح تقريراً تفصيلياً من بطاقة أو رسم؟',
    'أين أراجع جدول امتحانات الكلية والقاعات؟',
    'كيف أبحث عن مادة أو كادر وأرى الجدول الأسبوعي؟',
    'كيف أفرز شكاوى الطلاب وأراجع تفاصيلها؟',
    'ماذا تعني التنبيهات العاجلة وبطاقة المالية والتشغيل؟',
    'كيف أغيّر اللغة أو الإعدادات؟',
  ],
  promptsEn: [
    'How do I use the dean dashboard and what do the cards mean?',
    'How do I approve or reject pending requests?',
    'How do I open a detailed report from a card or chart?',
    'Where do I review the college exam timetable and halls?',
    'How do I search a course or staff member and see the weekly grid?',
    'How do I filter student complaints and open their details?',
    'What are critical alerts and the finance and operations card?',
    'How do I change language or settings?',
  ],
};

const VDA = {
  titleAr: 'دليل النائب الأكاديمي',
  titleEn: 'Academic Vice Dean Guide',
  welcomeAr: 'مرحباً! أنا دليل نائب العميد للشؤون الأكاديمية. اسأل عن اللوحة، الاعتمادات، التنبيهات، الامتحانات، النتائج، الخطة، النصاب، أو البحث العلمي.',
  welcomeEn: "Hi! I'm the Academic Vice Dean guide. Ask about the dashboard, approvals, alerts, exams, grades, curriculum, teaching load, or research.",
  placeholderAr: 'اسأل عن لوحة النائب الأكاديمي أو صفحات الاعتماد...',
  placeholderEn: 'Ask about the academic vice dean pages...',
  promptsAr: [
    'كيف أستخدم لوحة النائب الأكاديمي وماذا تعني المؤشرات؟',
    'كيف أعتمد جدول امتحانات أو نتائج مرفوعة؟',
    'متى يظهر تنبيه الرسوب أو تأخير أعمال السنة؟',
    'ماذا أفعل في صفحة الامتحانات دون جدولة القاعات؟',
    'كيف أراجع منحنى الدرجات وأعتمد شعبة؟',
    'كيف أراجع الخطة والنصاب دون تعيين كادر؟',
    'أين أجد المناهج ومعلومات المواد؟',
    'أين أسجّل ورقة بحثية أو أعتمد موضوع تخرج؟',
    'كيف أغيّر اللغة أو الإعدادات؟',
  ],
  promptsEn: [
    'How do I use the academic vice dean dashboard and what do the KPIs mean?',
    'How do I approve an exam timetable or submitted results?',
    'When does a fail-rate or late-coursework alert appear?',
    'What can I do on the exams page without scheduling halls?',
    'How do I review the grade curve and approve an offering?',
    'How do I review curriculum and teaching load without assigning staff?',
    'Where do I find course syllabi and course information?',
    'Where do I register a paper or approve a graduation topic?',
    'How do I change language or settings?',
  ],
};

const GUIDES = { student: STUDENT, dean: DEAN, vice_dean_academic: VDA };

export function guideKeyForRole(role) {
  if (role === 'dean') return 'dean';
  if (role === 'vice_dean_academic') return 'vice_dean_academic';
  return 'student';
}

export function getUserGuide(role, language) {
  const key = guideKeyForRole(role);
  const pack = GUIDES[key] || GUIDES.student;
  const isAr = language === 'ar';
  return {
    key,
    title: isAr ? pack.titleAr : pack.titleEn,
    welcome: isAr ? pack.welcomeAr : pack.welcomeEn,
    placeholder: isAr ? pack.placeholderAr : pack.placeholderEn,
    prompts: isAr ? pack.promptsAr : pack.promptsEn,
  };
}
