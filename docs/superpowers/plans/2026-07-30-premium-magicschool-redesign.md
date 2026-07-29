# Premium MagicSchool-inspired Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign EzEdu AI into an original, lively editorial classroom experience across the public site, authentication shell, application chrome, and role dashboards without changing routes, API contracts, permissions, or business workflows.

**Architecture:** Keep the React 19/Vite application and vanilla-CSS token system. Establish the visual foundation first, split the 949-line landing component into focused section modules, then build the public experience and finally reskin the shared app shell and dashboards. Playwright tests protect visual contracts and existing behavior; generated brand art is stored locally and never loaded from a third-party runtime.

**Tech Stack:** React 19, TypeScript 6, Vite 8, React Router 7, vanilla CSS custom properties, Lucide React, Playwright 1.62, Axe Playwright, FastAPI pytest suite. No new npm runtime dependency.

## Global Constraints

- Reference spec: `docs/superpowers/specs/2026-07-30-premium-magicschool-redesign-design.md`.
- Use `Be Vietnam Pro` with weights 400, 500, 600, and 800 and a `system-ui, sans-serif` fallback.
- Reference palette: cream `#FBF6EA`, ink `#251A36`, interactive purple `#5C3AD7`, coral `#FF7B61`, sun `#FFC857`, dark canvas `#171322`.
- Purple is the only interactive brand accent; coral and sun are decorative surfaces only.
- Preserve all existing routes, API contracts, auth context behavior, role guards, CMS merging, and backend business rules.
- Preserve public upload rules: PDF/DOCX/PPTX up to 20MB; MP4/MOV/WEBM/MKV up to 100MB.
- Preserve role behavior: teacher → `/documents`, admin → `/admin/documents`, student → guidance, anonymous user → registration gate.
- Do not fabricate statistics, testimonials, certifications, integrations, or partner logos.
- Do not copy MagicSchool CSS, text, SVGs, or imagery.
- Store original art locally in `frontend/src/assets/brand/`; production must not fetch brand art from a remote service.
- Animate only `transform` and `opacity`; disable decorative motion under `prefers-reduced-motion: reduce`.
- Maintain WCAG AA contrast, visible focus, semantic heading order, keyboard navigation, 44×44px touch targets, and zero horizontal overflow at 390px.
- Use `apply_patch` for source edits. Use `ffmpeg` only for mechanical PNG-to-WebP conversion.
- Every task must preserve a working build and end with a focused commit.

---

## File Structure

### New files

- `frontend/e2e/premium-redesign.spec.ts` — visual and behavior contracts specific to this redesign.
- `docs/superpowers/reports/2026-07-30-premium-redesign-verification.md` — final command and browser evidence.
- `frontend/src/assets/brand/hero-classroom.webp` — original hero classroom collage.
- `frontend/src/assets/brand/teacher-workspace.webp` — original teacher showcase art.
- `frontend/src/assets/brand/student-practice.webp` — original student showcase art.
- `frontend/src/components/public/BrandArtwork.tsx` — typed access to the three local art assets.
- `frontend/src/components/public/Reveal.tsx` — IntersectionObserver entrance reveal with reduced-motion fallback.
- `frontend/src/components/public/SectionIntro.tsx` — consistent but flexible section heading primitive.
- `frontend/src/components/public/ProductMockup.tsx` — static product UI frame with no API calls.
- `frontend/src/components/public/landing/constants.ts` — upload limits, supported extensions, and static truthful copy.
- `frontend/src/components/public/landing/HeroSection.tsx` — hero only.
- `frontend/src/components/public/landing/AudienceMosaic.tsx` — teacher/student/classroom mosaic only.
- `frontend/src/components/public/landing/PrimaryToolSection.tsx` — public file-validation and role-routing UI.
- `frontend/src/components/public/landing/ProcessTimeline.tsx` — three-step process presentation.
- `frontend/src/components/public/landing/RoleShowcases.tsx` — teacher and student tool showcases.
- `frontend/src/components/public/landing/SupportingSections.tsx` — features, trust, FAQ, stats, testimonial, CTA exports.
- `frontend/src/components/public/landing/index.ts` — stable public exports.
- `frontend/src/components/public/styles/public-foundation.css` — public tokens, typography, header, footer.
- `frontend/src/components/public/styles/public-hero.css` — hero and artwork composition.
- `frontend/src/components/public/styles/public-sections.css` — mosaic, upload, timeline, showcase, FAQ, CTA.
- `frontend/src/components/public/styles/public-responsive.css` — public breakpoints and reduced motion.

### Existing files modified

- `frontend/src/index.css` — replace the Inter font import.
- `frontend/src/styles/tokens.css` — new primitives, semantics, shadows, typography, and motion tokens.
- `frontend/src/components/ui/ui.css` — button/card/input interaction polish using tokens.
- `frontend/src/components/public/LandingSections.tsx` — compatibility re-export after the split.
- `frontend/src/components/public/public-page.css` — CSS import manifest.
- `frontend/src/components/public/PublicHeader.tsx` — floating brand header and mobile drawer contract.
- `frontend/src/components/public/AnnouncementBar.tsx` — presentation polish; dismissal behavior remains unchanged.
- `frontend/src/components/public/PublicFooter.tsx` — compact footer and safe policy-link resolution.
- `frontend/src/pages/landing/index.tsx` — new landing composition and CMS announcement derivation.
- `frontend/src/pages/PublicInfoPages.tsx` — editorial public page masthead.
- `frontend/src/components/PublicLayout.tsx` — two-column authentication shell.
- `frontend/src/components/PublicLayout.css` — art-directed auth/status layout using semantic tokens.
- `frontend/src/pages/LoginPage.tsx` — semantic form feedback only; submit logic unchanged.
- `frontend/src/pages/RegisterPage.tsx` — semantic form feedback only; submit logic unchanged.
- `frontend/src/components/AppLayout.tsx` — workspace-shell markers and `aria-current`; nav data logic unchanged.
- `frontend/src/components/app-layout.css` — workspace rail, mobile top bar/tab bar, app canvas.
- `frontend/src/pages/teacher/TeacherDashboardPage.tsx` — branded greeting art and layout markers.
- `frontend/src/pages/student/StudentDashboardPage.tsx` — branded greeting art and layout markers.
- `frontend/src/pages/dashboard.css` — asymmetric dashboard composition and states.
- `frontend/src/pages/AdminDashboardPage.css` — token-only administrative surface polish.
- `frontend/e2e/helpers.ts` — deterministic CMS and successful dashboard fixtures.

---

### Task 1: Lock existing behavior before the landing split

**Files:**
- Create: `frontend/e2e/premium-redesign.spec.ts`
- Modify: `frontend/e2e/helpers.ts`

**Interfaces:**
- Consumes: existing `stubApi`, `expectNoBrokenImages`, and `expectNoPageOverflow`.
- Produces: `stubSuccessfulTeacherDashboard(page)`,
  `stubWebsiteContent(page, items)`, and characterization tests used throughout
  the redesign.

- [ ] **Step 1: Add deterministic dashboard and CMS fixtures**

Add to `frontend/e2e/helpers.ts`:

```ts
export async function stubSuccessfulTeacherDashboard(page: Page) {
  await page.route('**/api/v1/documents', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/v1/questions/my-history**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], next_cursor: null, has_more: false }),
    }),
  );
  await page.route('**/api/v1/classes', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    }),
  );
}

export async function stubWebsiteContent(
  page: Page,
  items: Array<{
    section_key: string;
    content: Record<string, unknown>;
    version: number;
    published_at: string | null;
  }>,
) {
  await page.route('**/api/v1/website-content', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        generated_at: '2026-07-30T00:00:00Z',
      }),
    }),
  );
}
```

- [ ] **Step 2: Write characterization tests for upload and truthful optional content**

Create `frontend/e2e/premium-redesign.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import {
  TEACHER_USER,
  expectNoBrokenImages,
  expectNoPageOverflow,
  stubApi,
  stubSuccessfulTeacherDashboard,
  stubWebsiteContent,
} from './helpers';

test('guest file validation and registration gate remain functional', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  const input = page.getByLabel('Chọn học liệu để kiểm tra');

  await input.setInputFiles({
    name: 'lesson.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('unsupported'),
  });
  await expect(page.getByText(/Chưa hỗ trợ định dạng \\.exe/)).toBeVisible();

  await input.setInputFiles({
    name: 'lesson.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4'),
  });
  await expect(page.getByRole('heading', { name: 'Cần tài khoản để xử lý học liệu' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tạo tài khoản miễn phí' })).toHaveAttribute('href', '/register');
});

test('empty real-data sections stay hidden and the page remains sound', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Số liệu sử dụng thực tế' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Được tin dùng bởi giáo viên và học sinh' })).toHaveCount(0);
  await expectNoBrokenImages(page);
  await expectNoPageOverflow(page);
});
```

- [ ] **Step 3: Run the characterization tests**

Run:

```bash
cd frontend
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440
```

Expected: 2 tests pass against the existing implementation.

- [ ] **Step 4: Commit the behavior locks**

```bash
git add frontend/e2e/helpers.ts frontend/e2e/premium-redesign.spec.ts
git commit -m "test: lock public upload and truthful-content behavior"
```

---

### Task 2: Split the 949-line landing module without changing behavior

**Files:**
- Create: all files under `frontend/src/components/public/landing/` listed in File Structure.
- Modify: `frontend/src/components/public/LandingSections.tsx`
- Modify: `frontend/src/pages/landing/index.tsx`
- Modify: `frontend/src/pages/PublicInfoPages.tsx`

**Interfaces:**
- Consumes: existing named exports from `LandingSections.tsx`.
- Produces: the same named exports from `frontend/src/components/public/landing/index.ts`.

- [ ] **Step 1: Record the current export contract**

Append to `frontend/e2e/premium-redesign.spec.ts`:

```ts
test('landing and public information routes expose their existing headings', async ({ page }) => {
  await stubApi(page);
  for (const [path, heading] of [
    ['/', /Biến học liệu thành trải nghiệm học tập thông minh/i],
    ['/how-it-works', 'Cách EzEdu AI hoạt động'],
    ['/features', 'Tính năng chính'],
    ['/faq', 'Câu hỏi thường gặp'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  }
});
```

- [ ] **Step 2: Run the export contract**

Run:

```bash
cd frontend
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "existing headings"
```

Expected: pass before refactoring.

- [ ] **Step 3: Move constants and components into focused modules**

Move code without changing copy or callbacks. Export the file-validation contract from
`landing/constants.ts`:

```ts
export const DOC_EXT = ['pdf', 'docx', 'pptx'] as const;
export const VIDEO_EXT = ['mp4', 'mov', 'webm', 'mkv'] as const;
export const DOC_MAX_MB = 20;
export const VIDEO_MAX_MB = 100;

export function validatePublicFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const sizeMb = file.size / (1024 * 1024);
  if ((DOC_EXT as readonly string[]).includes(ext)) {
    return sizeMb > DOC_MAX_MB
      ? `Tài liệu vượt quá ${DOC_MAX_MB}MB. Hãy tách nhỏ tệp rồi thử lại.`
      : null;
  }
  if ((VIDEO_EXT as readonly string[]).includes(ext)) {
    return sizeMb > VIDEO_MAX_MB
      ? `Video vượt quá ${VIDEO_MAX_MB}MB. Hãy nén lại hoặc cắt ngắn rồi thử lại.`
      : null;
  }
  return `Chưa hỗ trợ định dạng .${ext || 'này'}. Hãy dùng PDF, DOCX, PPTX hoặc MP4, MOV, WEBM, MKV.`;
}
```

Replace `LandingSections.tsx` with compatibility exports:

```ts
export {
  BuiltForLearning,
  Faq,
  FeaturesByRole,
  FinalCta,
  Hero,
  HowItWorks,
  IntegrationsTeaser,
  PrimaryTool,
  QuickExamples,
  StatsBlock,
  StudentToolsShowcase,
  TeacherToolsShowcase,
  TestimonialBlock,
  TrustBlock,
  WhyEzEdu,
} from './landing';
```

- [ ] **Step 4: Verify refactor parity**

Run:

```bash
cd frontend
npx tsc -b --force
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440
```

Expected: typecheck and all characterization tests pass.

- [ ] **Step 5: Commit the split**

```bash
git add frontend/src/components/public/landing frontend/src/components/public/LandingSections.tsx frontend/src/pages/landing/index.tsx frontend/src/pages/PublicInfoPages.tsx
git commit -m "refactor: split public landing sections by responsibility"
```

---

### Task 3: Establish the premium visual foundation

**Files:**
- Modify: `frontend/e2e/premium-redesign.spec.ts`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/styles/tokens.css`
- Modify: `frontend/src/components/ui/ui.css`

**Interfaces:**
- Consumes: existing three-layer token system.
- Produces: `--ez-brand-cream`, `--ez-brand-ink`, `--ez-brand-purple`, `--ez-brand-coral`, `--ez-brand-sun`, `--ez-brand-dark`, and updated semantic tokens.

- [ ] **Step 1: Write the failing token contract**

Append:

```ts
test('premium palette and Vietnamese typography tokens are active', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  const values = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return {
      cream: css.getPropertyValue('--ez-brand-cream').trim(),
      ink: css.getPropertyValue('--ez-brand-ink').trim(),
      purple: css.getPropertyValue('--ez-brand-purple').trim(),
      coral: css.getPropertyValue('--ez-brand-coral').trim(),
      sun: css.getPropertyValue('--ez-brand-sun').trim(),
      font: css.getPropertyValue('--ez-font-sans').trim(),
    };
  });
  expect(values).toEqual({
    cream: '#fbf6ea',
    ink: '#251a36',
    purple: '#5c3ad7',
    coral: '#ff7b61',
    sun: '#ffc857',
    font: "'Be Vietnam Pro', system-ui, sans-serif",
  });
});
```

- [ ] **Step 2: Run the token contract to verify red**

Run:

```bash
cd frontend
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "premium palette"
```

Expected: fail because the brand tokens and font do not exist.

- [ ] **Step 3: Replace the font import and add exact primitives**

Replace the Inter import in `frontend/src/index.css` with:

```css
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;800&display=swap');
```

Add to the primitive token block:

```css
--ez-brand-cream: #fbf6ea;
--ez-brand-ink: #251a36;
--ez-brand-purple: #5c3ad7;
--ez-brand-coral: #ff7b61;
--ez-brand-sun: #ffc857;
--ez-brand-dark: #171322;
```

Replace the font token with:

```css
--ez-font-sans: 'Be Vietnam Pro', system-ui, sans-serif;
```

Update light/dark semantic surfaces so body text and controls pass AA:

```css
:root {
  --ez-bg: var(--ez-brand-cream);
  --ez-text: var(--ez-brand-ink);
  --ez-primary: var(--ez-brand-purple);
  --ez-public-canvas: var(--ez-brand-cream);
  --ez-public-ink: var(--ez-brand-ink);
  --ez-public-coral: var(--ez-brand-coral);
  --ez-public-sun: var(--ez-brand-sun);
  --ez-shadow-brand: 0 24px 60px rgba(71, 42, 125, 0.16);
  --ez-duration-reveal: 560ms;
  --ez-ease-spring: cubic-bezier(0.22, 1, 0.36, 1);
}

[data-theme='dark'] {
  --ez-bg: var(--ez-brand-dark);
  --ez-public-canvas: var(--ez-brand-dark);
  --ez-public-ink: #f8f2ff;
}
```

- [ ] **Step 4: Polish primitive interaction states**

In `ui.css`, keep component signatures unchanged and add token-based hover/press:

```css
.ez-btn {
  transition:
    color var(--ez-duration-fast) var(--ez-ease-standard),
    background-color var(--ez-duration-fast) var(--ez-ease-standard),
    border-color var(--ez-duration-fast) var(--ez-ease-standard),
    transform var(--ez-duration-base) var(--ez-ease-spring),
    box-shadow var(--ez-duration-base) var(--ez-ease-standard);
}

.ez-btn:not(:disabled):hover { transform: translateY(-2px); }
.ez-btn:not(:disabled):active { transform: translateY(0) scale(0.98); }
```

- [ ] **Step 5: Verify foundation**

Run:

```bash
cd frontend
npx tsc -b --force
npm run lint
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "premium palette"
```

Expected: all commands pass.

- [ ] **Step 6: Commit foundation**

```bash
git add frontend/e2e/premium-redesign.spec.ts frontend/src/index.css frontend/src/styles/tokens.css frontend/src/components/ui/ui.css
git commit -m "feat(design): establish editorial classroom foundation"
```

---

### Task 4: Generate original artwork and build the hero/header

**Files:**
- Create: three WebP files under `frontend/src/assets/brand/`
- Create: `frontend/src/components/public/BrandArtwork.tsx`
- Create: `frontend/src/components/public/Reveal.tsx`
- Create: `frontend/src/components/public/SectionIntro.tsx`
- Create: `frontend/src/components/public/styles/public-foundation.css`
- Create: `frontend/src/components/public/styles/public-hero.css`
- Create: `frontend/src/components/public/styles/public-sections.css`
- Create: `frontend/src/components/public/styles/public-responsive.css`
- Modify: `frontend/src/components/public/landing/HeroSection.tsx`
- Modify: `frontend/src/components/public/PublicHeader.tsx`
- Modify: `frontend/src/components/public/AnnouncementBar.tsx`
- Modify: `frontend/src/components/public/public-page.css`
- Modify: `frontend/src/pages/landing/index.tsx`
- Modify: `frontend/e2e/premium-redesign.spec.ts`

**Interfaces:**
- Produces: `BrandArtwork({ variant, className, eager })`,
  `Reveal({ children, className, delay })`, and
  `SectionIntro({ eyebrow, title, description, align, titleId })`.
- Consumes: CMS `site_identity`, `header`, `hero`, and a generic `sections.items` entry with key `announcement`.

- [ ] **Step 1: Write failing hero, announcement, and reduced-motion tests**

Append:

```ts
test('editorial hero uses local brand art and real CTA routes', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  const hero = page.locator('[data-layout="editorial-hero"]');
  await expect(hero).toBeVisible();
  await expect(hero.getByRole('img', { name: /giáo viên và học sinh Việt Nam/i })).toBeVisible();
  await expect(hero.getByRole('link', { name: /Bắt đầu miễn phí/i })).toHaveAttribute('href', '/register');
  await expectNoBrokenImages(page);
});

test('reduced motion reveals content without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubApi(page);
  await page.goto('/');
  const reveal = page.locator('[data-reveal]').first();
  await expect(reveal).toHaveAttribute('data-visible', 'true');
  await expect(reveal).toHaveCSS('transition-duration', '0s');
});

test('published CMS announcement is rendered and dismissible', async ({ page }) => {
  await stubApi(page);
  await stubWebsiteContent(page, [{
    section_key: 'sections',
    content: {
      items: [{
        key: 'announcement',
        title: 'Tài nguyên mới cho giáo viên',
        eyebrow: 'Thông báo',
        description: 'Khám phá bộ công cụ chuẩn bị bài giảng mới.',
        enabled: true,
        order: 0,
      }],
    },
    version: 1,
    published_at: '2026-07-30T00:00:00Z',
  }]);
  await page.goto('/');
  const announcement = page.getByRole('region', { name: 'Thông báo' });
  await expect(announcement).toContainText('Khám phá bộ công cụ chuẩn bị bài giảng mới.');
  await announcement.getByRole('button', { name: 'Đóng thông báo' }).click();
  await expect(announcement).toBeHidden();
});
```

- [ ] **Step 2: Run the tests to verify red**

Run:

```bash
cd frontend
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "editorial hero|reduced motion"
```

Expected: fail because `data-layout`, local art, `Reveal`, and the CMS announcement
wiring do not exist.

- [ ] **Step 3: Generate three original images**

Use the image generation skill with these exact briefs:

```text
Hero: editorial paper-cut collage, Vietnamese female teacher and three Vietnamese
secondary-school students collaborating around a laptop and printed lesson sheets,
warm ivory classroom, coral and royal-purple paper shapes, natural joyful expressions,
premium education campaign photography, no text, no logos, wide 4:3 composition.

Teacher: Vietnamese teacher preparing a lesson with laptop, handwritten notes and
presentation slides, candid editorial photography blended with subtle paper-cut
shapes, warm cream/coral/purple palette, no text, no logos, portrait 4:5 composition.

Student: two Vietnamese secondary-school students practicing questions on a tablet
and discussing an answer, confident and focused, editorial photography with subtle
yellow and purple classroom collage elements, no text, no logos, portrait 4:5 composition.
```

Save generated PNGs in a temporary directory, then convert mechanically:

```bash
mkdir -p frontend/src/assets/brand
ffmpeg -y -i /absolute/temp/hero-classroom.png -c:v libwebp -quality 84 -compression_level 6 frontend/src/assets/brand/hero-classroom.webp
ffmpeg -y -i /absolute/temp/teacher-workspace.png -c:v libwebp -quality 84 -compression_level 6 frontend/src/assets/brand/teacher-workspace.webp
ffmpeg -y -i /absolute/temp/student-practice.png -c:v libwebp -quality 84 -compression_level 6 frontend/src/assets/brand/student-practice.webp
```

- [ ] **Step 4: Add typed artwork and reveal primitives**

Implement `BrandArtwork.tsx`:

```tsx
import hero from '../../assets/brand/hero-classroom.webp';
import teacher from '../../assets/brand/teacher-workspace.webp';
import student from '../../assets/brand/student-practice.webp';

const ART = {
  hero: {
    src: hero,
    alt: 'Giáo viên và học sinh Việt Nam cùng chuẩn bị bài học với EzEdu AI',
  },
  teacher: {
    src: teacher,
    alt: 'Giáo viên Việt Nam chuẩn bị học liệu và câu hỏi trên máy tính',
  },
  student: {
    src: student,
    alt: 'Học sinh Việt Nam luyện tập và thảo luận câu trả lời',
  },
} as const;

export type BrandArtworkVariant = keyof typeof ART;

export default function BrandArtwork({
  variant,
  className,
  eager = false,
}: {
  variant: BrandArtworkVariant;
  className?: string;
  eager?: boolean;
}) {
  const art = ART[variant];
  return (
    <img
      src={art.src}
      alt={art.alt}
      className={className}
      data-brand-art={variant}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding="async"
    />
  );
}
```

Implement `Reveal.tsx` with `IntersectionObserver`, fallback to visible when the API is unavailable, and set `data-visible="true"` immediately for reduced motion. The rendered root must be:

```tsx
<div
  ref={ref}
  className={`ez-reveal ${className ?? ''}`}
  data-reveal=""
  data-visible={visible ? 'true' : 'false'}
  style={{ '--ez-reveal-delay': `${delay}ms` } as React.CSSProperties}
>
  {children}
</div>
```

Implement `SectionIntro.tsx`:

```tsx
export default function SectionIntro({
  eyebrow,
  title,
  description,
  align = 'left',
  titleId,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  titleId: string;
}) {
  return (
    <header className={`ezp-section-intro ezp-section-intro--${align}`}>
      <span className="ezp-eyebrow">{eyebrow}</span>
      <h2 className="ezp-title" id={titleId}>{title}</h2>
      {description && <p className="ezp-lede">{description}</p>}
    </header>
  );
}
```

- [ ] **Step 5: Build the hero and derive a truthful announcement**

In `pages/landing/index.tsx`, derive the optional announcement:

```ts
const announcement = content.sections.items.find(
  (item) => item.key === 'announcement' && item.enabled,
);
```

Render:

```tsx
<AnnouncementBar
  message={announcement?.description || announcement?.title || null}
  href="/features"
  ctaLabel="Khám phá"
/>
```

Update the hero root to:

```tsx
<section className="ezp-hero" aria-labelledby="hero-title" data-layout="editorial-hero">
```

Use `<BrandArtwork variant="hero" eager className="ezp-hero-photo" />`, one primary
button, one outline/text action, and the existing `homePath`/auth decisions. Wrap
the copy column and artwork column in separate `Reveal` components with delays
`0` and `120`.

- [ ] **Step 6: Add the public CSS manifest and motion contract**

First partition every existing rule from `public-page.css` without changing its
declarations:

- root/container/header/footer/typography rules → `public-foundation.css`;
- hero/art rules → `public-hero.css`;
- section/card/upload/FAQ/CTA rules → `public-sections.css`;
- every media query → `public-responsive.css`.

Set `public-page.css` to:

```css
@import './styles/public-foundation.css';
@import './styles/public-hero.css';
@import './styles/public-sections.css';
@import './styles/public-responsive.css';
```

Replace the migrated hero layout with:

```css
.ezp-root {
  min-height: 100dvh;
  background: var(--ez-public-canvas);
  color: var(--ez-public-ink);
}

.ezp-container {
  width: min(calc(100% - 2 * var(--ez-container-pad)), var(--ez-container-xl));
  margin-inline: auto;
}

.ezp-hero {
  position: relative;
  overflow: clip;
  padding-block: clamp(5rem, 10vw, 9rem) clamp(6rem, 11vw, 10rem);
}

.ezp-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(22rem, 0.9fr);
  align-items: center;
  gap: clamp(2rem, 6vw, 6rem);
}

.ezp-hero-title {
  max-width: 12ch;
  font-size: clamp(3rem, 6.2vw, 6.25rem);
  font-weight: 800;
  line-height: 0.98;
  letter-spacing: -0.055em;
  text-wrap: balance;
}

.ezp-hero-photo {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 42% 58% 52% 48% / 38% 42% 58% 62%;
  box-shadow: var(--ez-shadow-brand);
}
```

Use these reveal rules:

```css
.ez-reveal {
  opacity: 0;
  transform: translateY(1.5rem);
  transition:
    opacity var(--ez-duration-reveal) var(--ez-ease-spring),
    transform var(--ez-duration-reveal) var(--ez-ease-spring);
  transition-delay: var(--ez-reveal-delay, 0ms);
}

.ez-reveal[data-visible='true'] {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .ez-reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

- [ ] **Step 7: Verify hero, mobile drawer, announcement, and reduced motion**

Run:

```bash
cd frontend
npx tsc -b --force
npm run lint
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "editorial hero|reduced motion|CMS announcement"
npx playwright test e2e/public-responsive.spec.ts --project=mobile-390 --grep "^/ "
```

Expected: all commands pass; hero art is loaded and mobile has no overflow.

- [ ] **Step 8: Commit hero and art**

```bash
git add frontend/src/assets/brand frontend/src/components/public frontend/src/pages/landing/index.tsx frontend/e2e/premium-redesign.spec.ts
git commit -m "feat(public): add original editorial hero experience"
```

---

### Task 5: Replace equal cards with the audience mosaic and product demo

**Files:**
- Create: `frontend/src/components/public/ProductMockup.tsx`
- Modify: `frontend/src/components/public/landing/AudienceMosaic.tsx`
- Modify: `frontend/src/components/public/landing/PrimaryToolSection.tsx`
- Modify: `frontend/src/components/public/styles/public-sections.css`
- Modify: `frontend/e2e/premium-redesign.spec.ts`

**Interfaces:**
- Consumes: `validatePublicFile`, auth `status`/`area`, and `useNavigate`.
- Produces: `[data-layout="audience-mosaic"]` and `[data-product-demo="upload"]`.

- [ ] **Step 1: Write failing mosaic/product-demo tests**

Append:

```ts
test('audience content uses a mosaic and the upload demo keeps its states', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  const mosaic = page.locator('[data-layout="audience-mosaic"]');
  await expect(mosaic).toBeVisible();
  await expect(mosaic.locator('article')).toHaveCount(3);

  const demo = page.locator('[data-product-demo="upload"]');
  await expect(demo).toBeVisible();
  await expect(demo).toContainText('PDF');
  await expect(demo).toContainText('100MB');
});
```

- [ ] **Step 2: Verify red**

Run:

```bash
cd frontend
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "audience content"
```

Expected: fail because the two data contracts do not exist.

- [ ] **Step 3: Implement asymmetric markup**

Use this stable mosaic shape:

```tsx
<div className="ezp-audience-mosaic" data-layout="audience-mosaic">
  <article className="ezp-audience-card ezp-audience-card--teacher">
    <Users aria-hidden="true" />
    <h3>Dành cho giáo viên</h3>
    <p>Soạn đề và ban hành cho lớp nhanh hơn, vẫn giữ quyền rà soát cuối cùng.</p>
    <Link to="/features#giao-vien">Xem công cụ giáo viên</Link>
  </article>
  <article className="ezp-audience-card ezp-audience-card--student">
    <GraduationCap aria-hidden="true" />
    <h3>Dành cho học sinh</h3>
    <p>Luyện tập, hỏi đáp có nguồn và nhìn lại tiến độ của chính mình.</p>
    <Link to="/features#hoc-sinh">Xem cách học</Link>
  </article>
  <article className="ezp-audience-card ezp-audience-card--classroom">
    <ClipboardList aria-hidden="true" />
    <h3>Quản lý lớp học</h3>
    <p>Tạo lớp, thêm học sinh và giao đúng đề cho đúng nhóm.</p>
    <Link to="/how-it-works">Xem quy trình</Link>
  </article>
</div>
```

Use CSS Grid:

```css
.ezp-audience-mosaic {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.65fr);
  grid-template-areas: "teacher student" "teacher classroom";
  gap: clamp(1rem, 2vw, 1.75rem);
}
```

Give each card a distinct aspect ratio, surface color, and radius. Do not add a
border/shadow pair to every card.

- [ ] **Step 4: Implement the static product-frame primitive**

Create `ProductMockup.tsx`:

```tsx
import type { ReactNode } from 'react';

export default function ProductMockup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ezp-mockup ${className ?? ''}`} aria-label={label}>
      <div className="ezp-mockup__bar" aria-hidden="true">
        <span /><span /><span />
      </div>
      <div className="ezp-mockup__body">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Reskin PrimaryTool without changing callbacks**

Insert this opening block immediately before the current hidden file input
created in Task 2:

```tsx
<div className="ezp-product-demo" data-product-demo="upload">
  <div className="ezp-product-demo__chrome" aria-hidden="true">
    <span className="ezp-product-demo__dot" />
    <span className="ezp-product-demo__dot" />
    <span className="ezp-product-demo__dot" />
    <strong>Học liệu mới</strong>
  </div>
  <div className="ezp-product-demo__workspace">
```

Keep the contiguous input, dropzone, metadata, and four `ToolState` branches
inside that workspace without editing their callbacks or text. Immediately
after the `studentInfo` branch, close the workspace and add:

```tsx
  </div>
  <aside className="ezp-product-demo__notes" aria-label="Định dạng được hỗ trợ">
    <strong>Tài liệu</strong>
    <span>PDF · DOCX · PPTX · tối đa 20MB</span>
    <strong>Video bài giảng</strong>
    <span>MP4 · MOV · WEBM · MKV · tối đa 100MB</span>
  </aside>
</div>
```

Keep `handleFile`, accepted extensions, error strings, and role navigation byte-for-byte equivalent to the characterization tests.

- [ ] **Step 6: Verify behavior and layout**

Run:

```bash
cd frontend
npx tsc -b --force
npm run lint
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440
npx playwright test e2e/premium-redesign.spec.ts --project=mobile-390
```

Expected: all tests pass and neither viewport overflows.

- [ ] **Step 7: Commit mosaic and product demo**

```bash
git add frontend/src/components/public/ProductMockup.tsx frontend/src/components/public/landing frontend/src/components/public/styles/public-sections.css frontend/e2e/premium-redesign.spec.ts
git commit -m "feat(public): add audience mosaic and tactile upload demo"
```

---

### Task 6: Build the process timeline and role showcases

**Files:**
- Modify: `frontend/src/components/public/landing/ProcessTimeline.tsx`
- Modify: `frontend/src/components/public/landing/RoleShowcases.tsx`
- Modify: `frontend/src/components/public/styles/public-sections.css`
- Modify: `frontend/src/components/public/styles/public-responsive.css`
- Modify: `frontend/src/pages/landing/index.tsx`
- Modify: `frontend/e2e/premium-redesign.spec.ts`

**Interfaces:**
- Consumes: `BrandArtwork`, `Reveal`, `ProductMockup`, and `toolsForRole`.
- Produces: `[data-layout="process-timeline"]` and two `[data-layout="role-showcase"]` sections.

- [ ] **Step 1: Write failing timeline/showcase tests**

The initial import from `./helpers` already includes `TEACHER_USER`. Append:

```ts
test('timeline and role showcases create varied narrative rhythm', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await expect(page.locator('[data-layout="process-timeline"]')).toBeVisible();
  await expect(page.locator('[data-layout="role-showcase"]')).toHaveCount(2);
  await expect(page.locator('img[data-brand-art="teacher"]')).toBeVisible();
  await expect(page.locator('img[data-brand-art="student"]')).toBeVisible();
  await expectNoBrokenImages(page);
});
```

- [ ] **Step 2: Verify red**

Run:

```bash
cd frontend
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "timeline and role"
```

Expected: fail because the layout contracts and two images are absent.

- [ ] **Step 3: Implement the sticky desktop timeline**

Render three truthful steps in DOM order:

```tsx
const STEPS = [
  { number: '01', title: 'Đưa học liệu vào', description: 'Tải PDF, DOCX, PPTX hoặc video bài giảng.' },
  { number: '02', title: 'Chọn việc cần làm', description: 'Sinh câu hỏi hoặc hỏi đáp theo đúng nội dung đã tải.' },
  { number: '03', title: 'Rà soát và sử dụng', description: 'Kiểm tra, chỉnh sửa rồi ban hành hoặc xuất đề.' },
];
```

Desktop uses a sticky `ProductMockup`; mobile uses a normal single-column timeline.
No scroll listener or business state is added.

- [ ] **Step 4: Implement zig-zag role showcases**

Use `toolsForRole('teacher').slice(0, 4)` and `toolsForRole('student').slice(0, 4)`.
Each showcase uses one large artwork, a short tool list, and a real `/register` CTA.
Do not render six equal tool cards.

- [ ] **Step 5: Simplify the home-page composition**

In `pages/landing/index.tsx`, render this exact narrative:

```tsx
<Hero content={content.hero} />
<BuiltForLearning />
{uploadEnabled && <PrimaryTool />}
<HowItWorks />
<TeacherToolsShowcase />
<StudentToolsShowcase />
<TrustBlock />
<Faq />
<FinalCta />
```

Keep `QuickExamples`, `WhyEzEdu`, `FeaturesByRole`, `StatsBlock`, and
`TestimonialBlock` exported for focused public pages or future real CMS data, but
do not render empty/repetitive sections on the home page.

- [ ] **Step 6: Verify desktop and mobile narrative**

Run:

```bash
cd frontend
npx tsc -b --force
npm run lint
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440
npx playwright test e2e/premium-redesign.spec.ts --project=mobile-390
```

Expected: all tests pass.

- [ ] **Step 7: Commit timeline and showcases**

```bash
git add frontend/src/components/public/landing frontend/src/components/public/styles frontend/src/pages/landing/index.tsx frontend/e2e/premium-redesign.spec.ts
git commit -m "feat(public): create timeline and role-led storytelling"
```

---

### Task 7: Finish public pages, FAQ, CTA, footer, and authentication shell

**Files:**
- Modify: `frontend/src/components/public/landing/SupportingSections.tsx`
- Modify: `frontend/src/components/public/PublicFooter.tsx`
- Modify: `frontend/src/pages/PublicInfoPages.tsx`
- Modify: `frontend/src/components/PublicLayout.tsx`
- Modify: `frontend/src/components/PublicLayout.css`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/RegisterPage.tsx`
- Modify: `frontend/src/components/public/styles/public-foundation.css`
- Modify: `frontend/src/components/public/styles/public-sections.css`
- Modify: `frontend/e2e/premium-redesign.spec.ts`

**Interfaces:**
- Consumes: existing login/register submit functions and public section exports.
- Produces: `[data-public-page]`, `[data-auth-layout="editorial"]`, safe footer links, and unchanged form labels/tab order.

- [ ] **Step 1: Write failing public-shell tests**

Append:

```ts
test('public information and auth pages use the editorial shells', async ({ page }) => {
  await stubApi(page);
  await page.goto('/features');
  await expect(page.locator('[data-public-page="features"]')).toBeVisible();

  await page.goto('/login');
  await expect(page.locator('[data-auth-layout="editorial"]')).toBeVisible();
  await expect(page.getByLabel('Email đăng nhập')).toBeVisible();
  await expect(page.getByLabel('Mật khẩu')).toBeVisible();
});

test('footer contains no dead hash-only legal destinations', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  const destinations = await page.locator('footer a').evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  );
  expect(destinations.filter((href) => href?.startsWith('#'))).toEqual([]);
});
```

- [ ] **Step 2: Verify red**

Run:

```bash
cd frontend
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "editorial shells|dead hash"
```

Expected: fail because the shell markers are absent and default CMS legal links use hashes.

- [ ] **Step 3: Implement the public masthead and safe footer resolution**

Add `pageKey` to `PublicInfoShell` and render:

```tsx
<div className="ezp-root" data-public-page={pageKey}>
```

Resolve CMS policy hashes in `PublicFooter.tsx`:

```ts
function resolvePolicyHref(href: string) {
  if (href === '#privacy') return '/faq#quyen-rieng-tu';
  if (href === '#terms') return '/faq#dieu-khoan';
  return href.startsWith('#') ? '/faq' : href;
}
```

Use a compact three-group footer instead of five uniform columns; retain product,
support, legal, contact, CMS copyright, and the AI verification disclaimer.

- [ ] **Step 4: Build the authentication/status shell**

Set the layout marker:

```tsx
<div className="pub-layout" data-auth-layout="editorial">
```

Desktop uses a 42/58 split: an editorial brand panel and the existing form card.
Mobile hides the decorative panel and keeps the form first. Replace hard-coded
hex values in `PublicLayout.css` with semantic brand tokens. Keep form controls,
labels, submit handlers, redirects, auth refresh, and validation strings unchanged.

Change feedback markup only:

```tsx
{error && <div className="alert alert-error" role="alert">{error}</div>}
{success && <div className="alert alert-success" role="status">{success}</div>}
```

- [ ] **Step 5: Verify public routes, auth keyboard order, and Axe**

Run:

```bash
cd frontend
npx tsc -b --force
npm run lint
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440
npx playwright test e2e/public-responsive.spec.ts --project=mobile-390
npx playwright test e2e/accessibility.spec.ts --project=desktop-1440
```

Expected: all commands pass.

- [ ] **Step 6: Commit public completion**

```bash
git add frontend/src/components/public frontend/src/components/PublicLayout.tsx frontend/src/components/PublicLayout.css frontend/src/pages/PublicInfoPages.tsx frontend/src/pages/LoginPage.tsx frontend/src/pages/RegisterPage.tsx frontend/e2e/premium-redesign.spec.ts
git commit -m "feat(public): finish editorial pages and authentication shell"
```

---

### Task 8: Redesign the authenticated workspace shell

**Files:**
- Modify: `frontend/src/components/AppLayout.tsx`
- Modify: `frontend/src/components/app-layout.css`
- Modify: `frontend/e2e/premium-redesign.spec.ts`

**Interfaces:**
- Consumes: existing `buildGroups`, permission checks, feature flags, account menu, and responsive tab-bar data.
- Produces: `[data-app-shell="workspace"]` and `aria-current="page"` on active destinations.

- [ ] **Step 1: Write failing workspace-shell tests**

Append:

```ts
test('authenticated workspace exposes active navigation semantically', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  const shell = page.locator('[data-app-shell="workspace"]');
  await expect(shell).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tổng quan' }).first()).toHaveAttribute('aria-current', 'page');
});
```

- [ ] **Step 2: Verify red**

Run:

```bash
cd frontend
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "authenticated workspace"
```

Expected: fail because the shell marker and `aria-current` are absent.

- [ ] **Step 3: Add semantic markers without changing navigation data**

On the root:

```tsx
<div className="ez-shell" data-app-shell="workspace">
```

On desktop and mobile navigation links:

```tsx
aria-current={isActive(item.to) ? 'page' : undefined}
```

Do not alter `buildGroups`, permissions, routes, badges, account actions, logout,
theme behavior, or feature flags.

- [ ] **Step 4: Implement the workspace rail**

Use the existing 1024px breakpoint. Desktop rail receives:

```css
.ez-sidebar {
  width: 272px;
  margin: var(--ez-space-4);
  height: calc(100vh - (2 * var(--ez-space-4)));
  border: 1px solid color-mix(in srgb, var(--ez-primary) 10%, var(--ez-border));
  border-radius: var(--ez-radius-xl);
  box-shadow: var(--ez-shadow-brand);
}
```

Update active nav to use a filled organic surface and shape indicator, not color
alone. Keep the mobile topbar/tabbar sticky and preserve safe-area padding.

- [ ] **Step 5: Verify all role shells**

Run:

```bash
cd frontend
npx tsc -b --force
npm run lint
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "authenticated workspace"
npx playwright test e2e/authenticated-responsive.spec.ts --project=desktop-1440
npx playwright test e2e/authenticated-responsive.spec.ts --project=mobile-390
```

Expected: all tests pass for teacher, student, and admin fixtures.

- [ ] **Step 6: Commit workspace shell**

```bash
git add frontend/src/components/AppLayout.tsx frontend/src/components/app-layout.css frontend/e2e/premium-redesign.spec.ts
git commit -m "feat(app): redesign authenticated workspace shell"
```

---

### Task 9: Redesign teacher, student, and admin dashboards

**Files:**
- Modify: `frontend/src/pages/teacher/TeacherDashboardPage.tsx`
- Modify: `frontend/src/pages/student/StudentDashboardPage.tsx`
- Modify: `frontend/src/pages/dashboard.css`
- Modify: `frontend/src/pages/AdminDashboardPage.css`
- Modify: `frontend/e2e/premium-redesign.spec.ts`

**Interfaces:**
- Consumes: existing dashboard API calls, states, quick actions, stats, and the local `BrandArtwork`.
- Produces: `[data-dashboard-role="teacher"]`, `[data-dashboard-role="student"]`, and a composed getting-started state.

- [ ] **Step 1: Write failing role-dashboard tests**

The initial import from `./helpers` already includes
`stubSuccessfulTeacherDashboard`. Append:

```ts
test('teacher dashboard renders a composed successful empty state', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await stubSuccessfulTeacherDashboard(page);
  await page.goto('/dashboard');
  await expect(page.locator('[data-dashboard-role="teacher"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ba bước để có bộ đề đầu tiên' })).toBeVisible();
  await expect(page.locator('img[data-brand-art="teacher"]')).toBeVisible();
});
```

- [ ] **Step 2: Verify red**

Run:

```bash
cd frontend
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "teacher dashboard"
```

Expected: fail because the role marker and local artwork are absent.

- [ ] **Step 3: Update dashboard presentation only**

In `TeacherDashboardPage.tsx`, replace the opening fragment `<>` with:

```tsx
<div className="ez-dashboard" data-dashboard-role="teacher">
```

Replace its closing fragment with `</div>`.

In `StudentDashboardPage.tsx`, replace the opening fragment `<>` with:

```tsx
<div className="ez-dashboard" data-dashboard-role="student">
```

Replace its closing fragment with `</div>`.

Replace only `CharacterIllustration` with local `BrandArtwork`. Do not alter
`Promise.all`, state transitions, API parameters, pending-set calculations,
average/best-score calculations, links, or error retry behavior.

- [ ] **Step 4: Create varied dashboard rhythm**

Use CSS to give the greeting panel, search, quick actions, stat grid, primary task,
and content columns distinct scales. Use `font-variant-numeric: tabular-nums` on
stats. Preserve table/data density on the admin dashboard; update its surfaces,
filters, panels, and status blocks only through semantic tokens.

- [ ] **Step 5: Verify dashboards and unavailable states**

Run:

```bash
cd frontend
npx tsc -b --force
npm run lint
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440 --grep "teacher dashboard"
npx playwright test e2e/authenticated-responsive.spec.ts --project=desktop-1440
npx playwright test e2e/accessibility.spec.ts --project=desktop-1440 --grep "Admin layout"
```

Expected: all commands pass.

- [ ] **Step 6: Commit dashboards**

```bash
git add frontend/src/pages/teacher/TeacherDashboardPage.tsx frontend/src/pages/student/StudentDashboardPage.tsx frontend/src/pages/dashboard.css frontend/src/pages/AdminDashboardPage.css frontend/e2e/premium-redesign.spec.ts
git commit -m "feat(app): compose role dashboards with premium visual rhythm"
```

---

### Task 10: Complete responsive, dark-mode, and reduced-motion hardening

**Files:**
- Modify: `frontend/src/components/public/styles/public-responsive.css`
- Modify: `frontend/src/components/public/public-page.css`
- Modify: `frontend/src/styles/tokens.css`
- Modify: `frontend/src/components/app-layout.css`
- Modify: `frontend/src/pages/dashboard.css`
- Modify: `frontend/e2e/premium-redesign.spec.ts`
- Modify: `frontend/e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: all redesigned components.
- Produces: final 390/768/1280/1440 responsive contracts and AA-clean light/dark pages.

- [ ] **Step 1: Add explicit mobile and dark-mode contracts**

Append:

```ts
test('premium landing remains complete in dark mode', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme-preference', 'dark'));
  await stubApi(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-layout="editorial-hero"]')).toBeVisible();
  await expectNoBrokenImages(page);
  await expectNoPageOverflow(page);
});

test('mobile menu remains keyboard and touch operable', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tính năng' })).toBeVisible();
});
```

- [ ] **Step 2: Run the contracts across required viewports**

Run:

```bash
cd frontend
npx playwright test e2e/premium-redesign.spec.ts --project=mobile-390
npx playwright test e2e/premium-redesign.spec.ts --project=tablet-portrait-768
npx playwright test e2e/premium-redesign.spec.ts --project=laptop-1280
npx playwright test e2e/premium-redesign.spec.ts --project=desktop-1440
```

Expected: failures identify remaining overflow, drawer selector, contrast, or
responsive composition issues.

- [ ] **Step 3: Apply the final responsive rules**

The CSS import manifest must be:

```css
@import './styles/public-foundation.css';
@import './styles/public-hero.css';
@import './styles/public-sections.css';
@import './styles/public-responsive.css';
```

Required reduced-motion rule:

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .ez-reveal,
  .ezp-hero-decoration,
  .ezp-art-float {
    animation: none;
    transition: none;
    transform: none;
    opacity: 1;
  }
}
```

At 390px: single-column hero/mosaic/timeline/showcases, no off-canvas decorative
overflow, full-width primary CTA, and 44px controls. At 768px: two-column layouts
may collapse when copy or imagery would fall below 18rem. At 1280/1440px: public
content is capped at 1280px and app content retains its data-table width rules.

- [ ] **Step 4: Run focused accessibility scans**

Run:

```bash
cd frontend
npx playwright test e2e/accessibility.spec.ts --project=desktop-1440
npx playwright test e2e/accessibility.spec.ts --project=mobile-390
```

Expected: no WCAG A/AA violations in light or dark mode.

- [ ] **Step 5: Commit hardening**

```bash
git add frontend/src/components/public frontend/src/styles/tokens.css frontend/src/components/app-layout.css frontend/src/pages/dashboard.css frontend/e2e
git commit -m "fix(design): harden responsive motion and accessibility"
```

---

### Task 11: Full verification and live browser review

**Files:**
- Create: `docs/superpowers/reports/2026-07-30-premium-redesign-verification.md`
- Modify only source files proven necessary by failing verification.

**Interfaces:**
- Consumes: completed redesign.
- Produces: fresh evidence for source quality, frontend behavior, backend regression safety, and live visual quality.

- [ ] **Step 1: Run static verification**

```bash
cd frontend
npx tsc -b --force
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Run the complete frontend suite**

```bash
cd frontend
npm run test:e2e
```

Expected: every test passes in all six configured viewport projects.

- [ ] **Step 3: Run the complete backend suite**

```bash
cd backend
.venv/bin/python -m pytest -q
```

Expected: all collected tests pass; warnings are reported separately and are not
misrepresented as failures.

- [ ] **Step 4: Inspect the live application**

Run frontend and backend, then use the in-app browser to inspect:

- `/` at 1280×720 and 390×844 in light and dark mode.
- `/login` and `/register`.
- `/dashboard` as teacher and student fixtures.
- `/admin/dashboard` and one data-heavy admin route.
- Mobile menu, CTA navigation, file validation, theme switch, logout, and protected-route redirect.

For each inspected page, verify no console errors, no broken images, no horizontal
overflow, no hidden focus, and no abrupt motion under reduced-motion mode.

- [ ] **Step 5: Fix only reproduced regressions and rerun their failing command**

Use the exact failing test or route to reproduce each issue, apply the smallest
scoped correction, rerun the focused command, then rerun Steps 1–3.

- [ ] **Step 6: Record final evidence and commit**

Create `docs/superpowers/reports/2026-07-30-premium-redesign-verification.md`
with the exact commands, exit codes, test counts, inspected routes, viewport
sizes, console result, and any remaining environment-only limitation. Then:

```bash
git status --short
git add docs/superpowers/reports/2026-07-30-premium-redesign-verification.md
git commit -m "docs: record premium redesign verification"
```

Do not include `artifacts/`, prior Case Studio documents, Playwright reports, or
unrelated user files in this commit.
