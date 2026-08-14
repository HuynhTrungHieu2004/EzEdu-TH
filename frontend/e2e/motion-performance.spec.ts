import { expect, test, type Page } from '@playwright/test';
import { STUDENT_USER, stubApi } from './helpers';

/**
 * Đo nhịp khung hình của chuyển động trên CPU bị hãm (spec §11 "animation kiểm
 * tra trên thiết bị yếu").
 *
 * Playwright hãm CPU qua CDP nên chỉ chạy được trên Chromium — đủ đại diện cho
 * máy học sinh cấu hình thấp. Ngưỡng đặt ở mức "không giật thấy được" chứ không
 * phải 60fps: mục tiêu là phát hiện hồi quy kiểu animate layout property hoặc
 * tạo hàng trăm tween, không phải khoá một con số tuyệt đối trên máy CI.
 */

const CPU_THROTTLE_RATE = 4; // chậm gấp 4 lần máy chạy test
const MIN_AVERAGE_FPS = 24;
const MAX_LONG_FRAME_MS = 120;

type FrameStats = { frames: number; durationMs: number; longestFrameMs: number };

async function throttleCpu(page: Page, rate: number) {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  return client;
}

/** Đếm khung hình thật bằng requestAnimationFrame trong lúc chuyển động chạy. */
async function measureFrames(page: Page, sampleMs: number): Promise<FrameStats> {
  return page.evaluate(async (duration) => {
    return new Promise<FrameStats>((resolve) => {
      let frames = 0;
      let longestFrameMs = 0;
      let previous = performance.now();
      const start = previous;

      const tick = (now: number) => {
        frames += 1;
        longestFrameMs = Math.max(longestFrameMs, now - previous);
        previous = now;
        if (now - start < duration) {
          requestAnimationFrame(tick);
        } else {
          resolve({ frames, durationMs: now - start, longestFrameMs });
        }
      };

      requestAnimationFrame(tick);
    });
  }, sampleMs);
}

test.describe('hiệu năng chuyển động khi CPU bị hãm', () => {
  // CDP CPU throttling chỉ có ở Chromium.
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP CPU throttling chỉ có ở Chromium');
  // Chỉ chạy ở project `perf` (xem playwright.config.ts): đo nhịp khung hình song
  // song sáu viewport vừa chậm vừa nhiễu số đo, mà hồi quy hiệu năng không phụ
  // thuộc bề rộng cửa sổ.

  test('page entrance và stagger của dashboard giữ nhịp khung hình', async ({ page }) => {
    test.setTimeout(60_000);
    await stubApi(page, STUDENT_USER);
    await page.route('**/api/v1/questions/published*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: Array.from({ length: 8 }, (_, index) => ({
          id: `set-${index}`,
          document_name: `Bộ đề ${index + 1}`,
          question_count: 10,
          published_question_count: 10,
          created_at: '2026-08-01T02:00:00Z',
        })),
        total: 8,
      }),
    }));
    await page.route('**/api/v1/questions/attempts/my-history', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'h1', item_type: 'practice', question_set_id: 'set-0', title: 'Bộ đề 1', score: 8, max_score: 10, percent: 80, created_at: '2026-08-10T02:00:00Z' },
      ]),
    }));

    const client = await throttleCpu(page, CPU_THROTTLE_RATE);
    await page.goto('/dashboard');
    const stats = await measureFrames(page, 1200);
    await client.detach();

    const fps = (stats.frames / stats.durationMs) * 1000;
    expect(fps, `fps trung bình ${fps.toFixed(1)}`).toBeGreaterThan(MIN_AVERAGE_FPS);
    expect(stats.longestFrameMs, `khung dài nhất ${stats.longestFrameMs.toFixed(0)}ms`)
      .toBeLessThan(MAX_LONG_FRAME_MS);
  });

  test('reveal theo cuộn của trang chủ giữ nhịp khung hình', async ({ page }) => {
    test.setTimeout(60_000);
    await stubApi(page);
    const client = await throttleCpu(page, CPU_THROTTLE_RATE);
    await page.goto('/');
    await page.locator('[data-pipeline]').scrollIntoViewIfNeeded();

    // Vừa cuộn vừa đo: ScrollTrigger scrub là chỗ dễ giật nhất trên máy yếu.
    const measuring = measureFrames(page, 1500);
    for (let step = 0; step < 6; step += 1) {
      await page.mouse.wheel(0, 320);
    }
    const stats = await measuring;
    await client.detach();

    const fps = (stats.frames / stats.durationMs) * 1000;
    expect(fps, `fps trung bình ${fps.toFixed(1)}`).toBeGreaterThan(MIN_AVERAGE_FPS);
    expect(stats.longestFrameMs, `khung dài nhất ${stats.longestFrameMs.toFixed(0)}ms`)
      .toBeLessThan(MAX_LONG_FRAME_MS);
  });

  test('chuyển câu trong đề thi chỉ animate transform và opacity', async ({ page }) => {
    await stubApi(page, STUDENT_USER);
    const now = Date.now();
    const attempt = {
      id: 'a1', exam_id: 'e1', exam_code: 'DE-1', student_id: STUDENT_USER.id,
      status: 'in_progress', answers: {},
      started_at: new Date(now - 60_000).toISOString(),
      due_at: new Date(now + 1_800_000).toISOString(),
      server_now: new Date(now).toISOString(),
      submitted_at: null, auto_submitted: false, total_score: 0, max_score: 3, results: [], version: 1,
    };
    await page.route('**/api/v1/exams/*/attempts/start', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(attempt),
    }));
    await page.route('**/api/v1/exams/*/questions', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        exam: {}, hide_answers: true,
        questions: [1, 2, 3].map((n) => ({
          question_id: `q${n}`, order: n, content: `Câu số ${n}?`, options: { A: 'a', B: 'b' },
          correct_answer: null, explanation: null, points: 1, bloom_level: 'apply',
          difficulty: 'easy', question_type: 'multiple_choice', source_document_id: null, citation: null,
        })),
      }),
    }));
    await page.route('**/api/v1/exam-attempts/a1', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(attempt),
    }));

    await page.goto('/take-exam/e1');
    await expect(page.getByRole('heading', { name: 'Câu 1/3 (1 điểm)' })).toBeVisible();

    // Chụp inline style ngay trong lúc tween chạy: chỉ được có transform/opacity/
    // visibility — animate width/height/top/left sẽ buộc trình duyệt layout lại.
    await page.getByRole('button', { name: 'Câu sau' }).click();
    const animatedProps = await page.locator('[data-exam-question]').evaluate((element) => {
      const style = element.getAttribute('style') ?? '';
      return style
        .split(';')
        .map((declaration) => declaration.split(':')[0]?.trim())
        .filter(Boolean);
    });

    const layoutProps = animatedProps.filter(
      (prop) => !['transform', 'opacity', 'visibility', 'will-change', 'translate', 'rotate', 'scale'].includes(prop),
    );
    expect(layoutProps, `thuộc tính gây layout: ${layoutProps.join(', ')}`).toEqual([]);
  });
});
