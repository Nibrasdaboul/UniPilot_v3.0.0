import { chromium } from '@playwright/test';

const base = 'http://localhost:5173';
const out = [];
function log(step, ok, extra = '') {
  out.push({ step, ok, extra });
  console.log(`${ok ? 'OK' : 'FAIL'}  ${step}${extra ? ` — ${extra}` : ''}`);
}

async function login(page, id, password) {
  await page.goto(base + '/');
  await page.getByRole('button', { name: /sign in|تسجيل الدخول/i }).first().click();
  await page.locator('#universityId').fill(id);
  await page.locator('#password').fill(password);
  await page.locator('form').getByRole('button', { name: /sign in|تسجيل الدخول/i }).click();
  await page.waitForURL(/\/dashboard\/?$/, { timeout: 20000 });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await login(page, '0260000001', 'College123!');
  log('dean login to /dashboard', true, page.url());

  await page.getByTestId('dean-dashboard').waitFor({ timeout: 15000 });
  log('dean dashboard visible', true);

  for (const id of ['kpi-students', 'kpi-academic', 'kpi-admin', 'kpi-departments', 'kpi-success', 'kpi-approvals', 'ops-card']) {
    const vis = await page.getByTestId(id).isVisible();
    log(`section ${id}`, vis);
  }
  log('approvals block', await page.getByText(/waiting for your approval|إجراءات تنتظر موافقتك/i).first().isVisible());
  log('academic block', await page.getByText(/curriculum and exams|سير المناهج والامتحانات/i).first().isVisible());
  log('calendar block', await page.getByText(/college calendar|تقويم الكلية/i).first().isVisible());

  await page.getByTestId('kpi-students').click();
  await page.waitForURL(/\/dashboard\/report\/students/, { timeout: 10000 });
  await page.getByTestId('dean-report').waitFor({ timeout: 10000 });
  log('drill-down students report', true, page.url());

  await page.getByRole('link', { name: /back to dashboard|عودة للوحة/i }).click();
  await page.getByTestId('dean-dashboard').waitFor({ timeout: 10000 });

  await page.getByTestId('kpi-departments').click();
  await page.waitForURL(/\/dashboard\/report\/departments/, { timeout: 10000 });
  const row = page.locator('table tbody tr').first();
  await row.waitFor({ timeout: 10000 });
  await row.click();
  await page.waitForURL(/\/dashboard\/report\/department\/\d+/, { timeout: 10000 });
  await page.getByTestId('dean-report').waitFor();
  log('drill-down department report', true, page.url());

  await page.getByRole('link', { name: /back to dashboard|عودة للوحة/i }).click();
  await page.getByTestId('dean-dashboard').waitFor({ timeout: 10000 });
  await page.getByTestId('ops-card').click();
  await page.waitForURL(/\/dashboard\/report\/operations/, { timeout: 10000 });
  log('drill-down operations report', true, page.url());

  const student = await browser.newPage();
  await login(student, '0260000003', 'College123!');
  const studentDash = await student.getByTestId('dashboard-page').isVisible();
  const studentDean = await student.getByTestId('dean-dashboard').count();
  log('student sees student dashboard', studentDash && studentDean === 0);
  await student.goto(base + '/dashboard/report/students');
  await student.getByTestId('dashboard-page').waitFor({ timeout: 15000 });
  log('student blocked from dean report', /\/dashboard\/?$/.test(new URL(student.url()).pathname) && (await student.getByTestId('dean-report').count()) === 0, student.url());
  await student.close();
} catch (e) {
  log('browser flow', false, e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  const failed = out.filter((x) => !x.ok);
  console.log(JSON.stringify({ passed: out.filter((x) => x.ok).length, failed: failed.length, steps: out }, null, 2));
  if (failed.length) process.exitCode = 1;
}
