# Design Foundation & App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây nền tảng thị giác “Học thuật hiện đại”, hệ motion GSAP và AppShell responsive theo vai trò để mọi lát redesign sau dùng chung một nguồn thiết kế ổn định.

**Architecture:** Giữ React/Vite hiện tại, đưa semantic token về một nguồn duy nhất, bổ sung `MotionProvider` và các motion primitive có scope/cleanup, sau đó di trú `AppLayout` sang sidebar navy + active indicator teal + bottom navigation. Chỉ thay khung và foundation trong kế hoạch này; nội dung từng dashboard/trang nghiệp vụ được giữ nguyên để giảm phạm vi hồi quy.

**Tech Stack:** React 19, TypeScript 6, Vite 8, React Router 7, GSAP, `@gsap/react`, Lucide React, Playwright, Axe.

**Spec:** `docs/superpowers/specs/2026-08-14-professional-motion-redesign-design.md`

## Global Constraints

- Giữ nguyên React 19, TypeScript, Vite, React Router và Lucide; không đổi framework.
- `frontend/src/styles/tokens.css` là nguồn thật duy nhất cho màu, typography, spacing, radius, elevation, breakpoint, z-index và motion.
- Hướng thị giác bắt buộc: navy mực, teal khoáng, vàng ấm, nền xám xanh nhạt và surface trắng.
- Desktop dùng sidebar theo vai trò; mobile dùng bốn mục chính và mục “Thêm”.
- GSAP trong React phải dùng scope và cleanup; ưu tiên transform/opacity.
- Phải hỗ trợ `prefers-reduced-motion` và giảm motion trên mobile/thiết bị con trỏ thô.
- Không xóa CSS legacy trước khi xác nhận không còn consumer.
- Không thay đổi API/backend hoặc hành vi trang nghiệp vụ trong kế hoạch foundation này.
- Mỗi task phải chạy kiểm thử liên quan và chỉ commit file của task đó; giữ nguyên mọi thay đổi dang dở khác trong working tree.

---

## File map

### Tạo mới

- `frontend/src/motion/MotionProvider.tsx`: context xác định full/reduced motion và đồng bộ `data-motion` lên `<html>`.
- `frontend/src/motion/useMotion.ts`: hook đọc motion context.
- `frontend/src/motion/PageEntrance.tsx`: entrance timeline cho nội dung route.
- `frontend/src/motion/StaggerGroup.tsx`: reveal danh sách/card theo stagger.
- `frontend/src/motion/AnimatedCounter.tsx`: animate số liệu dashboard có fallback reduced-motion.
- `frontend/src/motion/MotionCard.tsx`: hover lift/tilt có cleanup và bỏ qua trên coarse pointer.
- `frontend/src/motion/index.ts`: public exports duy nhất của motion layer.
- `frontend/src/components/navigation.tsx`: type và cấu hình navigation theo area/permission/feature flag.
- `frontend/e2e/design-foundation.spec.ts`: kiểm tra token, shell, responsive và accessibility contract.
- `frontend/e2e/motion-foundation.spec.ts`: kiểm tra full/reduced motion, route cleanup và animated primitives.

### Sửa

- `frontend/package.json`: thêm GSAP dependencies và script kiểm thử foundation.
- `frontend/package-lock.json`: khóa dependency.
- `frontend/src/main.tsx`: bọc app bằng `MotionProvider`, giữ thứ tự CSS `legacy → tokens → base`.
- `frontend/src/styles/tokens.css`: thay semantic palette bằng academic palette và chuẩn hóa motion token.
- `frontend/src/styles/base.css`: áp dụng background/text/focus và reduced-motion contract mới.
- `frontend/src/components/AppLayout.tsx`: dùng navigation model, `PageEntrance`, nhóm admin thu gọn và motion indicator.
- `frontend/src/components/app-layout.css`: giao diện AppShell mới và responsive behavior.
- `frontend/src/App.tsx`: giữ route hiện tại, bổ sung route content key/entrance contract nếu cần.

---

### Task 1: Khóa dependencies GSAP

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Produces: package imports `gsap`, `gsap/ScrollTrigger`, `@gsap/react` cho các task sau.

- [ ] **Step 1: Xác nhận dependency chưa tồn tại**

Run:

```bash
cd frontend && npm ls gsap @gsap/react
```

Expected: exit khác 0 hoặc tree không chứa hai package.

- [ ] **Step 2: Cài dependency runtime**

Run:

```bash
cd frontend && npm install gsap @gsap/react
```

Expected: `package.json` và `package-lock.json` chứa cả `gsap` lẫn `@gsap/react` trong `dependencies`.

- [ ] **Step 3: Kiểm tra import bằng TypeScript/Vite**

Run:

```bash
cd frontend && node --input-type=module -e "import('gsap').then(() => import('@gsap/react')).then(() => console.log('gsap imports ok'))"
```

Expected: in `gsap imports ok`, exit 0.

- [ ] **Step 4: Commit riêng dependency**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "build: add GSAP motion runtime"
```

---

### Task 2: Chuẩn hóa academic design tokens

**Files:**
- Create: `frontend/e2e/design-foundation.spec.ts`
- Modify: `frontend/src/styles/tokens.css`
- Modify: `frontend/src/styles/base.css`
- Verify: `frontend/src/main.tsx`

**Interfaces:**
- Produces semantic tokens: `--ez-nav-bg`, `--ez-primary`, `--ez-accent`, `--ez-bg`, `--ez-surface`, `--ez-text`, `--ez-border`, `--ez-motion-fast`, `--ez-motion-base`, `--ez-motion-slow`, `--ez-ease-standard`, `--ez-ease-emphasized`.
- Existing aliases remain available so pages chưa di trú không vỡ.

- [ ] **Step 1: Viết Playwright test thất bại cho palette và CSS order**

Tạo test:

```ts
import { expect, test } from '@playwright/test';
import { TEACHER_USER, stubApi } from './helpers';

test('academic semantic palette thắng CSS legacy', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  const colors = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--ez-primary)';
    probe.style.color = 'var(--ez-text)';
    document.body.append(probe);
    const result = {
      primary: getComputedStyle(probe).backgroundColor,
      text: getComputedStyle(probe).color,
      nav: getComputedStyle(document.documentElement).getPropertyValue('--ez-nav-bg').trim(),
    };
    probe.remove();
    return result;
  });
  expect(colors.primary).toBe('rgb(23, 125, 115)');
  expect(colors.text).toBe('rgb(18, 45, 58)');
  expect(colors.nav).toBe('#123241');
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run:

```bash
cd frontend && npx playwright test e2e/design-foundation.spec.ts --project=desktop-1440
```

Expected: FAIL do `--ez-primary` hiện trỏ forest và chưa có `--ez-nav-bg` đúng giá trị.

- [ ] **Step 3: Thêm primitive/semantic academic palette**

Trong `tokens.css`, thêm hoặc thay semantic mapping bằng các giá trị neo sau:

```css
:root {
  --ez-ink-950: #0b202b;
  --ez-ink-900: #123241;
  --ez-ink-800: #1a4352;
  --ez-mineral-700: #0f6f68;
  --ez-mineral-600: #177d73;
  --ez-mineral-100: #dcefeb;
  --ez-gold-500: #e5b85b;
  --ez-paper-50: #f3f7f7;
  --ez-paper-100: #eaf1f0;

  --ez-nav-bg: var(--ez-ink-900);
  --ez-nav-text: #dceae8;
  --ez-nav-text-muted: #9fb7b5;
  --ez-primary: var(--ez-mineral-600);
  --ez-primary-hover: var(--ez-mineral-700);
  --ez-primary-subtle: var(--ez-mineral-100);
  --ez-accent: var(--ez-gold-500);
  --ez-bg: var(--ez-paper-50);
  --ez-surface: #ffffff;
  --ez-text: #122d3a;
  --ez-border: #dce6e5;

  --ez-motion-fast: 160ms;
  --ez-motion-base: 280ms;
  --ez-motion-slow: 520ms;
  --ez-ease-standard: cubic-bezier(.22, 1, .36, 1);
  --ez-ease-emphasized: cubic-bezier(.16, 1, .3, 1);
}
```

Giữ alias cũ trỏ về semantic mới; không xóa primitive cũ trong task này.

- [ ] **Step 4: Chuẩn hóa base/reduced-motion contract**

Đảm bảo `base.css` có:

```css
html[data-motion='reduced'] *,
html[data-motion='reduced'] *::before,
html[data-motion='reduced'] *::after {
  scroll-behavior: auto !important;
}

body {
  color: var(--ez-text);
  background: var(--ez-bg);
}
```

Không dùng rule toàn cục ép `animation-duration: 0.01ms`; MotionProvider và component chịu trách nhiệm chọn biến thể reduced-motion để tránh phá loading indicator cần thiết.

- [ ] **Step 5: Chạy test và build**

```bash
cd frontend && npx playwright test e2e/design-foundation.spec.ts --project=desktop-1440
cd frontend && npm run build
```

Expected: test PASS; build exit 0.

- [ ] **Step 6: Commit token foundation**

```bash
git add frontend/src/styles/tokens.css frontend/src/styles/base.css frontend/e2e/design-foundation.spec.ts
git commit -m "style: establish academic design tokens"
```

---

### Task 3: MotionProvider và reduced-motion runtime

**Files:**
- Create: `frontend/src/motion/MotionProvider.tsx`
- Create: `frontend/src/motion/useMotion.ts`
- Create: `frontend/src/motion/index.ts`
- Create: `frontend/e2e/motion-foundation.spec.ts`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Produces `MotionMode = 'full' | 'reduced'`.
- Produces `MotionContextValue = { mode: MotionMode; reducedMotion: boolean; coarsePointer: boolean }`.
- Produces `useMotion(): MotionContextValue`.

- [ ] **Step 1: Viết reduced-motion tests**

```ts
import { expect, test } from '@playwright/test';
import { TEACHER_USER, stubApi } from './helpers';

test.describe('motion preference', () => {
  test('đặt reduced mode theo hệ điều hành', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await stubApi(page, TEACHER_USER);
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await context.close();
  });

  test('dùng full mode khi không yêu cầu giảm', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await stubApi(page, TEACHER_USER);
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
    await context.close();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
cd frontend && npx playwright test e2e/motion-foundation.spec.ts --project=desktop-1440
```

Expected: FAIL vì `<html>` chưa có `data-motion`.

- [ ] **Step 3: Cài MotionProvider**

Triển khai context với contract:

```tsx
export type MotionMode = 'full' | 'reduced';

export interface MotionContextValue {
  mode: MotionMode;
  reducedMotion: boolean;
  coarsePointer: boolean;
}

export function MotionProvider({ children }: { children: ReactNode }) {
  // subscribe cả hai MediaQueryList; cleanup removeEventListener khi unmount
  // mode = reduced nếu reduce.matches, ngược lại full
  // đồng bộ document.documentElement.dataset.motion
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
```

`useMotion()` phải throw thông báo rõ khi gọi ngoài provider, không trả default giả.

- [ ] **Step 4: Bọc ThemeProvider/App đúng thứ tự**

Trong `main.tsx`:

```tsx
<StrictMode>
  <ThemeProvider>
    <MotionProvider>
      <App />
    </MotionProvider>
  </ThemeProvider>
</StrictMode>
```

- [ ] **Step 5: Chạy test, lint và build**

```bash
cd frontend && npx playwright test e2e/motion-foundation.spec.ts --project=desktop-1440
cd frontend && npm run lint -- src/motion src/main.tsx
cd frontend && npm run build
```

Expected: tất cả exit 0.

- [ ] **Step 6: Commit motion runtime**

```bash
git add frontend/src/motion/MotionProvider.tsx frontend/src/motion/useMotion.ts frontend/src/motion/index.ts frontend/src/main.tsx frontend/e2e/motion-foundation.spec.ts
git commit -m "feat: add accessible motion runtime"
```

---

### Task 4: Motion primitives dùng lại được

**Files:**
- Create: `frontend/src/motion/PageEntrance.tsx`
- Create: `frontend/src/motion/StaggerGroup.tsx`
- Create: `frontend/src/motion/AnimatedCounter.tsx`
- Create: `frontend/src/motion/MotionCard.tsx`
- Modify: `frontend/src/motion/index.ts`
- Modify: `frontend/e2e/motion-foundation.spec.ts`

**Interfaces:**
- `PageEntranceProps = { children: ReactNode; routeKey: string; className?: string }`.
- `StaggerGroupProps = { children: ReactNode; className?: string; selector?: string }` with default selector `[data-motion-item]`.
- `AnimatedCounterProps = { value: number; duration?: number; formatter?: (value: number) => string }`.
- `MotionCardProps = ComponentPropsWithoutRef<'div'> & { tilt?: number; lift?: number }`.

- [ ] **Step 1: Mở rộng e2e test cho entrance và counter**

Thêm assertions:

```ts
test('route content công bố motion contract và cleanup khi điều hướng', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  await expect(page.locator('[data-page-entrance]')).toBeVisible();
  await page.goto('/documents');
  await expect(page.locator('[data-page-entrance]')).toHaveCount(1);
  const orphaned = await page.locator('[data-page-entrance]').evaluateAll((nodes) =>
    nodes.filter((node) => !document.documentElement.contains(node)).length,
  );
  expect(orphaned).toBe(0);
});
```

Test này sẽ pass hoàn chỉnh sau Task 7; ở Task 4 tạo một fixture tạm thời bằng cách bọc content hiện tại trong `AppLayout` với `PageEntrance` ngay khi component hoàn thành.

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
cd frontend && npx playwright test e2e/motion-foundation.spec.ts --project=desktop-1440
```

Expected: FAIL vì chưa có `[data-page-entrance]`.

- [ ] **Step 3: Implement primitives bằng useGSAP**

Quy tắc bắt buộc:

```tsx
useGSAP(() => {
  if (reducedMotion) {
    gsap.set(targets, { clearProps: 'all' });
    return;
  }
  gsap.fromTo(targets,
    { autoAlpha: 0, y: 18 },
    { autoAlpha: 1, y: 0, duration: 0.58, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity,visibility' },
  );
}, { scope: rootRef, dependencies: [routeKey, reducedMotion], revertOnUpdate: true });
```

`MotionCard` dùng `gsap.quickTo()` cho `rotationX`/`rotationY`; bỏ tilt khi `coarsePointer` hoặc `reducedMotion`; pointer leave đưa card về `rotationX: 0`, `rotationY: 0`, `y: 0`.

`AnimatedCounter` animate một object `{ current: 0 }`, cập nhật text bằng `Math.round`, và render giá trị cuối ngay lập tức ở reduced mode.

- [ ] **Step 4: Export public API**

`motion/index.ts` chỉ export:

```ts
export { MotionProvider } from './MotionProvider';
export { useMotion } from './useMotion';
export { PageEntrance } from './PageEntrance';
export { StaggerGroup } from './StaggerGroup';
export { AnimatedCounter } from './AnimatedCounter';
export { MotionCard } from './MotionCard';
export type { MotionMode, MotionContextValue } from './MotionProvider';
```

- [ ] **Step 5: Chạy test và build**

```bash
cd frontend && npx playwright test e2e/motion-foundation.spec.ts --project=desktop-1440
cd frontend && npm run lint -- src/motion
cd frontend && npm run build
```

Expected: exit 0; không có React unmount warning trong browser console.

- [ ] **Step 6: Commit motion primitives**

```bash
git add frontend/src/motion frontend/e2e/motion-foundation.spec.ts frontend/src/components/AppLayout.tsx
git commit -m "feat: add reusable motion primitives"
```

---

### Task 5: Tách navigation model theo vai trò

**Files:**
- Create: `frontend/src/components/navigation.tsx`
- Modify: `frontend/src/components/AppLayout.tsx`
- Modify: `frontend/e2e/design-foundation.spec.ts`

**Interfaces:**
- `AppArea = 'student' | 'teacher' | 'admin'`.
- `NavItem = { to: string; label: string; icon: ReactNode; badge?: { value: number; label: string } }`.
- `NavGroup = { id: string; label?: string; collapsible?: boolean; items: NavItem[] }`.
- `buildNavigation(input: NavigationInput): NavGroup[]`.

- [ ] **Step 1: Viết test navigation theo vai trò**

Thêm ba test e2e:

```ts
test('student shell chỉ hiện hành trình học sinh', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await page.goto('/dashboard');
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' }).getByText('Tổng quan')).toBeVisible();
  await expect(page.getByText('Ngân hàng câu hỏi')).toHaveCount(0);
});

test('teacher shell hiện nhóm nghiệp vụ giáo viên', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  await expect(page.getByText('Học liệu')).toBeVisible();
  await expect(page.getByText('Ma trận đề')).toBeVisible();
});

test('admin navigation có nhóm thu gọn với aria-expanded', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await page.goto('/admin/dashboard');
  const trigger = page.getByRole('button', { name: 'Nội dung' });
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
```

Định nghĩa `STUDENT_USER` trong `helpers.ts` hoặc export fixture hiện có để không lặp dữ liệu.

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
cd frontend && npx playwright test e2e/design-foundation.spec.ts --project=desktop-1440
```

Expected: admin collapse test FAIL; các test role còn lại ghi nhận baseline.

- [ ] **Step 3: Tách buildGroups khỏi AppLayout**

`buildNavigation()` nhận:

```ts
export interface NavigationInput {
  area: AppArea;
  role?: string;
  permissions: string[];
  isFeatureEnabled: (flag: string) => boolean;
  badges: Partial<Record<'pendingExams', { value: number; label: string }>>;
}
```

Giữ nguyên route và permission hiện có. Admin groups có `id` ổn định và `collapsible: true`; nhóm chứa active route mặc định mở.

- [ ] **Step 4: Render accessible collapsible groups**

Trigger phải có `aria-expanded`, `aria-controls="nav-group-<id>"`; panel có id tương ứng và không giữ link focusable khi đóng.

- [ ] **Step 5: Chạy test/build**

```bash
cd frontend && npx playwright test e2e/design-foundation.spec.ts --project=desktop-1440
cd frontend && npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit navigation model**

```bash
git add frontend/src/components/navigation.tsx frontend/src/components/AppLayout.tsx frontend/e2e/design-foundation.spec.ts frontend/e2e/helpers.ts
git commit -m "refactor: centralize role navigation"
```

---

### Task 6: Redesign AppShell desktop/mobile

**Files:**
- Modify: `frontend/src/components/AppLayout.tsx`
- Modify: `frontend/src/components/app-layout.css`
- Modify: `frontend/e2e/design-foundation.spec.ts`
- Modify: `frontend/e2e/authenticated-responsive.spec.ts`

**Interfaces:**
- Consumes `buildNavigation()`, `useMotion()`, semantic tokens.
- Produces DOM hooks: `[data-app-shell]`, `[data-role-area]`, `[data-active-indicator]`, `.ez-sidebar`, `.ez-tabbar`.

- [ ] **Step 1: Viết shell contract tests**

```ts
test('desktop dùng navy sidebar và mobile dùng bottom navigation', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
  await expect(page.locator('.ez-sidebar')).toBeVisible();
  await expect(page.locator('.ez-tabbar')).toBeHidden();
  await expect(page.locator('.ez-sidebar')).toHaveCSS('background-color', 'rgb(18, 50, 65)');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.ez-sidebar')).toBeHidden();
  await expect(page.locator('.ez-tabbar')).toBeVisible();
});

test('active navigation không chỉ dựa vào màu', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/documents');
  const active = page.getByRole('link', { name: 'Học liệu' }).first();
  await expect(active).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-active-indicator]')).toBeVisible();
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
cd frontend && npx playwright test e2e/design-foundation.spec.ts --project=desktop-1440
```

Expected: FAIL ở màu sidebar hoặc active indicator contract.

- [ ] **Step 3: Sửa markup AppLayout**

Root:

```tsx
<div className="ez-shell" data-app-shell data-role-area={area}>
```

Thêm indicator riêng trong active link:

```tsx
{active ? <span className="ez-nav-active-indicator" data-active-indicator aria-hidden="true" /> : null}
```

Sidebar giữ brand, role navigation và user menu. Topbar/bottom nav giữ đầy đủ label đọc được và badge accessible.

- [ ] **Step 4: Sửa CSS theo academic shell**

Các giá trị chủ đạo:

```css
.ez-sidebar {
  width: 272px;
  background: var(--ez-nav-bg);
  color: var(--ez-nav-text);
  border-right: 0;
}

.ez-nav-item { color: var(--ez-nav-text-muted); }
.ez-nav-item:hover { color: var(--ez-nav-text); background: rgb(255 255 255 / 8%); }
.ez-nav-item-active { color: #fff; background: rgb(23 125 115 / 42%); }
.ez-nav-active-indicator { background: var(--ez-accent); }
.ez-main { max-width: 1560px; padding: 32px clamp(20px, 3vw, 48px); }
```

Ở dưới 1024px sidebar ẩn, topbar + tabbar hiện; dưới 640px giảm page padding nhưng giữ touch target 44px.

- [ ] **Step 5: Chạy responsive matrix và axe**

```bash
cd frontend && npx playwright test e2e/design-foundation.spec.ts e2e/authenticated-responsive.spec.ts --project=desktop-1440 --project=tablet-portrait-768 --project=mobile-390
cd frontend && npx playwright test e2e/accessibility.spec.ts --project=desktop-1440
```

Expected: PASS, không horizontal overflow.

- [ ] **Step 6: Commit AppShell**

```bash
git add frontend/src/components/AppLayout.tsx frontend/src/components/app-layout.css frontend/e2e/design-foundation.spec.ts frontend/e2e/authenticated-responsive.spec.ts
git commit -m "feat: redesign responsive role app shell"
```

---

### Task 7: Route entrance và navigation motion

**Files:**
- Modify: `frontend/src/components/AppLayout.tsx`
- Modify: `frontend/src/components/app-layout.css`
- Modify: `frontend/e2e/motion-foundation.spec.ts`

**Interfaces:**
- Consumes `PageEntrance`, `useMotion`.
- Route content wrapper luôn có `[data-page-entrance]` và key bằng `location.pathname`.

- [ ] **Step 1: Mở rộng motion test cho navigation**

```ts
test('reduced mode không để transform trên route content', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  const transform = await page.locator('[data-page-entrance]').evaluate((el) => getComputedStyle(el).transform);
  expect(transform).toBe('none');
  await context.close();
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
cd frontend && npx playwright test e2e/motion-foundation.spec.ts --project=desktop-1440
```

Expected: FAIL nếu route content chưa dùng PageEntrance hoặc còn transform ở reduced mode.

- [ ] **Step 3: Bọc page content**

```tsx
<main id="main" className="ez-main" tabIndex={-1}>
  <PageEntrance routeKey={location.pathname}>
    {children}
  </PageEntrance>
</main>
```

Active nav indicator animate bằng `gsap.fromTo()` trong scope sidebar, duration 0.28s, `ease: 'power2.out'`; reduced mode cập nhật tức thì.

- [ ] **Step 4: Chạy motion test và kiểm tra console**

```bash
cd frontend && npx playwright test e2e/motion-foundation.spec.ts e2e/design-foundation.spec.ts --project=desktop-1440 --project=mobile-390
```

Expected: PASS; `captureBrowserErrors()` rỗng.

- [ ] **Step 5: Commit route motion**

```bash
git add frontend/src/components/AppLayout.tsx frontend/src/components/app-layout.css frontend/e2e/motion-foundation.spec.ts
git commit -m "feat: animate app navigation transitions"
```

---

### Task 8: Foundation quality gate và bằng chứng responsive

**Files:**
- Modify: `frontend/e2e/design-foundation.spec.ts`
- Modify: `frontend/e2e/motion-foundation.spec.ts`
- Modify: `frontend/package.json`
- Create: `docs/ui-redesign/2026-08-14-foundation-verification.md`

**Interfaces:**
- Produces script `test:foundation`.
- Produces verification report ghi command, viewport, kết quả và các nợ legacy còn lại.

- [ ] **Step 1: Thêm script quality gate**

```json
"test:foundation": "playwright test e2e/design-foundation.spec.ts e2e/motion-foundation.spec.ts e2e/accessibility.spec.ts"
```

- [ ] **Step 2: Chạy lint/build/full foundation matrix**

```bash
cd frontend && npm run lint
cd frontend && npm run build
cd frontend && npm run test:foundation
```

Expected: tất cả exit 0 trên sáu project Playwright.

- [ ] **Step 3: Chạy authenticated responsive suite**

```bash
cd frontend && npx playwright test e2e/authenticated-responsive.spec.ts
```

Expected: PASS toàn bộ route hiện có; không overflow và không browser error.

- [ ] **Step 4: Ghi báo cáo bằng chứng**

Tài liệu phải ghi đúng:

```md
# Foundation verification — 2026-08-14

## Commands
- `npm run lint`: PASS
- `npm run build`: PASS
- `npm run test:foundation`: PASS
- `npx playwright test e2e/authenticated-responsive.spec.ts`: PASS

## Verified contracts
- Academic semantic palette wins legacy CSS.
- Desktop sidebar and mobile bottom navigation switch at 1024px.
- Student/teacher/admin navigation remains role-correct.
- Full and reduced motion both render without overflow or axe violations.

## Deferred to later slices
- Page-specific dashboard/card redesign.
- Student chat/exam choreography.
- Teacher/admin page density migration.
- Landing ScrollTrigger narrative.
- Deletion of legacy CSS after the final consumer audit.
```

Nếu command nào fail, ghi failure thật và không đánh dấu task hoàn thành cho tới khi sửa và chạy lại pass.

- [ ] **Step 5: Commit quality gate**

```bash
git add frontend/package.json frontend/e2e/design-foundation.spec.ts frontend/e2e/motion-foundation.spec.ts docs/ui-redesign/2026-08-14-foundation-verification.md
git commit -m "test: verify redesign foundation"
```

---

## Self-review

- Spec coverage của lát foundation: academic token, một nguồn semantic, motion runtime, reduced motion, reusable primitives, role sidebar, admin collapse, mobile bottom nav, route entrance, responsive/accessibility/performance contract.
- Chủ động hoãn sang kế hoạch sau: nội dung dashboard, chat tạo đề, exam runner, teacher/admin pages, landing/auth/onboarding và xóa CSS legacy.
- Không có thay đổi backend trong plan.
- Tất cả interface dùng nhất quán: `MotionContextValue`, `PageEntrance`, `buildNavigation`, `NavGroup`, `data-motion`, `data-page-entrance`.
