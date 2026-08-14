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

test('base academic tokens override the legacy body cascade', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  const bodyStyle = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      color: style.color,
    };
  });

  expect(bodyStyle.backgroundColor).toBe('rgb(243, 247, 247)');
  expect(bodyStyle.backgroundImage).toBe('none');
  expect(bodyStyle.color).toBe('rgb(18, 45, 58)');
});

test('dark theme keeps the academic teal and gold semantic palette', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  const colors = await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--ez-primary)';
    probe.style.borderColor = 'var(--ez-accent)';
    document.body.append(probe);
    const result = {
      primary: getComputedStyle(probe).backgroundColor,
      accent: getComputedStyle(probe).borderTopColor,
    };
    probe.remove();
    return result;
  });

  expect(colors.primary).toBe('rgb(23, 125, 115)');
  expect(colors.accent).toBe('rgb(229, 184, 91)');
});

test('reduced motion preserves animations while disabling root smooth scrolling', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  const motion = await page.evaluate(() => {
    document.documentElement.dataset.motion = 'reduced';
    const probe = document.createElement('div');
    probe.style.animation = 'spin 750ms linear infinite';
    document.body.append(probe);
    const result = {
      rootScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      animationDuration: getComputedStyle(probe).animationDuration,
    };
    probe.remove();
    return result;
  });

  expect(motion.rootScrollBehavior).toBe('auto');
  expect(motion.animationDuration).toBe('0.75s');
});
