#!/usr/bin/env node
/* Generate reviewable SVG/PNG diagrams without requiring PlantUML or Graphviz. */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "diagrams");
fs.mkdirSync(out, { recursive: true });

const C = {
  bg: "#F4F7FB",
  navy: "#163B65",
  blue: "#2E74B5",
  blue2: "#DCEAF7",
  pale: "#EEF5FB",
  ink: "#182230",
  muted: "#526173",
  line: "#8AA3BB",
  green: "#1F7A5C",
  greenBg: "#E5F5EF",
  amber: "#B7791F",
  amberBg: "#FFF3D6",
  red: "#B42318",
  redBg: "#FDE9E7",
  white: "#FFFFFF",
  purple: "#6B4AA5",
  purpleBg: "#F0EAF9",
};

const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function wrap(text, max = 34) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if ((line + " " + word).length <= max) line += " " + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function text(x, y, value, opts = {}) {
  const {
    size = 26,
    weight = 400,
    fill = C.ink,
    anchor = "start",
    max = 0,
    lineHeight = 1.22,
    italic = false,
  } = opts;
  const lines = max ? wrap(value, max) : String(value).split("\n");
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i === 0 ? 0 : size * lineHeight}">${esc(line)}</tspan>`,
    )
    .join("");
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}"${italic ? ' font-style="italic"' : ""}>${tspans}</text>`;
}

function rect(x, y, w, h, opts = {}) {
  const {
    fill = C.white,
    stroke = C.line,
    sw = 2,
    rx = 16,
    dash = "",
  } = opts;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

function line(x1, y1, x2, y2, opts = {}) {
  const {
    stroke = C.line,
    sw = 3,
    dash = "",
    arrow = false,
    startArrow = false,
  } = opts;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}${arrow ? ' marker-end="url(#arrow)"' : ""}${startArrow ? ' marker-start="url(#arrowStart)"' : ""}/>`;
}

function pathEl(d, opts = {}) {
  const {
    stroke = C.line,
    sw = 3,
    dash = "",
    arrow = false,
    fill = "none",
  } = opts;
  return `<path d="${d}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}"${dash ? ` stroke-dasharray="${dash}"` : ""}${arrow ? ' marker-end="url(#arrow)"' : ""}/>`;
}

function titleBlock(title, subtitle, width) {
  return [
    text(80, 82, title, { size: 44, weight: 700, fill: C.navy }),
    text(80, 122, subtitle, { size: 21, fill: C.muted }),
    line(80, 150, width - 80, 150, { stroke: C.blue, sw: 4 }),
  ].join("");
}

function svgDoc(width, height, body, title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
<defs>
  <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="${C.line}"/></marker>
  <marker id="arrowBlue" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="${C.blue}"/></marker>
  <marker id="arrowStart" markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse"><path d="M12,0 L0,6 L12,12 z" fill="${C.line}"/></marker>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#163B65" flood-opacity=".12"/></filter>
  <style>text{font-family:Arial,"Helvetica Neue",sans-serif} .small{font-size:18px}</style>
</defs>
<rect width="100%" height="100%" fill="${C.bg}"/>
${body}
</svg>`;
}

function actor(x, y, label, color = C.navy) {
  return [
    `<circle cx="${x}" cy="${y}" r="27" fill="${C.white}" stroke="${color}" stroke-width="4"/>`,
    line(x, y + 27, x, y + 105, { stroke: color, sw: 4 }),
    line(x - 43, y + 57, x + 43, y + 57, { stroke: color, sw: 4 }),
    line(x, y + 105, x - 38, y + 155, { stroke: color, sw: 4 }),
    line(x, y + 105, x + 38, y + 155, { stroke: color, sw: 4 }),
    text(x, y + 197, label, { size: 23, weight: 700, anchor: "middle", fill: color, max: 18 }),
  ].join("");
}

function usecase(x, y, w, h, label, fill = C.white) {
  return [
    `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${C.blue}" stroke-width="3"/>`,
    text(x + w / 2, y + h / 2 + 8, label, {
      size: 21,
      weight: 600,
      anchor: "middle",
      max: 29,
    }),
  ].join("");
}

function packageBox(x, y, w, h, label, fill = C.pale) {
  return [
    rect(x, y, w, h, { fill, stroke: C.line, sw: 2, rx: 18 }),
    rect(x + 20, y - 24, Math.min(w - 40, 300), 50, {
      fill: C.navy,
      stroke: C.navy,
      rx: 8,
    }),
    text(x + 38, y + 10, label, { size: 21, weight: 700, fill: C.white }),
  ].join("");
}

function buildUseCase() {
  const W = 2500;
  const H = 1750;
  let b = titleBlock(
    "USE CASE DIAGRAM – EZEDU AI",
    "Phạm vi tổng thể: học liệu, RAG, luyện tập, thi, cá nhân hóa và quản trị",
    W,
  );

  b += rect(380, 205, 1740, 1435, {
    fill: "#F8FBFE",
    stroke: C.navy,
    sw: 4,
    rx: 24,
  });
  b += text(420, 250, "Biên hệ thống EzEdu AI", {
    size: 28,
    weight: 700,
    fill: C.navy,
  });

  const packages = [
    {
      x: 440,
      y: 310,
      title: "Tài khoản & truy cập",
      color: C.blue2,
      ucs: ["Đăng ký / đăng nhập", "Hồ sơ và RBAC"],
    },
    {
      x: 990,
      y: 310,
      title: "Học liệu & RAG",
      color: C.greenBg,
      ucs: ["Tải / quản lý tài liệu", "Xử lý & lập chỉ mục", "Xác minh chất lượng", "Hỏi đáp có trích dẫn"],
    },
    {
      x: 1540,
      y: 310,
      title: "Luyện tập & kiểm tra",
      color: C.amberBg,
      ucs: ["Sinh bộ câu hỏi", "Làm bài luyện tập", "Ngân hàng câu hỏi", "Blueprint, đề thi, chấm"],
    },
    {
      x: 440,
      y: 970,
      title: "Dạy học",
      color: C.purpleBg,
      ucs: ["Quản lý lớp học", "Giao bài & theo dõi"],
    },
    {
      x: 990,
      y: 970,
      title: "Cá nhân hóa",
      color: C.blue2,
      ucs: ["Knowledge graph", "Hồ sơ năng lực", "Đề xuất lộ trình học"],
    },
    {
      x: 1540,
      y: 970,
      title: "Quản trị & vận hành",
      color: C.redBg,
      ucs: ["Người dùng & nội dung", "Kiểm duyệt tri thức", "Cấu hình / feature flag", "AI usage, job, audit"],
    },
  ];

  for (const p of packages) {
    const h = p.y < 900 ? 590 : 570;
    b += packageBox(p.x, p.y, 500, h, p.title, p.color);
    p.ucs.forEach((uc, i) => {
      b += usecase(p.x + 55, p.y + 70 + i * 120, 390, 86, uc);
    });
  }

  b += actor(175, 330, "Khách");
  b += actor(175, 610, "Học sinh", C.green);
  b += actor(175, 925, "Giảng viên", C.purple);
  b += actor(175, 1260, "Nhân sự quản trị", C.red);
  b += actor(2310, 360, "Gemini / Groq", C.amber);
  b += actor(2310, 700, "Cloudinary", C.blue);
  b += actor(2310, 1040, "Nguồn web", C.green);
  b += actor(2310, 1360, "Super Admin", C.red);

  const assoc = [
    [225, 390, 440, 395],
    [225, 670, 440, 515],
    [225, 680, 990, 755],
    [225, 705, 1540, 515],
    [225, 985, 990, 395],
    [225, 1000, 1540, 635],
    [225, 1020, 440, 1160],
    [225, 1320, 1540, 1160],
    [2250, 420, 1490, 635],
    [2250, 760, 990, 515],
    [2250, 1100, 990, 875],
    [2250, 1420, 2040, 1435],
  ];
  assoc.forEach(([x1, y1, x2, y2]) => {
    b += line(x1, y1, x2, y2, { stroke: "#7890A8", sw: 2.5 });
  });

  b += pathEl("M 990 515 C 880 515, 880 635, 990 635", {
    stroke: C.green,
    dash: "10 8",
    arrow: true,
  });
  b += text(825, 565, "«include»", {
    size: 18,
    fill: C.green,
    italic: true,
  });
  b += pathEl("M 1540 755 C 1460 755, 1460 875, 1540 875", {
    stroke: C.amber,
    dash: "10 8",
    arrow: true,
  });
  b += text(1380, 815, "«include»", {
    size: 18,
    fill: C.amber,
    italic: true,
  });
  b += text(420, 1690, "Nguồn: phân tích trực tiếp mã nguồn, router, schema và tài liệu QA trong repository.", {
    size: 18,
    fill: C.muted,
  });
  return { name: "use-case-diagram", svg: svgDoc(W, H, b, "Use Case Diagram EzEdu AI") };
}

function nodeBox(x, y, w, h, label, opts = {}) {
  const fill = opts.fill || C.white;
  const stroke = opts.stroke || C.blue;
  const shape = opts.shape || "round";
  let s = "";
  if (shape === "diamond") {
    s += `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
  } else {
    s += rect(x, y, w, h, { fill, stroke, sw: 3, rx: shape === "sharp" ? 4 : 18 });
  }
  s += text(x + w / 2, y + h / 2 + 7, label, {
    size: 20,
    weight: 600,
    anchor: "middle",
    max: Math.max(18, Math.round(w / 13)),
  });
  return s;
}

function buildActivity() {
  const W = 2400;
  const H = 1950;
  const laneX = [100, 540, 980, 1420, 1860];
  const laneNames = ["Người dùng", "React Frontend", "FastAPI Backend", "Worker / AI", "Kho dữ liệu"];
  let b = titleBlock(
    "ACTIVITY DIAGRAM – VÒNG ĐỜI TÀI LIỆU",
    "Từ tải tệp đến lập chỉ mục, xác minh và khai thác nội dung",
    W,
  );
  laneNames.forEach((name, i) => {
    b += rect(laneX[i], 210, 420, 1630, {
      fill: i % 2 ? "#F8FBFE" : C.white,
      stroke: C.line,
      sw: 2,
      rx: 4,
    });
    b += rect(laneX[i], 210, 420, 65, {
      fill: i === 3 ? C.purple : i === 4 ? C.green : C.navy,
      stroke: C.navy,
      sw: 0,
      rx: 4,
    });
    b += text(laneX[i] + 210, 252, name, {
      size: 23,
      weight: 700,
      anchor: "middle",
      fill: C.white,
    });
  });

  b += `<circle cx="310" cy="330" r="22" fill="${C.navy}"/>`;
  b += nodeBox(165, 390, 290, 84, "Chọn tệp và mục đích");
  b += nodeBox(600, 390, 300, 84, "Kiểm tra tệp phía client");
  b += nodeBox(1030, 390, 320, 84, "Xác thực JWT và quyền");
  b += nodeBox(1080, 535, 220, 120, "Hợp lệ?", {
    shape: "diamond",
    fill: C.amberBg,
    stroke: C.amber,
  });
  b += nodeBox(1030, 720, 320, 84, "Tính checksum / kiểm tra trùng");
  b += nodeBox(1080, 865, 220, 120, "Đã tồn tại?", {
    shape: "diamond",
    fill: C.amberBg,
    stroke: C.amber,
  });
  b += nodeBox(1480, 720, 320, 84, "Trích xuất / phiên âm", {
    fill: C.purpleBg,
    stroke: C.purple,
  });
  b += nodeBox(1480, 850, 320, 84, "Làm sạch và chia đoạn", {
    fill: C.purpleBg,
    stroke: C.purple,
  });
  b += nodeBox(1480, 980, 320, 84, "Sinh embedding", {
    fill: C.purpleBg,
    stroke: C.purple,
  });
  b += nodeBox(1920, 980, 300, 84, "Lưu vector ChromaDB", {
    fill: C.greenBg,
    stroke: C.green,
  });
  b += nodeBox(1480, 1110, 320, 84, "Xác minh chất lượng", {
    fill: C.purpleBg,
    stroke: C.purple,
  });
  b += nodeBox(1920, 1110, 300, 84, "Lưu metadata / kết quả", {
    fill: C.greenBg,
    stroke: C.green,
  });
  b += nodeBox(1030, 1240, 320, 84, "Cập nhật trạng thái ready");
  b += nodeBox(600, 1240, 300, 84, "Hiển thị tài liệu, cảnh báo");
  b += nodeBox(200, 1390, 220, 120, "Tác vụ tiếp?", {
    shape: "diamond",
    fill: C.blue2,
    stroke: C.blue,
  });
  b += nodeBox(600, 1395, 300, 84, "Hỏi đáp theo tài liệu");
  b += nodeBox(1030, 1395, 320, 84, "Truy hồi top-k chunks");
  b += nodeBox(1480, 1395, 320, 84, "Sinh đáp án có trích dẫn", {
    fill: C.purpleBg,
    stroke: C.purple,
  });
  b += nodeBox(600, 1550, 300, 84, "Sinh / làm bộ câu hỏi");
  b += nodeBox(1030, 1550, 320, 84, "Lưu câu hỏi / kết quả");
  b += nodeBox(165, 1685, 290, 84, "Xem kết quả và phản hồi");
  b += `<circle cx="310" cy="1800" r="24" fill="${C.white}" stroke="${C.navy}" stroke-width="5"/><circle cx="310" cy="1800" r="13" fill="${C.navy}"/>`;

  const arrows = [
    [310, 352, 310, 390],
    [455, 432, 600, 432],
    [900, 432, 1030, 432],
    [1190, 474, 1190, 535],
    [1190, 655, 1190, 720],
    [1190, 804, 1190, 865],
    [1300, 925, 1480, 762],
    [1640, 804, 1640, 850],
    [1640, 934, 1640, 980],
    [1800, 1022, 1920, 1022],
    [2070, 1064, 2070, 1110],
    [1920, 1152, 1800, 1152],
    [1480, 1152, 1350, 1282],
    [1030, 1282, 900, 1282],
    [750, 1324, 420, 1450],
    [420, 1450, 600, 1437],
    [900, 1437, 1030, 1437],
    [1350, 1437, 1480, 1437],
    [420, 1450, 600, 1592],
    [900, 1592, 1030, 1592],
    [1030, 1592, 455, 1727],
    [1480, 1437, 455, 1727],
    [310, 1769, 310, 1776],
  ];
  arrows.forEach(([x1, y1, x2, y2]) => {
    b += line(x1, y1, x2, y2, { stroke: C.line, sw: 3, arrow: true });
  });
  b += pathEl("M 1080 925 L 950 925 L 950 1280 L 900 1280", {
    stroke: C.green,
    sw: 3,
    arrow: true,
  });
  b += text(980, 905, "Có", { size: 18, fill: C.green, weight: 700 });
  b += pathEl("M 1080 595 L 930 595 L 930 540 L 750 540", {
    stroke: C.red,
    sw: 3,
    arrow: true,
  });
  b += nodeBox(600, 505, 300, 70, "Hiển thị lỗi 4xx", {
    fill: C.redBg,
    stroke: C.red,
  });
  b += text(995, 578, "Không", { size: 18, fill: C.red, weight: 700 });
  b += text(1320, 900, "Không", { size: 18, fill: C.muted, weight: 700 });
  b += text(450, 1415, "Hỏi đáp", { size: 17, fill: C.blue, weight: 700 });
  b += text(450, 1575, "Luyện tập", { size: 17, fill: C.blue, weight: 700 });
  b += line(455, 1727, 310, 1685, { stroke: C.line, sw: 3, arrow: true });
  b += line(310, 1769, 310, 1776, { stroke: C.line, sw: 3, arrow: true });
  return { name: "activity-diagram", svg: svgDoc(W, H, b, "Activity Diagram EzEdu AI") };
}

function buildSequence() {
  const W = 2850;
  const H = 1850;
  let b = titleBlock(
    "SEQUENCE DIAGRAM – HỎI ĐÁP RAG THEO TÀI LIỆU",
    "Luồng chính, nhánh lỗi và cơ chế provider dự phòng",
    W,
  );
  const parts = [
    ["Người học", C.green],
    ["React UI", C.blue],
    ["Auth / Chat API", C.navy],
    ["MongoDB", C.green],
    ["RAG Service", C.purple],
    ["ChromaDB", C.green],
    ["Gemini / Groq", C.amber],
  ];
  const xs = [170, 580, 990, 1400, 1810, 2220, 2630];
  parts.forEach(([label, color], i) => {
    b += rect(xs[i] - 150, 220, 300, 76, { fill: C.white, stroke: color, sw: 3, rx: 12 });
    b += text(xs[i], 268, label, {
      size: 21,
      weight: 700,
      anchor: "middle",
      fill: color,
    });
    b += line(xs[i], 296, xs[i], 1760, { stroke: "#B4C4D3", sw: 2, dash: "9 9" });
  });

  function msg(n, from, to, y, label, opts = {}) {
    const x1 = xs[from];
    const x2 = xs[to];
    const response = opts.response || false;
    const color = opts.color || (response ? C.muted : C.blue);
    b += line(x1, y, x2, y, {
      stroke: color,
      sw: 3,
      dash: response ? "10 7" : "",
      arrow: true,
    });
    b += text((x1 + x2) / 2, y - 12, `${n}. ${label}`, {
      size: 18,
      weight: 600,
      anchor: "middle",
      fill: color,
      max: 45,
    });
  }

  msg(1, 0, 1, 360, "Nhập câu hỏi, chọn tài liệu");
  msg(2, 1, 2, 445, "POST /chat + JWT + documentIds");
  b += rect(850, 480, 280, 92, { fill: C.blue2, stroke: C.blue, sw: 2, rx: 8 });
  b += text(990, 515, "Xác thực JWT, quyền", { size: 18, weight: 700, anchor: "middle" });
  b += text(990, 543, "và rate limit", { size: 18, weight: 700, anchor: "middle" });

  b += rect(420, 610, 2220, 940, { fill: "none", stroke: C.amber, sw: 3, rx: 10 });
  b += rect(420, 610, 470, 50, { fill: C.amberBg, stroke: C.amber, sw: 2, rx: 5 });
  b += text(445, 643, "ALT – kiểm tra yêu cầu", { size: 20, weight: 700, fill: C.amber });
  b += text(445, 695, "[không hợp lệ]", { size: 18, weight: 700, fill: C.red });
  msg(3, 2, 1, 745, "400 / 401 / 403 / 429", { response: true, color: C.red });
  msg(4, 1, 0, 825, "Hiển thị thông báo phù hợp", { response: true, color: C.red });
  b += line(420, 870, 2640, 870, { stroke: C.amber, sw: 2 });
  b += text(445, 910, "[hợp lệ]", { size: 18, weight: 700, fill: C.green });

  msg(5, 2, 3, 940, "Tạo hoặc đọc conversation");
  msg(6, 2, 4, 1020, "answer(question, contextScope)");
  msg(7, 4, 5, 1100, "similaritySearch(embedding, filters)");
  msg(8, 5, 4, 1180, "top-k chunks + metadata", { response: true });
  msg(9, 4, 6, 1260, "Prompt + chunks + guardrails");

  b += rect(1740, 1300, 1040, 110, { fill: C.redBg, stroke: C.red, sw: 2, rx: 8 });
  b += text(1768, 1335, "Nếu provider lỗi / hết quota:", {
    size: 18,
    weight: 700,
    fill: C.red,
  });
  b += text(1768, 1368, "ghi nhận lỗi và thử provider dự phòng theo cấu hình.", {
    size: 18,
    fill: C.ink,
  });
  msg(10, 6, 4, 1450, "answer + token usage", { response: true });

  msg(11, 4, 2, 1590, "Đáp án + citations + confidence", { response: true });
  msg(12, 2, 3, 1665, "Lưu message và AI usage event");
  msg(13, 2, 1, 1740, "200 OK: answer + citations", { response: true, color: C.green });
  b += text(80, 1810, "Nhánh mở rộng: nếu ngữ cảnh không đủ, API trả lời an toàn và đề nghị bổ sung tài liệu; phản hồi của người học được lưu riêng.", {
    size: 18,
    fill: C.muted,
  });
  return { name: "sequence-diagram", svg: svgDoc(W, H, b, "Sequence Diagram EzEdu AI") };
}

function classBox(x, y, w, title, fields, methods = [], color = C.blue) {
  const titleH = 54;
  const fieldH = fields.length * 31 + 24;
  const methodH = methods.length ? methods.length * 31 + 20 : 0;
  const h = titleH + fieldH + methodH;
  let s = rect(x, y, w, h, { fill: C.white, stroke: color, sw: 3, rx: 8 });
  s += `<path d="M${x},${y + titleH} H${x + w}" stroke="${color}" stroke-width="2"/>`;
  s += rect(x, y, w, titleH, { fill: color, stroke: color, sw: 0, rx: 8 });
  s += text(x + w / 2, y + 36, title, {
    size: 21,
    weight: 700,
    anchor: "middle",
    fill: C.white,
  });
  fields.forEach((f, i) => {
    s += text(x + 18, y + titleH + 31 + i * 31, f, { size: 18, fill: C.ink });
  });
  if (methods.length) {
    const sepY = y + titleH + fieldH;
    s += line(x, sepY, x + w, sepY, { stroke: color, sw: 2 });
    methods.forEach((m, i) => {
      s += text(x + 18, sepY + 30 + i * 31, m, { size: 18, fill: color, weight: 600 });
    });
  }
  return { svg: s, h };
}

function buildClass() {
  const W = 3900;
  const H = 2750;
  let b = titleBlock(
    "CLASS DIAGRAM – MÔ HÌNH MIỀN NGHIỆP VỤ",
    "Các aggregate chính và quan hệ giữa identity, content, assessment, knowledge và personalization",
    W,
  );
  const groups = [
    [80, 210, 720, 650, "Identity & Classroom", C.blue2, C.blue],
    [840, 210, 970, 1140, "Content & RAG", C.greenBg, C.green],
    [1850, 210, 900, 920, "Practice & Exam", C.amberBg, C.amber],
    [2790, 210, 1030, 1560, "Knowledge & Personalization", C.purpleBg, C.purple],
    [80, 900, 720, 870, "Administration & Ops", C.redBg, C.red],
  ];
  groups.forEach(([x, y, w, h, label, fill, stroke]) => {
    b += packageBox(x, y, w, h, label, fill);
  });

  const boxes = {};
  function add(name, x, y, w, fields, methods, color) {
    const c = classBox(x, y, w, name, fields, methods, color);
    b += c.svg;
    boxes[name] = { x, y, w, h: c.h };
  }
  add("User", 130, 290, 300, ["+id: ObjectId", "+email: string", "+role: Role", "+status: UserStatus"], ["+hasPermission()", "+authenticate()"], C.blue);
  add("Classroom", 470, 290, 280, ["+id: ObjectId", "+name: string", "+inviteCode: string"], ["+addStudent()", "+publishAssignment()"], C.blue);
  add("RBACPolicy", 130, 590, 300, ["+role: Role", "+permissions: Set"], ["+allows(permission)"], C.blue);

  add("Document", 900, 290, 300, ["+id: ObjectId", "+title: string", "+fileType: string", "+status: string"], ["+extract()", "+index()"], C.green);
  add("DocumentContent", 1260, 290, 300, ["+rawText: text", "+normalizedText: text", "+language: string"], [], C.green);
  add("DocumentChunk", 900, 560, 300, ["+chunkIndex: int", "+content: text", "+vectorId: string"], [], C.green);
  add("VerificationSession", 1260, 560, 350, ["+status: string", "+qualityScore: decimal"], ["+verify()"], C.green);
  add("VerificationIssue", 1260, 800, 350, ["+severity: string", "+category: string", "+resolutionStatus: string"], [], C.green);
  add("Conversation", 900, 860, 300, ["+title: string", "+scope: string"], ["+ask()"], C.green);
  add("Message", 900, 1080, 300, ["+role: string", "+content: text", "+citations: Citation[]"], [], C.green);

  add("QuestionSet", 1900, 290, 330, ["+title: string", "+difficulty: string", "+status: string"], ["+generate()", "+publish()"], C.amber);
  add("QuestionSetItem", 2280, 290, 350, ["+type: string", "+prompt: text", "+correctAnswer: text"], ["+review()"], C.amber);
  add("PracticeAttempt", 1900, 570, 330, ["+score: decimal", "+startedAt: datetime"], ["+submit()"], C.amber);
  add("BankQuestion", 2280, 570, 350, ["+type: string", "+difficulty: string", "+cognitiveLevel: string"], ["+approve()"], C.amber);
  add("ExamBlueprint", 1900, 830, 330, ["+name: string", "+durationMinutes: int", "+totalQuestions: int"], ["+validateConstraints()"], C.amber);
  add("Exam", 2280, 830, 350, ["+title: string", "+status: string"], ["+publish()"], C.amber);
  add("ExamAttempt", 2280, 1060, 350, ["+status: string", "+score: decimal"], ["+start()", "+submit()", "+grade()"], C.amber);

  add("KnowledgeComponent", 2850, 290, 390, ["+code: string", "+name: string", "+difficulty: decimal"], [], C.purple);
  add("KnowledgeEdge", 3300, 290, 390, ["+relationType: string", "+weight: decimal"], [], C.purple);
  add("LearningItem", 2850, 550, 390, ["+itemType: string", "+difficulty: decimal"], [], C.purple);
  add("LearningEvent", 3300, 550, 390, ["+eventType: string", "+score: decimal"], [], C.purple);
  add("LearnerProfile", 2850, 790, 390, ["+level: string", "+learningStyle: string"], [], C.purple);
  add("KnowledgeState", 3300, 790, 390, ["+masteryProbability: decimal", "+updatedAt: datetime"], ["+update()"], C.purple);
  add("Recommendation", 3075, 1060, 390, ["+rank: int", "+score: decimal", "+reason: string"], [], C.purple);

  add("FeatureFlag", 130, 990, 300, ["+key: string", "+enabled: bool"], ["+evaluate()"], C.red);
  add("BackgroundJob", 470, 990, 280, ["+type: string", "+status: string", "+attempts: int"], ["+retry()"], C.red);
  add("AuditLog", 130, 1240, 300, ["+actorId: ObjectId", "+action: string", "+resource: string"], [], C.red);
  add("AIUsageEvent", 470, 1240, 280, ["+provider: string", "+model: string", "+tokens: int"], [], C.red);

  function rel(a, bname, label, opts = {}) {
    const A = boxes[a];
    const B = boxes[bname];
    const x1 = A.x + A.w / 2;
    const y1 = A.y + A.h;
    const x2 = B.x + B.w / 2;
    const y2 = B.y;
    const midY = (y1 + y2) / 2;
    b += pathEl(`M${x1},${y1} V${midY} H${x2} V${y2}`, {
      stroke: opts.stroke || C.line,
      sw: 2.5,
      arrow: opts.arrow || false,
      dash: opts.dash || "",
    });
    if (label) {
      b += text((x1 + x2) / 2, midY - 8, label, {
        size: 16,
        fill: C.muted,
        anchor: "middle",
      });
    }
  }
  rel("User", "RBACPolicy", "uses");
  rel("Document", "DocumentChunk", "1 •— 0..*");
  rel("DocumentContent", "VerificationSession", "1 — 0..*");
  rel("VerificationSession", "VerificationIssue", "1 •— 0..*");
  rel("Conversation", "Message", "1 •— 1..*");
  rel("QuestionSet", "PracticeAttempt", "1 — 0..*");
  rel("BankQuestion", "Exam", "0..* — 0..*");
  rel("ExamBlueprint", "ExamAttempt", "blueprint → exam → attempt");
  rel("KnowledgeComponent", "LearningItem", "0..* — 0..*");
  rel("KnowledgeEdge", "LearningEvent", "supports evidence");
  rel("LearnerProfile", "Recommendation", "drives");
  rel("KnowledgeState", "Recommendation", "ranks");
  rel("FeatureFlag", "AuditLog", "changes logged");
  rel("BackgroundJob", "AIUsageEvent", "observed");

  const cross = [
    ["User", "Document", "owns"],
    ["User", "QuestionSet", "authors"],
    ["Document", "QuestionSet", "source"],
    ["QuestionSetItem", "BankQuestion", "promote"],
    ["DocumentChunk", "KnowledgeComponent", "evidence"],
    ["User", "LearnerProfile", "has"],
    ["Message", "AIUsageEvent", "records"],
  ];
  cross.forEach(([a, z, label], i) => {
    const A = boxes[a];
    const B = boxes[z];
    const y = 1860 + i * 95;
    b += pathEl(
      `M${A.x + A.w},${A.y + A.h / 2} H${A.x + A.w + 30 + i * 8} V${y} H${B.x - 30 - i * 8} V${B.y + B.h / 2} H${B.x}`,
      { stroke: i % 2 ? C.blue : C.purple, sw: 2, dash: "8 7", arrow: true },
    );
    b += rect(1540, y - 28, 410, 46, {
      fill: C.white,
      stroke: C.line,
      sw: 1,
      rx: 10,
    });
    b += text(1745, y + 3, `${a} → ${z}: ${label}`, {
      size: 17,
      anchor: "middle",
      fill: C.muted,
    });
  });
  b += rect(80, 2580, 3740, 90, { fill: C.white, stroke: C.line, sw: 2, rx: 14 });
  b += text(120, 2620, "Ký hiệu:", { size: 19, weight: 700, fill: C.navy });
  b += text(235, 2620, "•— composition; đường liền là quan hệ nội miền; đường đứt là quan hệ xuyên miền.", {
    size: 18,
    fill: C.muted,
  });
  b += text(120, 2650, "Sơ đồ tập trung vào lớp miền; DTO, controller và lớp hạ tầng được lược bỏ để giữ khả năng đọc.", {
    size: 18,
    fill: C.muted,
  });
  return { name: "class-diagram", svg: svgDoc(W, H, b, "Class Diagram EzEdu AI") };
}

function entity(x, y, w, name, rows, color = C.blue) {
  const rowH = 29;
  const h = 48 + rows.length * rowH + 16;
  let s = rect(x, y, w, h, { fill: C.white, stroke: color, sw: 2.5, rx: 6 });
  s += rect(x, y, w, 48, { fill: color, stroke: color, sw: 0, rx: 6 });
  s += text(x + 14, y + 32, name, { size: 18, weight: 700, fill: C.white });
  rows.forEach((r, i) => {
    const parts = r.split("|");
    const key = parts[0];
    const field = parts.slice(1).join("|");
    const yy = y + 76 + i * rowH;
    if (key) {
      s += text(x + 14, yy, key, {
        size: 15,
        weight: 700,
        fill: key.includes("PK") ? C.red : C.purple,
      });
    }
    s += text(x + 72, yy, field, { size: 15, fill: C.ink });
  });
  return { svg: s, x, y, w, h };
}

function buildERD() {
  const W = 4800;
  const H = 3300;
  let b = titleBlock(
    "ENTITY–RELATIONSHIP DIAGRAM – MÔ HÌNH LOGIC CASE STUDIO 2",
    "Bản rút gọn có chủ đích; DDL đi kèm chứa đầy đủ 49 bảng và 94 tham chiếu khóa ngoại",
    W,
  );
  const groupDefs = [
    [70, 210, 1110, 800, "01 · Identity & Classroom", C.blue2, C.blue],
    [1220, 210, 1520, 1030, "02 · Documents, RAG & Verification", C.greenBg, C.green],
    [2780, 210, 950, 1030, "03 · Practice", C.amberBg, C.amber],
    [3770, 210, 960, 1340, "04 · Exam Bank", "#FFF0E5", "#C45B21"],
    [70, 1060, 1110, 1060, "05 · Conversation & Sources", C.blue2, C.blue],
    [1220, 1290, 2510, 1280, "06 · Knowledge & Personalization", C.purpleBg, C.purple],
    [3770, 1600, 960, 970, "07 · Administration & Ops", C.redBg, C.red],
  ];
  groupDefs.forEach(([x, y, w, h, label, fill, stroke]) => {
    b += packageBox(x, y, w, h, label, fill);
  });

  const e = {};
  function add(name, x, y, w, rows, color) {
    e[name] = entity(x, y, w, name, rows, color);
    b += e[name].svg;
  }

  add("users", 120, 300, 300, ["PK|id", "UK|email", "|role", "|status"], C.blue);
  add("classes", 480, 300, 300, ["PK|id", "FK|owner_id", "|name", "UK|invite_code"], C.blue);
  add("class_students", 840, 300, 290, ["PK/FK|class_id", "PK/FK|student_id", "|joined_at"], C.blue);
  add("user_activity_logs", 120, 610, 300, ["PK|id", "FK|user_id", "|action", "|created_at"], C.blue);
  add("admin_audit_logs", 480, 610, 300, ["PK|id", "FK|admin_user_id", "|action", "|resource"], C.blue);

  add("documents", 1270, 300, 320, ["PK|id", "FK|user_id", "|title", "|processing_status"], C.green);
  add("document_contents", 1650, 300, 320, ["PK|id", "FK|document_id", "|normalized_text"], C.green);
  add("document_chunks", 2030, 300, 310, ["PK|id", "FK|document_id", "|chunk_index", "|vector_id"], C.green);
  add("verification_sessions", 1270, 650, 340, ["PK|id", "FK|document_id", "FK|user_id", "|quality_score"], C.green);
  add("verification_issues", 1670, 650, 330, ["PK|id", "FK|session_id", "|severity", "|category"], C.green);
  add("web_knowledge_sources", 2060, 650, 330, ["PK|id", "FK|owner_id", "|url", "|review_status"], C.green);
  add("curriculum_kb_sources", 2390, 950, 300, ["PK|id", "FK|web_source_id", "FK|subject_id"], C.green);

  add("question_sets", 2830, 300, 330, ["PK|id", "FK|document_id", "FK|user_id", "|status"], C.amber);
  add("question_set_items", 3220, 300, 330, ["PK|id", "FK|question_set_id", "|question_type"], C.amber);
  add("question_attempts", 2830, 650, 330, ["PK|id", "FK|question_set_id", "FK|user_id", "|score"], C.amber);
  add("question_attempt_answers", 3220, 650, 350, ["PK|id", "FK|attempt_id", "|is_correct"], C.amber);
  add("question_set_target_classes", 3000, 930, 390, ["PK/FK|question_set_id", "PK/FK|class_id"], C.amber);

  add("curriculum_taxonomy", 3820, 300, 330, ["PK|id", "FK|parent_id", "|level", "|code"], "#C45B21");
  add("question_bank", 4210, 300, 330, ["PK|id", "FK|topic_id", "FK|owner_id", "|difficulty"], "#C45B21");
  add("exam_blueprints", 3820, 650, 330, ["PK|id", "FK|subject_id", "FK|owner_id", "|total_questions"], "#C45B21");
  add("exams", 4210, 650, 330, ["PK|id", "FK|blueprint_id", "|status"], "#C45B21");
  add("exam_questions", 3820, 980, 330, ["PK/FK|exam_id", "PK/FK|question_id", "|position"], "#C45B21");
  add("exam_attempts", 4210, 980, 330, ["PK|id", "FK|exam_id", "FK|student_id", "|score"], "#C45B21");
  add("exam_attempt_results", 4010, 1280, 360, ["PK|id", "FK|attempt_id", "FK|question_id", "|is_correct"], "#C45B21");

  add("conversations", 120, 1150, 320, ["PK|id", "FK|user_id", "|title", "|scope"], C.blue);
  add("conversation_messages", 500, 1150, 350, ["PK|id", "FK|conversation_id", "FK|user_id", "|role"], C.blue);
  add("conversation_documents", 120, 1510, 350, ["PK/FK|conversation_id", "PK/FK|document_id"], C.blue);
  add("ai_answer_feedback", 530, 1510, 320, ["PK|id", "FK|message_id", "FK|user_id", "|rating"], C.blue);
  add("ai_usage_events", 120, 1810, 320, ["PK|id", "FK|user_id", "|provider", "|total_tokens"], C.blue);

  add("knowledge_components", 1270, 1380, 350, ["PK|id", "FK|parent_id", "|code", "|name"], C.purple);
  add("knowledge_graph_edges", 1680, 1380, 380, ["PK|id", "FK|source_kc_id", "FK|target_kc_id", "|relation_type"], C.purple);
  add("learning_items", 2120, 1380, 340, ["PK|id", "FK|document_id", "FK|primary_kc_id", "|item_type"], C.purple);
  add("learning_item_components", 2520, 1380, 390, ["PK/FK|item_id", "PK/FK|knowledge_component_id"], C.purple);
  add("learning_sessions", 2970, 1380, 330, ["PK|id", "FK|user_id", "|started_at"], C.purple);
  add("learning_events", 3360, 1380, 320, ["PK|id", "FK|user_id", "FK|item_id", "|event_type"], C.purple);
  add("learner_profiles", 1270, 1810, 350, ["PK|id", "UK/FK|user_id", "|level", "|learning_style"], C.purple);
  add("learner_knowledge_states", 1680, 1810, 390, ["PK|id", "FK|user_id", "FK|knowledge_component_id", "|mastery_probability"], C.purple);
  add("recommendation_logs", 2130, 1810, 350, ["PK|id", "FK|user_id", "FK|item_id", "|score"], C.purple);
  add("cluster_models", 2540, 1810, 320, ["PK|id", "|version", "|status"], C.purple);
  add("bandit_policies", 2920, 1810, 320, ["PK|id", "|policy_key", "|status"], C.purple);
  add("knowledge_graph_edges · evidence", 3300, 1810, 360, ["FK|document_id", "FK|created_by", "|weight"], C.purple);

  add("website_content", 3820, 1690, 330, ["PK|id", "UK|content_key", "FK|updated_by"], C.red);
  add("system_settings", 4210, 1690, 330, ["PK|id", "UK|setting_key", "FK|updated_by"], C.red);
  add("feature_flags", 3820, 2010, 330, ["PK|id", "UK|flag_key", "|enabled"], C.red);
  add("background_jobs", 4210, 2010, 330, ["PK|id", "|job_type", "|status", "|attempts"], C.red);
  add("admin_notifications", 4010, 2320, 360, ["PK|id", "FK|created_by", "|severity"], C.red);

  function edge(a, z, label = "", color = C.line) {
    const A = e[a];
    const Z = e[z];
    if (!A || !Z) return;
    const ax = A.x + A.w;
    const ay = A.y + A.h / 2;
    const zx = Z.x;
    const zy = Z.y + Z.h / 2;
    const mx = (ax + zx) / 2;
    b += pathEl(`M${ax},${ay} H${mx} V${zy} H${zx}`, {
      stroke: color,
      sw: 2.4,
      arrow: true,
    });
    if (label) {
      b += text(mx + 6, (ay + zy) / 2 - 7, label, {
        size: 14,
        fill: C.muted,
      });
    }
  }
  [
    ["users", "classes", "1:N"],
    ["classes", "class_students", "1:N"],
    ["documents", "document_contents", "1:0..1"],
    ["document_contents", "document_chunks", "1:N"],
    ["documents", "verification_sessions", "1:N"],
    ["verification_sessions", "verification_issues", "1:N"],
    ["question_sets", "question_set_items", "1:N"],
    ["question_sets", "question_attempts", "1:N"],
    ["question_attempts", "question_attempt_answers", "1:N"],
    ["curriculum_taxonomy", "question_bank", "1:N"],
    ["exam_blueprints", "exams", "1:N"],
    ["exam_questions", "exam_attempts", ""],
    ["conversations", "conversation_messages", "1:N"],
    ["conversations", "conversation_documents", "1:N"],
    ["conversation_documents", "ai_answer_feedback", ""],
    ["knowledge_components", "knowledge_graph_edges", "1:N"],
    ["knowledge_graph_edges", "learning_items", ""],
    ["learning_items", "learning_item_components", "1:N"],
    ["learning_item_components", "learning_sessions", ""],
    ["learning_sessions", "learning_events", "1:N"],
    ["learner_profiles", "learner_knowledge_states", "1:N"],
    ["learner_knowledge_states", "recommendation_logs", "feeds"],
    ["recommendation_logs", "cluster_models", "trains"],
    ["cluster_models", "bandit_policies", "selects"],
    ["website_content", "system_settings", ""],
    ["feature_flags", "background_jobs", "controls"],
  ].forEach(([a, z, label]) => edge(a, z, label));

  const crossY = [2680, 2750, 2820, 2890, 2960, 3030];
  const crossLabels = [
    "users → documents / conversations / attempts / profiles (quyền sở hữu)",
    "documents → question_sets / learning_items / knowledge_graph_edges (nguồn học liệu)",
    "question_set_items → question_bank (quy trình promote có kiểm duyệt)",
    "classes ↔ question_sets / exams (bảng target liên kết nhiều–nhiều)",
    "users → admin_audit_logs / ai_usage_events (truy vết vận hành)",
    "curriculum_taxonomy → curriculum_kb_sources / blueprints / question_bank",
  ];
  b += rect(70, 2630, 4660, 490, { fill: C.white, stroke: C.line, sw: 2, rx: 16 });
  b += text(110, 2670, "LIÊN KẾT XUYÊN MIỀN QUAN TRỌNG", { size: 21, weight: 700, fill: C.navy });
  crossLabels.forEach((label, i) => {
    b += `<circle cx="130" cy="${crossY[i]}" r="7" fill="${i % 2 ? C.purple : C.blue}"/>`;
    b += text(155, crossY[i] + 6, label, { size: 18, fill: C.ink });
  });
  b += text(2460, 2700, "PHẠM VI DDL CASE STUDIO 2", {
    size: 21,
    weight: 700,
    fill: C.navy,
  });
  b += text(2460, 2745, "49 bảng · 94 khóa ngoại · MySQL/InnoDB", {
    size: 22,
    weight: 700,
    fill: C.green,
  });
  b += text(2460, 2790, "ObjectId → VARCHAR(24); object/mảng quan trọng → bảng con hoặc bảng nối.", {
    size: 18,
    fill: C.muted,
  });
  b += text(2460, 2830, "MongoDB + ChromaDB vẫn là kiến trúc chạy thật; ERD này là phép chiếu logic để phân tích.", {
    size: 18,
    fill: C.muted,
  });
  b += text(2460, 2870, "Nguồn đầy đủ: case-studio2/ezedu_logical_model_mysql.sql", {
    size: 18,
    fill: C.muted,
  });
  return { name: "erd-diagram", svg: svgDoc(W, H, b, "ERD EzEdu AI") };
}

async function writeDiagram(diagram) {
  const svgPath = path.join(out, `${diagram.name}.svg`);
  const pngPath = path.join(out, `${diagram.name}.png`);
  fs.writeFileSync(svgPath, diagram.svg, "utf8");
  const image = sharp(Buffer.from(diagram.svg));
  const metadata = await image.metadata();
  await image
    .resize({
      width: Math.round(metadata.width * 1.25),
      height: Math.round(metadata.height * 1.25),
      fit: "fill",
    })
    .png({ compressionLevel: 9 })
    .toFile(pngPath);
  console.log(`${diagram.name}: SVG + PNG`);
}

async function main() {
  const diagrams = [
    buildUseCase(),
    buildActivity(),
    buildSequence(),
    buildClass(),
    buildERD(),
  ];
  for (const diagram of diagrams) await writeDiagram(diagram);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
