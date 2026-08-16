import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Trang chính sách dữ liệu phải khai đúng những gì mã nguồn thật sự lưu.
 *
 * Đã trượt một lần: bảng khai năm mục trong khi mã dùng bảy, và một tên khoá
 * viết sai (`ez-recent-tools` trong khi mã dùng `ezedu_recent_tools`). Không có
 * gì trong bộ kiểm bắt được, vì không ai đối chiếu hai bên. Bài kiểm này làm
 * việc đó.
 *
 * Một trang chính sách sai số liệu tệ hơn là không có trang nào: nó vẫn được
 * người đọc tin.
 */

const SRC = join(process.cwd(), 'src');
const TRANG_CHINH_SACH = join(SRC, 'pages', 'PublicInfoPages.tsx');

function moiTepNguon(thuMuc: string): string[] {
  return readdirSync(thuMuc).flatMap((ten) => {
    const duongDan = join(thuMuc, ten);
    if (statSync(duongDan).isDirectory()) return moiTepNguon(duongDan);
    return /\.tsx?$/.test(ten) ? [duongDan] : [];
  });
}

/** Khoá localStorage mà mã nguồn thật sự đụng tới. */
function khoaThucTe(): Set<string> {
  const khoa = new Set<string>();

  for (const duongDan of moiTepNguon(SRC)) {
    const noiDung = readFileSync(duongDan, 'utf8');
    // Cả hai kho: `sessionStorage` cũng là dữ liệu để trên máy người dùng.
    // Lọc trước bằng mỗi chữ 'localStorage' đã bỏ sót nguyên tệp
    // AnnouncementBar.tsx, vì tệp đó chỉ dùng sessionStorage.
    if (!/\b(?:local|session)Storage\b/.test(noiDung)) continue;

    // Không chốt tiền tố `localStorage.`: mã thật hay đi qua biến trung gian
    // (`storage.getItem(...)`, `browserStorage()?.setItem(...)`), và bản đầu của
    // bộ dò này bỏ sót đúng hai khoá vì lý do đó — rồi báo ngược thành "trang
    // chính sách khai thừa". Ba tên hàm dưới chỉ có trên `Storage`, quét rộng
    // không sợ bắt nhầm.
    for (const khop of noiDung.matchAll(
      /\.(?:get|set|remove)Item\(\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))/g,
    )) {
      const [, nhayDon, nhayKep, bien] = khop;
      if (nhayDon || nhayKep) {
        // Template literal: giữ phần tiền tố tĩnh trước `${`.
        khoa.add(((nhayDon ?? nhayKep) as string).split('${')[0]);
        continue;
      }
      // Truyền qua biến: tra ngược khai báo hằng trong cùng tệp.
      const khaiBao = noiDung.match(
        new RegExp(`const\\s+${bien}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`),
      );
      if (khaiBao) khoa.add(khaiBao[1]);
    }
  }

  return khoa;
}

/** Khoá mà trang chính sách khai với người dùng. */
function khoaDaKhai(): Set<string> {
  const noiDung = readFileSync(TRANG_CHINH_SACH, 'utf8');
  const bang = noiDung.match(/BROWSER_STORAGE[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!bang) throw new Error('Không tìm thấy BROWSER_STORAGE trong trang chính sách.');
  return new Set(Array.from(bang[1].matchAll(/key:\s*'([^']+)'/g), (khop) => khop[1]));
}

test('trang chính sách khai đủ mọi thứ được lưu trên trình duyệt', ({}, testInfo) => {
  // Đọc mã nguồn, không mở trình duyệt — chạy một lần là đủ.
  test.skip(testInfo.project.name !== 'desktop-1440', 'chỉ cần chạy một lần');

  const thucTe = khoaThucTe();
  const daKhai = khoaDaKhai();

  expect(thucTe.size, 'phải tìm được khoá nào đó, nếu không là bộ dò hỏng').toBeGreaterThan(3);

  // Khoá động (`learning-session:${type}:${id}`) khai bằng tiền tố kèm dấu ba
  // chấm: người đọc cần biết có thứ đó và nó dùng làm gì, chứ không cần từng id.
  const khaiTheoTienTo = [...daKhai].filter((k) => k.endsWith('…')).map((k) => k.slice(0, -1));
  const duocKhai = (k: string) =>
    daKhai.has(k) || khaiTheoTienTo.some((tienTo) => k.startsWith(tienTo));

  const thieu = [...thucTe].filter((k) => !duocKhai(k)).sort();
  expect(thieu, 'mã đang lưu những mục không khai trong trang chính sách').toEqual([]);

  const thua = [...daKhai].filter(
    (k) => !k.endsWith('…') && !thucTe.has(k),
  ).sort();
  expect(thua, 'trang chính sách khai mục mà mã không còn dùng — hoặc sai tên').toEqual([]);
});
