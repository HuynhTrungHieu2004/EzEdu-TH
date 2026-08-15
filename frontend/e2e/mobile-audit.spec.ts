import { test, type Page } from '@playwright/test';

/** Audit trải nghiệm mobile trên backend thật. Chỉ báo cáo, không khẳng định. */

const ACCOUNTS = {
  teacher: { email: 'qa-live-lecturer@example.com', password: 'QaLive#2026' },
  student: { email: 'qa-live-student@example.com', password: 'QaLive#2026' },
  admin: { email: 'qa-live-admin@example.com', password: 'QaLive#2026' },
};

const ROUTES = {
  teacher: ['/dashboard', '/documents', '/generate', '/question-bank', '/exam-blueprints', '/classes', '/chat-advanced', '/question-history', '/tools', '/ho-so'],
  student: ['/dashboard', '/published-questions', '/learning-history', '/student-statistics', '/chat-advanced', '/tools'],
  admin: ['/admin/dashboard', '/admin/users', '/admin/documents', '/admin/audit-logs', '/admin/settings'],
};

const PUBLIC_ROUTES = ['/', '/how-it-works', '/features', '/faq', '/login', '/register'];

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email đăng nhập').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.locator('#pub-main-content').getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL(/\/(dashboard|published-questions|student-onboarding|admin\/dashboard)/, { timeout: 30_000 });
}

/** Đo trong trình duyệt: tràn ngang, vùng chạm nhỏ, chữ nhỏ, input gây zoom trên iOS. */
async function audit(page: Page, route: string) {
  return page.evaluate((currentRoute) => {
    const issues: Array<{ route: string; kind: string; detail: string }> = [];
    const viewportWidth = document.documentElement.clientWidth;

    const overflow = document.documentElement.scrollWidth - viewportWidth;
    if (overflow > 1) issues.push({ route: currentRoute, kind: 'tràn-ngang', detail: `${overflow}px` });

    // Phần tử rộng hơn màn hình — thủ phạm gây tràn
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const rect = element.getBoundingClientRect();
      if (rect.width > viewportWidth + 1 && rect.height > 0) {
        const style = getComputedStyle(element);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue; // cuộn ngang có chủ đích
        issues.push({
          route: currentRoute,
          kind: 'phần-tử-rộng-hơn-màn-hình',
          detail: `${element.tagName.toLowerCase()}.${element.className?.toString().split(' ')[0] ?? ''} = ${Math.round(rect.width)}px`,
        });
        break;
      }
    }

    const seenTargets = new Set<string>();
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('a, button, [role="button"], input[type="checkbox"], input[type="radio"], select'))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      // Thẻ bọc inline quanh một nút: vùng chạm thật là nút bên trong.
      if (style.display === 'inline' && element.querySelector('button, a')) continue;
      // Ngưỡng 44px theo Apple HIG / WCAG 2.5.5 AAA
      if (rect.height < 40 || rect.width < 40) {
        const label = `${element.tagName.toLowerCase()}.${element.className?.toString().split(' ').slice(0, 2).join('.')}`;
        if (seenTargets.has(label)) continue;
        seenTargets.add(label);
        issues.push({
          route: currentRoute,
          kind: 'vùng-chạm-nhỏ',
          detail: `${label} = ${Math.round(rect.width)}x${Math.round(rect.height)} — "${(element.textContent ?? '').trim().slice(0, 25)}"`,
        });
      }
    }

    // Checkbox/radio/range không có chữ nên iOS không phóng to vì chúng.
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select',
    ))) {
      const size = parseFloat(getComputedStyle(element).fontSize);
      // iOS Safari tự phóng to trang khi focus vào input có cỡ chữ < 16px
      if (size && size < 16) {
        issues.push({ route: currentRoute, kind: 'input-gây-zoom-iOS', detail: `${element.tagName.toLowerCase()} = ${size}px` });
        break;
      }
    }

    const smallText = new Set<string>();
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (!element.textContent?.trim() || element.children.length > 0) continue;
      const size = parseFloat(getComputedStyle(element).fontSize);
      if (size && size < 12) smallText.add(`${element.className?.toString().split(' ')[0] || element.tagName.toLowerCase()} = ${size}px`);
    }
    for (const item of Array.from(smallText).slice(0, 3)) {
      issues.push({ route: currentRoute, kind: 'chữ-nhỏ-hơn-12px', detail: item });
    }

    // Thanh cố định che nội dung dưới cùng
    const main = document.querySelector('#main') ?? document.querySelector('main');
    if (main) {
      const mainRect = main.getBoundingClientRect();
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const style = getComputedStyle(element);
        if (style.position !== 'fixed') continue;
        const rect = element.getBoundingClientRect();
        if (rect.height === 0 || rect.top < window.innerHeight / 2) continue;
        if (mainRect.bottom > rect.top + 2 && document.documentElement.scrollHeight <= window.innerHeight + 2) {
          issues.push({
            route: currentRoute,
            kind: 'thanh-cố-định-che-nội-dung',
            detail: `${element.className?.toString().split(' ')[0]} phủ ${Math.round(mainRect.bottom - rect.top)}px cuối`,
          });
          break;
        }
      }
    }

    return issues;
  }, route);
}

for (const [role, routes] of Object.entries(ROUTES)) {
  test(`audit mobile — ${role}`, async ({ page }) => {
    const all: Array<{ route: string; kind: string; detail: string }> = [];
    await login(page, ACCOUNTS[role as keyof typeof ACCOUNTS]);
    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(2500);
      all.push(...(await audit(page, route)));
    }
    console.log(`MOBILE_${role.toUpperCase()}=` + JSON.stringify(all, null, 1));
  });
}

test('audit mobile — trang công khai', async ({ page }) => {
  const all: Array<{ route: string; kind: string; detail: string }> = [];
  for (const route of PUBLIC_ROUTES) {
    await page.goto(route);
    await page.waitForTimeout(2000);
    all.push(...(await audit(page, route)));
  }
  console.log('MOBILE_PUBLIC=' + JSON.stringify(all, null, 1));
});
