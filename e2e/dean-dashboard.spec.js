// @ts-check
import { test, expect } from '@playwright/test';

async function loginAs(page, universityId, password) {
  await page.goto('/');
  await page.getByRole('button', { name: /sign in|login|تسجيل الدخول/i }).first().click();
  await page.locator('#universityId').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#universityId').fill(universityId);
  await page.locator('#password').fill(password);
  await page.locator('form').getByRole('button', { name: /sign in|login|تسجيل الدخول/i }).click();
  await page.waitForURL(/\/dashboard\/?$/, { timeout: 20000 });
}

test('dean 0260000001 sees dean dashboard and can drill into a department report', async ({ page }) => {
  test.setTimeout(90000);
  await loginAs(page, '0260000001', 'College123!');
  await expect(page.getByTestId('dean-dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: /dean dashboard|لوحة تحكم العميد/i })).toBeVisible();
  await expect(page.getByTestId('kpi-students')).toBeVisible();
  await expect(page.getByTestId('kpi-academic')).toBeVisible();
  await expect(page.getByTestId('kpi-admin')).toBeVisible();
  await expect(page.getByTestId('kpi-departments')).toBeVisible();
  await expect(page.getByTestId('kpi-success')).toBeVisible();
  await expect(page.getByTestId('kpi-approvals')).toBeVisible();
  await expect(page.getByText(/waiting for your approval|إجراءات تنتظر موافقتك/i)).toBeVisible();
  await expect(page.getByText(/curriculum and exams|سير المناهج والامتحانات/i)).toBeVisible();
  await expect(page.getByText(/college calendar|تقويم الكلية/i)).toBeVisible();
  await expect(page.getByText(/critical alerts|تنبيهات عاجلة/i)).toBeVisible();
  await expect(page.getByTestId('ops-card')).toBeVisible();

  await page.getByTestId('kpi-students').click();
  await expect(page).toHaveURL(/\/dashboard\/report\/students/);
  await expect(page.getByTestId('dean-report')).toBeVisible();
  await page.getByRole('link', { name: /back to dashboard|عودة للوحة/i }).click();
  await expect(page.getByTestId('dean-dashboard')).toBeVisible();

  await page.getByTestId('kpi-departments').click();
  await expect(page).toHaveURL(/\/dashboard\/report\/departments/);
  await expect(page.getByTestId('dean-report')).toBeVisible();
  const deptRow = page.locator('table tbody tr').first();
  await expect(deptRow).toBeVisible();
  await deptRow.click();
  await expect(page).toHaveURL(/\/dashboard\/report\/department\/\d+/);
  await expect(page.getByTestId('dean-report')).toBeVisible();
  await expect(page.getByText(/department courses|مواد القسم|department students|طلاب القسم/i)).toBeVisible();
  await page.getByRole('link', { name: /back to dashboard|عودة للوحة/i }).click();
  await expect(page.getByTestId('dean-dashboard')).toBeVisible();

  await page.getByTestId('kpi-approvals').click();
  await expect(page).toHaveURL(/\/dashboard\/report\/approvals/);
  await expect(page.getByTestId('dean-report')).toBeVisible();
  await page.getByRole('link', { name: /back to dashboard|عودة للوحة/i }).click();
  await expect(page.getByTestId('dean-dashboard')).toBeVisible();

  await page.getByTestId('ops-card').click();
  await expect(page).toHaveURL(/\/dashboard\/report\/operations/);
  await expect(page.getByTestId('dean-report')).toBeVisible();
});

test('student 0260000003 does not get the dean dashboard', async ({ page }) => {
  await loginAs(page, '0260000003', 'College123!');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('dean-dashboard')).toHaveCount(0);
  await page.goto('/dashboard/report/students');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('dean-dashboard')).toHaveCount(0);
});
