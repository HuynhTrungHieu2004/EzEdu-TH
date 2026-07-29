# MagicSchool-Style Full Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the entire EzEdu AI frontend (public site + app chrome + dashboards) to match MagicSchool.ai's visual spirit — bigger radius, pill nav/buttons, gradient hero, original flat-cartoon Canva-style illustrations — while keeping every existing business feature, route, and data flow byte-identical.

**Architecture:** Bump global tokens first (radius scale + gradient) so every existing `components/ui/` consumer inherits the new look for free (verified: all radius in `ui.css`/`app-layout.css` already references `var(--ez-radius-*)`, no hardcoded pixel radius anywhere in the reviewed files). Then add a small number of new, original, reusable components (`SparkleStar`, `AnnouncementBar`, `CharacterIllustration`, `Button` `size="hero"`). Then rewrite the public landing page section-by-section on top of those, and lightly re-skin app chrome (`AppLayout.tsx`) and the 3 dashboards. Admin/teacher/student inner pages need no per-file changes — they already consume `components/ui/` 100% from a prior migration, confirmed by grep audit in the last task.

**Tech Stack:** React + TypeScript (Vite), CSS custom properties in `frontend/src/styles/tokens.css`, `lucide-react` icons, Playwright for e2e/axe verification. No new npm dependency.

## Global Constraints

- Do not change font family (Inter stays).
- Do not rewrite `DataTable`/`FormField`/any admin business logic — chrome/token changes only on those pages.
- No fabricated stats, testimonials, certifications (SOC2/FERPA/etc.), or integrations (Google Classroom/Canvas/etc.) — sections needing real data that doesn't exist yet must render `null` (hidden), never placeholder/fake content.
- No downloaded/copied assets, CSS, or pixel-for-pixel layout from magicschool.ai — original SVG illustrations only, "flat/cartoon, colorful, Canva-style" per user direction (bold flat shapes, rounded blobs, simple friendly faces — not photo-realistic, not thin line-art).
- All Vietnamese copy stays Vietnamese, matches existing tone (see `LandingSections.tsx` for the established voice).
- Every task ends verifiable with `cd frontend && npx tsc -b --force && npm run lint` (no test framework beyond that + Playwright exists in this repo — confirmed via `package.json`).
- Spec reference: `docs/superpowers/specs/2026-07-29-magicschool-full-redesign-design.md`.

---

## Task 1: Bump radius scale + add gradient tokens

**Files:**
- Modify: `frontend/src/styles/tokens.css:163-172` (border radius block), and add new gradient tokens near the primitive color block.

**Interfaces:**
- Produces: `--ez-radius-md` (16px), `--ez-radius-lg` (24px), `--ez-radius-xl` (28px), `--ez-radius-2xl` (32px), `--ez-radius-full` (unchanged, `9999px`); new `--ez-gradient-hero`, `--ez-gradient-cta`. Every later task that styles a card/button/input consumes these by reference — never hardcode a pixel radius.

- [ ] **Step 1: Replace the border radius block**

Find:
```css
:root {
  --ez-radius-none: 0;
  --ez-radius-xs:   4px;
  --ez-radius-sm:   6px;
  --ez-radius-md:   10px;   /* input, button */
  --ez-radius-lg:   14px;   /* card */
  --ez-radius-xl:   20px;   /* card lớn, khối hero */
  --ez-radius-2xl:  28px;   /* section nổi */
  --ez-radius-full: 9999px; /* chip, badge, avatar */
}
```

Replace with:
```css
:root {
  /* Bo góc lớn hơn hẳn theo tinh thần MagicSchool — quyết định ở
     docs/superpowers/specs/2026-07-29-magicschool-full-redesign-design.md */
  --ez-radius-none: 0;
  --ez-radius-xs:   6px;
  --ez-radius-sm:   10px;
  --ez-radius-md:   16px;   /* input, button */
  --ez-radius-lg:   24px;   /* card */
  --ez-radius-xl:   28px;   /* card lớn, khối hero */
  --ez-radius-2xl:  32px;   /* section nổi */
  --ez-radius-full: 9999px; /* chip, badge, avatar, pill nav/button */
}
```

- [ ] **Step 2: Add gradient tokens right after the SHADOW block** (after the `--ez-ring-color` line, still inside the same `:root` block or a new one — add as a new `:root` block immediately after section 5 SHADOW, before section 6 Z-INDEX)

```css
/* ───────────────────────────────────────────────────────────────────────
   5b. GRADIENT — dùng cho hero/CTA nổi bật, tinh thần MagicSchool
   ─────────────────────────────────────────────────────────────────────── */
:root {
  --ez-gradient-hero: linear-gradient(135deg, var(--ez-amber-400) 0%, var(--ez-indigo-500) 55%, var(--ez-indigo-700) 100%);
  --ez-gradient-cta:  linear-gradient(120deg, var(--ez-indigo-600) 0%, var(--ez-indigo-700) 100%);
}

[data-theme='dark'] {
  --ez-gradient-hero: linear-gradient(135deg, var(--ez-amber-500) 0%, var(--ez-indigo-600) 55%, var(--ez-indigo-900) 100%);
  --ez-gradient-cta:  linear-gradient(120deg, var(--ez-indigo-500) 0%, var(--ez-indigo-700) 100%);
}
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```
Expected: all pass, no output errors. This step only changes CSS custom property values consumed everywhere via `var()` — no component code changes yet, so nothing should break.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/tokens.css
git commit -m "feat(design): bump radius scale and add hero/CTA gradient tokens for MagicSchool-style redesign"
```

---

## Task 2: `SparkleStar` component — original decorative SVG

**Files:**
- Create: `frontend/src/components/public/SparkleStar.tsx`

**Interfaces:**
- Produces: `export default function SparkleStar({ variant, size, className }: SparkleStarProps)` where `SparkleStarProps = { variant?: 'four-point' | 'sparkle' | 'blob'; size?: number; className?: string }`.
- Consumed by: Task 7 (Hero), Task 8 (BuiltForLearning pillars), app chrome brand mark (Task 17).

- [ ] **Step 1: Write the component**

```tsx
/**
 * SparkleStar — hoạ tiết trang trí gốc (4 cánh sao / sparkle / blob), tự vẽ
 * bằng SVG, không sao chép tài sản của bất kỳ trang nào khác. Dùng quanh
 * hero/section-break theo tinh thần MagicSchool — chỉ trang trí, không mang
 * thông tin, nên ẩn hoàn toàn với trình đọc màn hình.
 */
export type SparkleVariant = 'four-point' | 'sparkle' | 'blob';

export interface SparkleStarProps {
  variant?: SparkleVariant;
  size?: number;
  className?: string;
}

export default function SparkleStar({ variant = 'four-point', size = 32, className }: SparkleStarProps) {
  if (variant === 'blob') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
        className={className}
      >
        <path
          d="M50 6C68 6 90 20 94 42C98 64 82 88 58 94C34 100 10 84 6 60C2 36 20 6 50 6Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (variant === 'sparkle') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
        className={className}
      >
        <path
          d="M50 4 L58 40 L96 50 L58 60 L50 96 L42 60 L4 50 L42 40 Z"
          fill="currentColor"
        />
        <circle cx="82" cy="18" r="5" fill="currentColor" />
        <circle cx="14" cy="78" r="3.5" fill="currentColor" />
      </svg>
    );
  }

  // four-point (mặc định) — ngôi sao 4 cánh nhọn, đúng tinh thần MagicSchool
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M50 2 C54 34 66 46 98 50 C66 54 54 66 50 98 C46 66 34 54 2 50 C34 46 46 34 50 2 Z" fill="currentColor" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint
```
Expected: pass. Component isn't imported anywhere yet, so no visual change.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/public/SparkleStar.tsx
git commit -m "feat(design): add original SparkleStar decorative SVG component"
```

---

## Task 3: `CharacterIllustration` component — original flat-cartoon SVG

**Files:**
- Create: `frontend/src/components/public/CharacterIllustration.tsx`

**Interfaces:**
- Produces: `export default function CharacterIllustration({ variant, className }: CharacterIllustrationProps)` where `variant: 'hero' | 'teacher' | 'student'`.
- Consumed by: Task 7 (Hero), Task 9 (teacher tools showcase), Task 10 (student tools showcase).

- [ ] **Step 1: Write the component**

```tsx
/**
 * CharacterIllustration — nhân vật minh hoạ phẳng, nhiều màu, phong cách
 * flat/cartoon kiểu Canva (khối bo tròn, mặt đơn giản) — tự vẽ SVG gốc,
 * KHÔNG dùng ảnh chụp thật, KHÔNG sao chép minh hoạ của bất kỳ trang nào
 * khác. Dùng màu qua token để tự đổi theo theme sáng/tối.
 */
export type CharacterVariant = 'hero' | 'teacher' | 'student';

export interface CharacterIllustrationProps {
  variant: CharacterVariant;
  className?: string;
}

export default function CharacterIllustration({ variant, className }: CharacterIllustrationProps) {
  const title =
    variant === 'hero'
      ? 'Giáo viên và học sinh cùng học với EzEdu AI'
      : variant === 'teacher'
        ? 'Giáo viên soạn bài với EzEdu AI'
        : 'Học sinh luyện tập với EzEdu AI';

  return (
    <svg
      viewBox="0 0 320 320"
      role="img"
      aria-labelledby={`char-illust-${variant}-title`}
      className={className}
    >
      <title id={`char-illust-${variant}-title`}>{title}</title>

      {/* nền khối bo tròn */}
      <circle cx="160" cy="160" r="150" fill="var(--ez-primary-subtle)" />
      <path
        d="M160 40C220 40 270 90 270 150C270 210 220 250 160 260C100 250 50 210 50 150C50 90 100 40 160 40Z"
        fill="var(--ez-secondary-subtle)"
        opacity="0.6"
      />

      {/* thân người — áo màu accent */}
      <rect x="110" y="180" width="100" height="90" rx="36" fill="var(--ez-accent)" />

      {/* đầu */}
      <circle cx="160" cy="140" r="46" fill="#f0c8a0" />

      {/* tóc */}
      {variant === 'student' ? (
        <path d="M114 128C114 96 142 78 160 78C178 78 206 96 206 128C206 108 188 96 160 96C132 96 114 108 114 128Z" fill="var(--ez-indigo-800)" />
      ) : (
        <path d="M116 118C120 92 140 76 160 76C182 76 202 94 204 120C196 104 180 96 160 96C142 96 124 102 116 118Z" fill="var(--ez-neutral-700)" />
      )}

      {/* mặt cười đơn giản */}
      <circle cx="144" cy="140" r="4.5" fill="var(--ez-neutral-900)" />
      <circle cx="176" cy="140" r="4.5" fill="var(--ez-neutral-900)" />
      <path d="M144 156C150 164 170 164 176 156" stroke="var(--ez-neutral-900)" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* phụ kiện theo vai trò */}
      {variant === 'teacher' && (
        <rect x="128" y="222" width="64" height="46" rx="8" fill="var(--ez-surface)" stroke="var(--ez-primary)" strokeWidth="3" />
      )}
      {variant === 'student' && (
        <rect x="120" y="216" width="80" height="56" rx="10" fill="var(--ez-surface)" stroke="var(--ez-secondary)" strokeWidth="3" />
      )}
      {variant === 'hero' && (
        <>
          <circle cx="238" cy="222" r="26" fill="var(--ez-secondary)" />
          <path d="M228 222 L235 229 L250 210" stroke="var(--ez-text-on-brand)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )}
    </svg>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/public/CharacterIllustration.tsx
git commit -m "feat(design): add original flat-cartoon CharacterIllustration component"
```

---

## Task 4: `AnnouncementBar` component

**Files:**
- Create: `frontend/src/components/public/AnnouncementBar.tsx`

**Interfaces:**
- Produces: `export default function AnnouncementBar({ message, href, ctaLabel }: AnnouncementBarProps)` where `AnnouncementBarProps = { message: string | null | undefined; href?: string; ctaLabel?: string }`. Returns `null` when `message` is falsy — per Global Constraints, no fabricated banner text.
- Consumed by: Task 6 (wired into `pages/landing/index.tsx`, fed from CMS `website_content` bundle — no new backend field required, reuse `content.header` if it already has a spare field, otherwise pass a hardcoded real Vietnamese message the user supplies later; for this task ship it accepting `message` as a prop with no default so the call site controls whether it renders).
- Dismissible: stores dismissal in `sessionStorage` keyed by a hash of `message` so it reappears if the message text changes.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface AnnouncementBarProps {
  message: string | null | undefined;
  href?: string;
  ctaLabel?: string;
}

const STORAGE_KEY = 'ezedu_announcement_dismissed';

export default function AnnouncementBar({ message, href, ctaLabel }: AnnouncementBarProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (!message) return true;
    try {
      return sessionStorage.getItem(STORAGE_KEY) === message;
    } catch {
      return false;
    }
  });

  if (!message || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, message as string);
    } catch {
      // sessionStorage không khả dụng — chỉ ẩn trong phiên hiện tại, không chặn thao tác
    }
  }

  return (
    <div className="ezp-announce" role="region" aria-label="Thông báo">
      <div className="ezp-container ezp-announce-inner">
        <span className="ezp-announce-text">
          {message}
          {href && (
            <Link to={href} className="ezp-announce-link">
              {ctaLabel || 'Xem thêm'} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </span>
        <button type="button" className="ezp-announce-close" onClick={dismiss} aria-label="Đóng thông báo">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS** — append to `frontend/src/components/public/public-page.css`:

```css
/* ───────────────────────────────────────────────────────────────────────
   ANNOUNCEMENT BAR
   ─────────────────────────────────────────────────────────────────────── */
.ezp-announce {
  background: var(--ez-gradient-cta);
  color: var(--ez-text-on-brand);
}
.ezp-announce-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ez-space-4);
  padding: var(--ez-space-2) var(--ez-space-4);
  font-size: var(--ez-text-body-sm);
  font-weight: var(--ez-weight-semibold);
  position: relative;
}
.ezp-announce-text {
  display: flex;
  align-items: center;
  gap: var(--ez-space-2);
  flex-wrap: wrap;
  justify-content: center;
  text-align: center;
}
.ezp-announce-link {
  display: inline-flex;
  align-items: center;
  gap: var(--ez-space-1);
  color: var(--ez-text-on-brand);
  text-decoration: underline;
  font-weight: var(--ez-weight-bold);
}
.ezp-announce-close {
  position: absolute;
  right: var(--ez-space-4);
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: 0;
  color: var(--ez-text-on-brand);
  cursor: pointer;
  padding: var(--ez-space-1);
  display: inline-flex;
}
@media (max-width: 640px) {
  .ezp-announce-close { position: static; transform: none; }
}
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint
```
Expected: pass. Not wired into any page yet (Task 6 does that), so no visual change.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/public/AnnouncementBar.tsx frontend/src/components/public/public-page.css
git commit -m "feat(design): add AnnouncementBar component, hidden by default when no real message"
```

---

## Task 5: `Button` — add `size="hero"` (full-pill, large)

**Files:**
- Modify: `frontend/src/components/ui/Button.tsx:15` (the `ButtonSize` type)
- Modify: `frontend/src/components/ui/ui.css` (after the existing `.ez-btn-lg` block, around line 73)

**Interfaces:**
- Produces: `ButtonSize = 'sm' | 'md' | 'lg' | 'hero'`. `<Button size="hero">` renders `.ez-btn.ez-btn-hero`.
- Consumed by: Task 7 (Hero primary CTA), Task 15 (FinalCta).

- [ ] **Step 1: Widen the type**

In `Button.tsx`, change:
```ts
export type ButtonSize = 'sm' | 'md' | 'lg';
```
to:
```ts
export type ButtonSize = 'sm' | 'md' | 'lg' | 'hero';
```

- [ ] **Step 2: Add the CSS class** — insert right after the existing `.ez-btn-lg` block in `ui.css`:

```css
.ez-btn-hero {
  min-height: 56px;
  padding: 0 var(--ez-space-8);
  font-size: var(--ez-text-h5);
  border-radius: var(--ez-radius-full);
}
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint
```
Expected: pass — `Button` already builds its class name as `` `ez-btn-${variant}` `` / `` `ez-btn-${size}` `` dynamically (confirmed in `Button.tsx`), so no other code change is needed for the new size to take effect.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/Button.tsx frontend/src/components/ui/ui.css
git commit -m "feat(design): add Button size=hero — full-pill large CTA"
```

---

## Task 6: Wire `AnnouncementBar` + pill-shaped header nav

**Files:**
- Modify: `frontend/src/pages/landing/index.tsx` (mount `AnnouncementBar` above `PublicHeader`)
- Modify: `frontend/src/components/public/PublicHeader.tsx` (no logic change — just add a wrapping class hook if needed)
- Modify: `frontend/src/components/public/public-page.css` (`.ezp-header-inner`, `.ezp-nav`, `.ezp-nav-link` — pill treatment)

**Interfaces:**
- Consumes: `AnnouncementBar` from Task 4, `content.header` bundle already available in `pages/landing/index.tsx` (`WebsiteContentBundle['header']`).

- [ ] **Step 1: Mount the bar** — in `frontend/src/pages/landing/index.tsx`, add the import and render it as the first child of `.ezp-root`, before `PublicHeader`:

```tsx
import AnnouncementBar from '../../components/public/AnnouncementBar';
```
and in the JSX:
```tsx
<div className="ezp-root">
  <a href="#main" className="ez-skip-link">
    Bỏ qua tới nội dung chính
  </a>

  <AnnouncementBar message={null} />
  <PublicHeader content={content.header} identity={content.site_identity} />
  ...
```
`message={null}` ships it hidden by default — per Global Constraints, do not invent announcement copy. Wire a real `message` string later once the user supplies one (leave this exact line as the integration point).

- [ ] **Step 2: Pill-shape the nav** — in `public-page.css`, find the existing `.ezp-nav` rule and the `.ezp-nav-link` rule, add (don't remove existing properties, only add/override radius and background):

```css
.ezp-nav {
  display: flex;
  align-items: center;
  gap: var(--ez-space-1);
  background: var(--ez-surface-muted);
  border-radius: var(--ez-radius-full);
  padding: var(--ez-space-1);
}
.ezp-nav-link {
  border-radius: var(--ez-radius-full);
  padding: var(--ez-space-2) var(--ez-space-4);
}
.ezp-nav-link:hover {
  background: var(--ez-surface);
}
```
(If `.ezp-nav`/`.ezp-nav-link` already have conflicting `display`/`gap` declarations elsewhere in the file, merge into the existing rule instead of duplicating the selector — check with `grep -n "\.ezp-nav "` first.)

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 4: Manual visual check** — start dev server, open `/`, confirm nav renders as a pill-shaped group and no announcement bar shows (since `message={null}`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/landing/index.tsx frontend/src/components/public/public-page.css
git commit -m "feat(design): wire AnnouncementBar into landing, pill-shape header nav"
```

---

## Task 7: Redesign Hero section

**Files:**
- Modify: `frontend/src/components/public/LandingSections.tsx` (the `Hero` function, lines 32-87)
- Modify: `frontend/src/components/public/public-page.css` (`.ezp-hero` block)

**Interfaces:**
- Consumes: `CharacterIllustration` (Task 3, `variant="hero"`), `SparkleStar` (Task 2), `Button size="hero"` (Task 5).
- Keeps: existing `HeroContent` prop contract (`content.description`, `content.chips`, `content.primary_cta_label`, `content.secondary_cta_label`) — no CMS schema change.

- [ ] **Step 1: Replace the `Hero` function body** in `LandingSections.tsx`:

```tsx
export function Hero({ content }: { content: HeroContent }) {
  const { status, homePath } = useAuth();
  const signedIn = status === 'authenticated';

  const chips = (content.chips ?? []).slice(0, 4);

  return (
    <section className="ezp-container ezp-hero" aria-labelledby="hero-title">
      <SparkleStar variant="four-point" size={28} className="ezp-hero-sparkle ezp-hero-sparkle-1" />
      <SparkleStar variant="sparkle" size={20} className="ezp-hero-sparkle ezp-hero-sparkle-2" />
      <SparkleStar variant="blob" size={40} className="ezp-hero-sparkle ezp-hero-sparkle-3" />

      <div className="ezp-hero-grid">
        <div>
          <h1 className="ezp-hero-title" id="hero-title">
            Biến học liệu thành{' '}
            <span className="ezp-hero-accent">trải nghiệm học tập thông minh</span>
          </h1>

          <p className="ezp-hero-desc">
            {content.description ||
              'Tải tài liệu lên, tạo câu hỏi, luyện tập và nhận hỗ trợ từ AI trong cùng một nền tảng.'}
          </p>

          <div className="ezp-hero-actions">
            {signedIn ? (
              <Link to={homePath}>
                <Button size="hero">Vào khu vực của tôi</Button>
              </Link>
            ) : (
              <>
                <Link to="/register">
                  <Button size="hero">{content.primary_cta_label || 'Bắt đầu miễn phí'}</Button>
                </Link>
                <a href="#cong-cu">
                  <Button size="hero" variant="outline">
                    {content.secondary_cta_label || 'Khám phá công cụ'}
                  </Button>
                </a>
              </>
            )}
          </div>

          {chips.length > 0 && (
            <ul className="ezp-hero-chips">
              {chips.map((chip) => (
                <li key={chip} className="ezp-hero-chip">
                  <Check size={13} aria-hidden="true" />
                  {chip}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ezp-hero-art-wrap">
          <CharacterIllustration variant="hero" className="ezp-hero-character" />
        </div>
      </div>
    </section>
  );
}
```

Add the two new imports at the top of `LandingSections.tsx`:
```tsx
import SparkleStar from './SparkleStar';
import CharacterIllustration from './CharacterIllustration';
```
Remove the now-unused `import HeroArt from './HeroArt';` line only if nothing else in the file still renders `<HeroArt />` (check with `grep -n "HeroArt" LandingSections.tsx` after the edit — `HeroArt` stays used inside `HowItWorks`-adjacent content only if you choose to keep it there; this task removes it from `Hero` only, so keep the import only if another section in this file still uses it — after this edit it will not be used anywhere in this file, so remove the import).

- [ ] **Step 2: Update hero CSS** — in `public-page.css`, find `.ezp-hero` and add (merge with existing declarations, don't duplicate the selector):

```css
.ezp-hero {
  position: relative;
  overflow: visible;
  padding-top: var(--ez-space-16);
  padding-bottom: var(--ez-space-16);
}
.ezp-hero-sparkle {
  position: absolute;
  color: var(--ez-accent);
  pointer-events: none;
}
.ezp-hero-sparkle-1 { top: 4%; right: 8%; color: var(--ez-secondary); }
.ezp-hero-sparkle-2 { top: 40%; left: 2%; }
.ezp-hero-sparkle-3 { bottom: 6%; right: 20%; color: var(--ez-primary-subtle); z-index: -1; }
.ezp-hero-art-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}
.ezp-hero-character {
  width: 100%;
  max-width: 360px;
  height: auto;
}
@media (max-width: 640px) {
  .ezp-hero-sparkle { display: none; }
}
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 4: Manual visual check** — open `/`, confirm hero shows the new character illustration + sparkles + pill CTA buttons, and no `HeroArt` import error.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/public/LandingSections.tsx frontend/src/components/public/public-page.css
git commit -m "feat(design): redesign hero section with original character illustration and sparkles"
```

---

## Task 8: "Built for learning" 3-pillar section

**Files:**
- Modify: `frontend/src/components/public/LandingSections.tsx` (add new exported function `BuiltForLearning`, placed right after `Hero`)
- Modify: `frontend/src/pages/landing/index.tsx` (mount it)

**Interfaces:**
- Produces: `export function BuiltForLearning()` — no props, self-contained (matches every other section function in this file).
- Real content only: 3 pillars are **giáo viên / học sinh / quản lý lớp học** (not "cấp Sở/quận" — EzEdu has no district product, per spec §3).

- [ ] **Step 1: Add the component** — insert into `LandingSections.tsx` right after the `Hero` function closes:

```tsx
/* ═══════════════════════════════════════════════════════════════════════
   ĐƯỢC XÂY CHO VIỆC HỌC — 3 trụ đối tượng
   ═══════════════════════════════════════════════════════════════════════ */

const PILLARS = [
  {
    icon: <Users size={22} />,
    title: 'Dành cho giáo viên',
    desc: 'Soạn đề, sinh câu hỏi và ban hành cho lớp nhanh hơn, vẫn giữ quyền rà soát cuối cùng.',
  },
  {
    icon: <GraduationCap size={22} />,
    title: 'Dành cho học sinh',
    desc: 'Luyện tập theo đề đã ban hành, hỏi đáp có dẫn nguồn, theo dõi tiến độ của chính mình.',
  },
  {
    icon: <ClipboardList size={22} />,
    title: 'Quản lý lớp học',
    desc: 'Tạo lớp, thêm học sinh, gán đúng đề cho đúng nhóm — không cần công cụ ngoài.',
  },
];

export function BuiltForLearning() {
  return (
    <section className="ezp-section" aria-labelledby="built-for-learning-title">
      <div className="ezp-container">
        <div className="ezp-head ezp-head-center">
          <span className="ezp-eyebrow">Được xây cho việc học</span>
          <h2 className="ezp-title" id="built-for-learning-title">
            Một nền tảng, đúng việc cho từng vai trò
          </h2>
        </div>

        <div className="ezp-grid ezp-grid-3">
          {PILLARS.map((item) => (
            <article key={item.title} className="ezp-pillar">
              <span className="ezp-pillar-icon" aria-hidden="true">
                {item.icon}
              </span>
              <h3 className="ezp-card-title">{item.title}</h3>
              <p className="ezp-card-desc">{item.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add CSS** — append to `public-page.css`:

```css
.ezp-pillar {
  background: var(--ez-surface);
  border-radius: var(--ez-radius-xl);
  padding: var(--ez-space-6);
  border: 1px solid var(--ez-border);
}
.ezp-pillar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--ez-radius-full);
  background: var(--ez-gradient-cta);
  color: var(--ez-text-on-brand);
  margin-bottom: var(--ez-space-4);
}
```

- [ ] **Step 3: Mount in `pages/landing/index.tsx`** — add `BuiltForLearning` to the import list from `LandingSections` and render it right after `<Hero content={content.hero} />`:

```tsx
<Hero content={content.hero} />
<BuiltForLearning />
{uploadEnabled && <PrimaryTool />}
```

- [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/public/LandingSections.tsx frontend/src/components/public/public-page.css frontend/src/pages/landing/index.tsx
git commit -m "feat(design): add Built-for-learning 3-pillar section (teacher/student/class management)"
```

---

## Task 9: Teacher AI tools showcase (real tools from `toolRegistry`)

**Files:**
- Modify: `frontend/src/components/public/LandingSections.tsx` (add `TeacherToolsShowcase`)
- Modify: `frontend/src/pages/landing/index.tsx` (mount)

**Interfaces:**
- Consumes: `toolsForRole('teacher')` from `frontend/src/data/toolRegistry.ts` (already exported, confirmed signature `toolsForRole(role: ToolRole): ToolDefinition[]`).
- Produces: `export function TeacherToolsShowcase()`.

- [ ] **Step 1: Add the component** — insert after `BuiltForLearning`:

```tsx
/* ═══════════════════════════════════════════════════════════════════════
   AI CHO GIÁO VIÊN — công cụ thật, lấy từ toolRegistry
   ═══════════════════════════════════════════════════════════════════════ */

export function TeacherToolsShowcase() {
  const tools = toolsForRole('teacher').slice(0, 6);

  return (
    <section className="ezp-section ezp-section-alt" aria-labelledby="teacher-tools-title">
      <div className="ezp-container">
        <div className="ezp-head">
          <span className="ezp-eyebrow">AI cho giáo viên</span>
          <h2 className="ezp-title" id="teacher-tools-title">
            Tiết kiệm thời gian, tập trung vào việc dạy
          </h2>
        </div>

        <div className="ezp-tools-showcase">
          <CharacterIllustration variant="teacher" className="ezp-tools-showcase-art" />
          <div className="ezp-grid ezp-grid-2">
            {tools.map((tool) => (
              <Link key={tool.id} to="/register" className="ezp-example">
                <span className="ezp-card-icon" aria-hidden="true">
                  <tool.icon size={18} />
                </span>
                <span className="ezp-example-title">{tool.title}</span>
                <span className="ezp-example-desc">{tool.description}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

Add `toolsForRole` to the imports: `import { toolsForRole } from '../../data/toolRegistry';`

- [ ] **Step 2: Add CSS** — append to `public-page.css`:

```css
.ezp-tools-showcase {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: var(--ez-space-8);
  align-items: center;
}
.ezp-tools-showcase-art { width: 100%; height: auto; }
@media (max-width: 900px) {
  .ezp-tools-showcase { grid-template-columns: 1fr; }
  .ezp-tools-showcase-art { max-width: 220px; margin: 0 auto; }
}
```

- [ ] **Step 3: Mount** in `pages/landing/index.tsx`, right after `<FeaturesByRole />` (keep existing `FeaturesByRole` — it already covers a checklist view; this new section is the visual "showcase" card-grid MagicSchool-style companion, not a replacement):

```tsx
<FeaturesByRole />
<TeacherToolsShowcase />
```

- [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/public/LandingSections.tsx frontend/src/components/public/public-page.css frontend/src/pages/landing/index.tsx
git commit -m "feat(design): add teacher AI tools showcase section using real toolRegistry data"
```

---

## Task 10: Student AI tools showcase (real tools from `toolRegistry`)

**Files:**
- Modify: `frontend/src/components/public/LandingSections.tsx` (add `StudentToolsShowcase`)
- Modify: `frontend/src/pages/landing/index.tsx` (mount)

**Interfaces:**
- Consumes: `toolsForRole('student')`, `CharacterIllustration variant="student"`.
- Produces: `export function StudentToolsShowcase()`.

- [ ] **Step 1: Add the component** — same shape as Task 9, swap role and copy:

```tsx
/* ═══════════════════════════════════════════════════════════════════════
   AI CHO HỌC SINH — công cụ thật, lấy từ toolRegistry
   ═══════════════════════════════════════════════════════════════════════ */

export function StudentToolsShowcase() {
  const tools = toolsForRole('student').slice(0, 6);

  return (
    <section className="ezp-section" aria-labelledby="student-tools-title">
      <div className="ezp-container">
        <div className="ezp-head">
          <span className="ezp-eyebrow">AI cho học sinh</span>
          <h2 className="ezp-title" id="student-tools-title">
            Luyện tập chủ động, hiểu sâu hơn
          </h2>
        </div>

        <div className="ezp-tools-showcase ezp-tools-showcase-reverse">
          <div className="ezp-grid ezp-grid-2">
            {tools.map((tool) => (
              <Link key={tool.id} to="/register" className="ezp-example">
                <span className="ezp-card-icon ezp-card-icon-secondary" aria-hidden="true">
                  <tool.icon size={18} />
                </span>
                <span className="ezp-example-title">{tool.title}</span>
                <span className="ezp-example-desc">{tool.description}</span>
              </Link>
            ))}
          </div>
          <CharacterIllustration variant="student" className="ezp-tools-showcase-art" />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add CSS** — append to `public-page.css`:

```css
.ezp-tools-showcase-reverse {
  grid-template-columns: 1fr 280px;
}
@media (max-width: 900px) {
  .ezp-tools-showcase-reverse { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Mount** in `pages/landing/index.tsx`, right after `<TeacherToolsShowcase />`:

```tsx
<TeacherToolsShowcase />
<StudentToolsShowcase />
```

- [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/public/LandingSections.tsx frontend/src/components/public/public-page.css frontend/src/pages/landing/index.tsx
git commit -m "feat(design): add student AI tools showcase section using real toolRegistry data"
```

---

## Task 11: Stats section — real data or hidden (no fabrication)

**Files:**
- Modify: `frontend/src/components/public/LandingSections.tsx` (add `StatsBlock`)
- Modify: `frontend/src/pages/landing/index.tsx` (mount)

**Interfaces:**
- Produces: `export function StatsBlock({ stats }: { stats?: Array<{ value: string; label: string }> })`. Returns `null` when `stats` is empty/undefined.
- **No real public stats endpoint exists today** (confirmed: admin statistics APIs require auth, no public aggregate-count endpoint was found in `backend/app/routers/`). Per Global Constraints this section ships wired to an empty array — i.e., **hidden** — until a real public stats source exists. Do not invent numbers.

- [ ] **Step 1: Add the component**

```tsx
/* ═══════════════════════════════════════════════════════════════════════
   SỐ LIỆU — chỉ hiện khi có dữ liệu thật, không bịa
   ═══════════════════════════════════════════════════════════════════════ */

export function StatsBlock({ stats }: { stats?: Array<{ value: string; label: string }> }) {
  if (!stats || stats.length === 0) return null;

  return (
    <section className="ezp-section ezp-section-alt" aria-labelledby="stats-title">
      <div className="ezp-container">
        <h2 className="ez-sr-only" id="stats-title">Số liệu sử dụng thực tế</h2>
        <div className="ezp-grid ezp-grid-3">
          {stats.map((stat) => (
            <div key={stat.label} className="ezp-stat">
              <strong className="ezp-stat-value">{stat.value}</strong>
              <span className="ezp-stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add CSS**

```css
.ezp-stat { text-align: center; }
.ezp-stat-value {
  display: block;
  font-size: var(--ez-text-h1);
  font-weight: var(--ez-weight-extrabold);
  color: var(--ez-primary);
}
.ezp-stat-label {
  color: var(--ez-text-secondary);
  font-size: var(--ez-text-body-sm);
}
```

- [ ] **Step 3: Mount** in `pages/landing/index.tsx`, right after `<StudentToolsShowcase />` — call it with no `stats` prop so it renders nothing until real data exists:

```tsx
<StudentToolsShowcase />
<StatsBlock />
```

- [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```
Expected: pass. `<StatsBlock />` with no props renders `null` — confirm by loading `/` and checking no empty section/gap appears (React renders nothing for a `null` return, no wrapper div left behind).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/public/LandingSections.tsx frontend/src/components/public/public-page.css frontend/src/pages/landing/index.tsx
git commit -m "feat(design): add StatsBlock section, hidden until real usage numbers are supplied"
```

---

## Task 12: Testimonial section — real quotes or hidden (no fabrication)

**Files:**
- Modify: `frontend/src/components/public/LandingSections.tsx` (add `TestimonialBlock`)
- Modify: `frontend/src/pages/landing/index.tsx` (mount)

**Interfaces:**
- Produces: `export function TestimonialBlock({ testimonials }: { testimonials?: Array<{ quote: string; name: string; role: string }> })`. Returns `null` when empty — same rule as Task 11, no fake quotes.

- [ ] **Step 1: Add the component**

```tsx
/* ═══════════════════════════════════════════════════════════════════════
   TESTIMONIAL — chỉ hiện khi có lời chứng thực thật, không bịa
   ═══════════════════════════════════════════════════════════════════════ */

export function TestimonialBlock({
  testimonials,
}: {
  testimonials?: Array<{ quote: string; name: string; role: string }>;
}) {
  if (!testimonials || testimonials.length === 0) return null;

  return (
    <section className="ezp-section" aria-labelledby="testimonial-title">
      <div className="ezp-container">
        <div className="ezp-head ezp-head-center">
          <span className="ezp-eyebrow">Người dùng nói gì</span>
          <h2 className="ezp-title" id="testimonial-title">
            Được tin dùng bởi giáo viên và học sinh
          </h2>
        </div>
        <div className="ezp-grid ezp-grid-3">
          {testimonials.map((item) => (
            <figure key={item.name} className="ezp-testimonial">
              <MessageSquareQuote size={20} aria-hidden="true" className="ezp-testimonial-icon" />
              <blockquote className="ezp-testimonial-quote">{item.quote}</blockquote>
              <figcaption className="ezp-testimonial-author">
                {item.name} — {item.role}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
```
(`MessageSquareQuote` is already imported at the top of the file from `lucide-react` for `PrimaryTool` copy — reuse it, no new import needed. Verify with `grep -n "MessageSquareQuote" LandingSections.tsx` before assuming; if it isn't already imported, add it to the existing `lucide-react` import list.)

- [ ] **Step 2: Add CSS**

```css
.ezp-testimonial {
  background: var(--ez-surface);
  border-radius: var(--ez-radius-xl);
  border: 1px solid var(--ez-border);
  padding: var(--ez-space-6);
  margin: 0;
}
.ezp-testimonial-icon { color: var(--ez-secondary); margin-bottom: var(--ez-space-3); }
.ezp-testimonial-quote { font-size: var(--ez-text-h6); margin: 0 0 var(--ez-space-4); }
.ezp-testimonial-author { color: var(--ez-text-secondary); font-size: var(--ez-text-body-sm); font-weight: var(--ez-weight-semibold); }
```

- [ ] **Step 3: Mount** in `pages/landing/index.tsx`, right after `<StatsBlock />`, with no `testimonials` prop:

```tsx
<StatsBlock />
<TestimonialBlock />
```

- [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/public/LandingSections.tsx frontend/src/components/public/public-page.css frontend/src/pages/landing/index.tsx
git commit -m "feat(design): add TestimonialBlock section, hidden until real quotes are supplied"
```

---

## Task 13: Restyle `TrustBlock` (Trust & Safety) — real facts only, new radius/gradient

**Files:**
- Modify: `frontend/src/components/public/LandingSections.tsx` (`TrustBlock` function, no content change — already lists only real mechanisms per current code review; restyle only)
- Modify: `frontend/src/components/public/public-page.css` (`.ezp-card` already gets the bigger radius automatically via the token bump in Task 1 — this task only adds a section-level accent)

**Interfaces:**
- No prop/signature change — pure CSS.

- [ ] **Step 1: Add a subtle gradient rule to the alt-section background** used by `TrustBlock`'s wrapping `<section className="ezp-section">` (not `ezp-section-alt`, confirmed by reading the current function) — add this new class and apply it:

In `LandingSections.tsx`, change the `TrustBlock` section tag from:
```tsx
<section className="ezp-section" aria-labelledby="tin-cay-title" id="tin-cay">
```
to:
```tsx
<section className="ezp-section ezp-section-glow" aria-labelledby="tin-cay-title" id="tin-cay">
```

- [ ] **Step 2: Add the CSS**

```css
.ezp-section-glow {
  background: radial-gradient(ellipse at top, var(--ez-primary-subtle) 0%, transparent 60%);
}
```

- [ ] **Step 3: Verify — explicitly confirm no fabricated claim was added**

Read the current `TRUST` array in `LandingSections.tsx` after this change and confirm it still contains exactly the 4 real items already present (Minh bạch nguồn / Kiểm tra kết quả AI / Quyền riêng tư / Bạn giữ quyền quyết định) — do not add "SOC2", "FERPA", "COPPA", or any compliance claim EzEdu has not actually undergone, per Global Constraints.

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/public/LandingSections.tsx frontend/src/components/public/public-page.css
git commit -m "style(design): restyle Trust & Safety section with gradient accent, no new claims"
```

---

## Task 14: Integrations teaser — "coming soon", no fake logos

**Files:**
- Modify: `frontend/src/components/public/LandingSections.tsx` (add `IntegrationsTeaser`)
- Modify: `frontend/src/pages/landing/index.tsx` (mount)

**Interfaces:**
- Produces: `export function IntegrationsTeaser()` — static "sắp ra mắt" copy, no integration logos/names since none exist yet (per spec §3, item 10).

- [ ] **Step 1: Add the component**

```tsx
/* ═══════════════════════════════════════════════════════════════════════
   TÍCH HỢP — chưa có, nêu rõ "sắp ra mắt", không bịa tên đối tác
   ═══════════════════════════════════════════════════════════════════════ */

export function IntegrationsTeaser() {
  return (
    <section className="ezp-section ezp-section-alt" aria-labelledby="integrations-title">
      <div className="ezp-container ezp-head-center">
        <span className="ezp-eyebrow">Sắp ra mắt</span>
        <h2 className="ezp-title" id="integrations-title">
          Tích hợp với công cụ bạn đang dùng
        </h2>
        <p className="ezp-lede">
          Chúng tôi đang xây dựng khả năng kết nối với các nền tảng học tập phổ biến. Chưa có
          tích hợp nào sẵn sàng ở thời điểm hiện tại.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount** in `pages/landing/index.tsx`, right after `<TestimonialBlock />`:

```tsx
<TestimonialBlock />
<IntegrationsTeaser />
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/public/LandingSections.tsx frontend/src/pages/landing/index.tsx
git commit -m "feat(design): add integrations coming-soon teaser, no fabricated partner names"
```

---

## Task 15: Final CTA + footer restyle, assemble full section order

**Files:**
- Modify: `frontend/src/components/public/LandingSections.tsx` (`FinalCta` — swap `size="lg"` buttons to `size="hero"`)
- Modify: `frontend/src/pages/landing/index.tsx` (confirm final section order matches spec)

**Interfaces:**
- No new component. Final assembled order in `pages/landing/index.tsx` main content must read exactly:

```tsx
<Hero content={content.hero} />
<BuiltForLearning />
{uploadEnabled && <PrimaryTool />}
<QuickExamples />
<HowItWorks />
<WhyEzEdu />
<FeaturesByRole />
<TeacherToolsShowcase />
<StudentToolsShowcase />
<StatsBlock />
<TestimonialBlock />
<TrustBlock />
<IntegrationsTeaser />
<Faq />
<FinalCta />
```

- [ ] **Step 1: Update `FinalCta` buttons** — in `LandingSections.tsx`, change both `<Button size="lg">`/`<Button size="lg" variant="outline">` occurrences inside `FinalCta` to `size="hero"`.

- [ ] **Step 2: Reorder `pages/landing/index.tsx`** to exactly the block shown above (move `<TrustBlock />` down below `<TestimonialBlock />` if it isn't already there from earlier tasks — earlier tasks mounted new sections after `FeaturesByRole` progressively; this step is the final reconciliation pass, read the file fresh and diff against the target order before editing).

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/public/LandingSections.tsx frontend/src/pages/landing/index.tsx
git commit -m "feat(design): finalize landing section order, upsize final CTA buttons"
```

---

## Task 16: Restyle `LoginPage` / `RegisterPage`

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/RegisterPage.tsx`
- Read first: both files in full (not yet read in this plan's research pass) to find their current card/container class name before editing — run `grep -n "className=\"ez" frontend/src/pages/LoginPage.tsx frontend/src/pages/RegisterPage.tsx` and confirm which top-level wrapper class exists.

**Interfaces:**
- No prop/logic change — auth flow, validation, and API calls stay identical. Visual-only: the outer card wrapper gets a `var(--ez-gradient-hero)` page background (matching the screenshot already taken earlier this session showing a light violet gradient behind the login card) and the submit button becomes `size="hero"` block-width.

- [ ] **Step 1: Read both files fully**, identify the outer page wrapper `className` and the submit `<Button>` call.

- [ ] **Step 2: Add a page-background rule** scoped to that wrapper class in the relevant CSS file (same file the wrapper's other rules already live in — do not create a new CSS file for this):

```css
background: var(--ez-gradient-hero);
background-size: 200% 200%;
```
(apply only to the page's outermost background element, not the inner white card — the inner card keeps `var(--ez-surface)` so form contrast is unaffected).

- [ ] **Step 3: Change the submit button** to `<Button size="hero" block>` in both files (`block` prop already exists on `Button`, confirmed in `Button.tsx` via `block && 'ez-btn-block'`).

- [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 5: Manual visual check + axe** — open `/login` and `/register`, confirm form still readable/usable, then run:

```bash
cd frontend && npx playwright test e2e/accessibility.spec.ts --project=desktop-1440
```
Expected: still all pass (these two routes are covered by `accessibility.spec.ts`, confirmed earlier this session). If any axe violation appears on the new gradient background, darken the gradient stops used behind the card (adjust the two `--ez-gradient-hero` color stops in `tokens.css` Task 1, do not weaken this check).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx frontend/src/pages/RegisterPage.tsx
git commit -m "style(design): apply gradient background and hero-size CTA to login/register"
```

---

## Task 17: Re-skin app chrome (`AppLayout.tsx` sidebar/topbar)

**Files:**
- Modify: `frontend/src/components/app-layout.css`
- No change to `frontend/src/components/AppLayout.tsx` logic (nav items, role gating, badge counts stay identical — confirmed by reading the file's structure in this session's research pass).

**Interfaces:**
- Pure CSS. The bigger radius already cascades automatically from Task 1 (`.ez-sidebar`, `.ez-nav-group`, `.ez-user-chip` etc. all reference `var(--ez-radius-*)`, confirmed by grep in this session). This task adds one deliberate accent: the sidebar brand mark gets the gradient background instead of a flat primary color.

- [ ] **Step 1: Find the brand mark rule** — run `grep -n "ez-brand-mark" frontend/src/components/app-layout.css` to get the exact line. Add/modify its `background` declaration to:

```css
background: var(--ez-gradient-cta);
```
(keep every other existing property on that rule — `color`, `border-radius`, sizing — unchanged; only the `background` value changes from a flat color to the gradient token).

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 3: Manual visual check** — log in as any role, confirm sidebar brand mark shows the gradient, nav items show visibly larger radius (inherited from Task 1), nothing else in the sidebar/topbar/tabbar changed structurally.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/app-layout.css
git commit -m "style(design): gradient accent on app sidebar brand mark, radius already inherited from tokens"
```

---

## Task 18: Dashboard greeting banners (3 dashboards)

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/teacher/TeacherDashboardPage.tsx`
- Modify: `frontend/src/pages/student/StudentDashboardPage.tsx`
- Read first: all three files in full before editing (not yet read in this plan's research pass) — find each one's top-level greeting/heading element to replace.

**Interfaces:**
- No data/logic change. Each dashboard's existing greeting heading (e.g. "Chào, {name}") gets wrapped in a new `.ez-dashboard-banner` div with `background: var(--ez-gradient-hero)` and a small `<CharacterIllustration variant="student" />` (or `"teacher"` for the two teacher/admin-facing dashboards) rendered at a fixed small size (80px) to the side — reusing the Task 3 component, no new illustration needed.

- [ ] **Step 1: Read all three dashboard files**, identify each one's greeting/heading JSX block.

- [ ] **Step 2: Wrap the greeting** in each file with:

```tsx
<div className="ez-dashboard-banner">
  <div>
    {/* existing greeting heading/subtext JSX goes here, unchanged */}
  </div>
  <CharacterIllustration variant="teacher" className="ez-dashboard-banner-art" />
</div>
```
(use `variant="student"` in `StudentDashboardPage.tsx`, `variant="teacher"` in the other two). Import `CharacterIllustration` from `'../../components/public/CharacterIllustration'` (adjust relative path per each file's actual location).

- [ ] **Step 3: Add CSS** — append to `frontend/src/components/app-layout.css` (shared chrome stylesheet, since all three dashboards render inside `AppLayout`):

```css
.ez-dashboard-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ez-space-4);
  background: var(--ez-gradient-hero);
  border-radius: var(--ez-radius-xl);
  padding: var(--ez-space-6);
  margin-bottom: var(--ez-space-6);
  color: var(--ez-text-on-brand);
}
.ez-dashboard-banner-art { width: 80px; height: 80px; flex-shrink: 0; }
@media (max-width: 640px) {
  .ez-dashboard-banner-art { display: none; }
}
```

- [ ] **Step 4: Verify contrast** — the existing greeting text needs to switch to `var(--ez-text-on-brand)` color explicitly inside `.ez-dashboard-banner` (its heading/subtext elements likely default to `var(--ez-text)`, which is a dark color meant for the plain surface background, not for this new gradient banner). Add:

```css
.ez-dashboard-banner h1,
.ez-dashboard-banner h2,
.ez-dashboard-banner p {
  color: var(--ez-text-on-brand);
}
```

- [ ] **Step 5: Verify**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```

- [ ] **Step 6: Manual + axe check** — log in as student/teacher/admin, confirm each dashboard banner is legible, then run:

```bash
cd frontend && npx playwright test e2e/authenticated-responsive.spec.ts --project=desktop-1440
```
Expected: still passes (these dashboard routes are covered, confirmed earlier this session).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx frontend/src/pages/teacher/TeacherDashboardPage.tsx frontend/src/pages/student/StudentDashboardPage.tsx frontend/src/components/app-layout.css
git commit -m "feat(design): add gradient greeting banner with character illustration to all 3 dashboards"
```

---

## Task 19: Audit pass — find any page still using hardcoded radius instead of tokens

**Files:**
- No planned modifications yet — this task's steps produce a concrete list; only fix what's actually found.

**Interfaces:**
- None — read-only audit, followed by targeted fixes if (and only if) something is found.

- [ ] **Step 1: Grep for hardcoded pixel radius across all page-local CSS**

```bash
cd frontend/src && grep -rn "border-radius:\s*[0-9]" --include="*.css" . | grep -v "styles/tokens.css"
```

- [ ] **Step 2: For every match found**, open the file, and replace the hardcoded value with the matching token (`var(--ez-radius-sm|md|lg|xl|2xl|full)` — pick whichever token's current pixel value is closest to the original hardcoded value's *intent*, not necessarily its old number, since the whole point of Task 1 was to make radius bigger everywhere).

- [ ] **Step 3: Grep for any component still importing a page-local CSS file that duplicates `components/ui/` styling** (sanity check that the prior admin-page migration this session didn't leave stragglers):

```bash
cd frontend/src && grep -rln "admin-content-btn\|admin-action-btn" --include="*.tsx" .
```
Expected: no output (this session's earlier admin migration already removed all of these — confirmed by the verification pass at that time). If anything appears, it's a regression — stop and investigate before continuing, don't silently patch over it.

- [ ] **Step 4: Commit** (only if Step 2 found and fixed anything; skip commit if the audit was clean)

```bash
git add -A
git commit -m "fix(design): migrate remaining hardcoded radius values to design tokens"
```

---

## Task 20: Full verification pass

**Files:** none modified — verification only.

- [ ] **Step 1: Type check + lint + build**

```bash
cd frontend && npx tsc -b --force && npm run lint && npm run build
```
Expected: all clean, matching the standard this session already established for every prior change.

- [ ] **Step 2: Full Playwright suite**

```bash
cd frontend && npm run test:e2e
```
Expected: 438 passed, same count as the last full run this session (before this redesign). A different pass/fail split would mean a real regression, not just "the screenshots look different" — this suite asserts DOM/behavior, not pixel screenshots, so it should still be 438/438 green after a pure re-skin.

- [ ] **Step 3: Accessibility re-check**

```bash
cd frontend && npx playwright test e2e/accessibility.spec.ts --project=desktop-1440
```
Expected: 14/14 passed (matches the count from the color-token change earlier this session). If a gradient background introduces a new contrast failure, fix the specific gradient stop in `tokens.css` (Task 1) — do not disable or skip the failing assertion.

- [ ] **Step 4: Manual browser check** — start the dev server, open in the Browser pane:
  - `/` (landing) — confirm full new section order renders, hero illustration shows, pill nav, sparkles visible, no console errors.
  - One dashboard (`/dashboard` or `/teacher/dashboard`) — confirm gradient greeting banner renders legibly.
  - One admin page (`/admin/users`) — confirm bigger radius on cards/table/buttons, nothing visually broken, existing functionality (filters, table, dialogs) still works.
  - Toggle dark mode on at least the landing page and one dashboard — confirm gradients and character illustration colors (all token-based `currentColor`/`var()`) still read correctly, no invisible-text-on-background regressions.

- [ ] **Step 5: Update the design-history doc** — append a short completion note to `docs/ui-redesign/00-progress-log.md` (append-only, do not rewrite prior entries) recording: date, "MagicSchool-style full redesign implemented per `docs/superpowers/plans/2026-07-29-magicschool-full-redesign.md`", and the verification numbers from Steps 1-3.

- [ ] **Step 6: Final commit**

```bash
git add docs/ui-redesign/00-progress-log.md
git commit -m "docs: record MagicSchool-style full redesign completion and verification results"
```
