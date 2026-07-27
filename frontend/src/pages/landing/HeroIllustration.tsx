/**
 * HeroIllustration
 *
 * Minh họa pipeline EzEdu AI hoàn toàn bằng HTML/CSS/SVG + Lucide icons.
 * Không dùng ảnh stock, không sao chép từ Mapify hoặc website khác.
 *
 * Pipeline gồm 3 giai đoạn:
 *  [1] Tài liệu đầu vào  →  [2] Hệ thống xử lý  →  [3] Bộ câu hỏi
 *
 * Bố cục:
 * - Dạng card nằm ngang, nối bằng SVG arrow animated
 * - Mỗi card có nền frosted glass nhạt, border và shadow tinh tế
 * - Toàn bộ khối đặt trong hero bên dưới feature chips
 */
import { FileText, Film, Brain, CheckCircle2, HelpCircle } from 'lucide-react';

// ─── Topic grouping visual (SVG thuần) ────────────────────────────────────────
function TopicGroupingVisual() {
  // 3 nhóm điểm minh họa quá trình nhận diện chủ đề trong học liệu.
  const clusters = [
    { color: '#818cf8', cx: 28, cy: 22, r: 4 },
    { color: '#818cf8', cx: 36, cy: 14, r: 3.5 },
    { color: '#818cf8', cx: 20, cy: 30, r: 3 },
    { color: '#818cf8', cx: 32, cy: 32, r: 3 },

    { color: '#34d399', cx: 64, cy: 20, r: 4 },
    { color: '#34d399', cx: 72, cy: 28, r: 3.5 },
    { color: '#34d399', cx: 58, cy: 30, r: 3 },
    { color: '#34d399', cx: 68, cy: 36, r: 3 },

    { color: '#f472b6', cx: 46, cy: 52, r: 4 },
    { color: '#f472b6', cx: 54, cy: 60, r: 3.5 },
    { color: '#f472b6', cx: 40, cy: 60, r: 3 },
    { color: '#f472b6', cx: 52, cy: 46, r: 3 },
  ];

  // Centroid markers
  const centroids = [
    { color: '#4f46e5', cx: 29, cy: 24, label: 'K1' },
    { color: '#059669', cx: 66, cy: 28, label: 'K2' },
    { color: '#db2777', cx: 48, cy: 55, label: 'K3' },
  ];

  return (
    <svg
      width="92"
      height="80"
      viewBox="0 0 92 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Minh họa nhận diện chủ đề học liệu"
      role="img"
    >
      {/* Grid lines */}
      {[20, 40, 60].map(x => (
        <line key={`vl-${x}`} x1={x} y1="0" x2={x} y2="80"
          stroke="rgba(91,78,248,0.08)" strokeWidth="0.5" />
      ))}
      {[20, 40, 60].map(y => (
        <line key={`hl-${y}`} x1="0" y1={y} x2="92" y2={y}
          stroke="rgba(91,78,248,0.08)" strokeWidth="0.5" />
      ))}

      {/* Cluster data points */}
      {clusters.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.r}
          fill={d.color} fillOpacity="0.75" />
      ))}

      {/* Centroid markers (cross/star) */}
      {centroids.map(c => (
        <g key={c.label}>
          <circle cx={c.cx} cy={c.cy} r="5" fill={c.color} fillOpacity="0.18"
            stroke={c.color} strokeWidth="1.5" />
          <line x1={c.cx - 3} y1={c.cy} x2={c.cx + 3} y2={c.cy}
            stroke={c.color} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={c.cx} y1={c.cy - 3} x2={c.cx} y2={c.cy + 3}
            stroke={c.color} strokeWidth="1.5" strokeLinecap="round" />
          <text x={c.cx + 6} y={c.cy + 4} fontSize="8" fill={c.color} fontWeight="700">
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Pipeline arrow connector ──────────────────────────────────────────────────
function FlowArrow() {
  return (
    <div className="lp-illus-arrow" aria-hidden="true">
      <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
        <defs>
          <linearGradient id="arrowGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        {/* Dashed animated line */}
        <line x1="0" y1="12" x2="28" y2="12"
          stroke="url(#arrowGrad)" strokeWidth="2"
          strokeDasharray="5 3"
          className="lp-illus-arrow-line" />
        {/* Arrowhead */}
        <polyline points="23,7 32,12 23,17"
          fill="none" stroke="url(#arrowGrad)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function HeroIllustration() {
  return (
    <div
      className="lp-illus-root"
      aria-label="Minh họa pipeline xử lý học liệu EzEdu AI"
      role="img"
    >
      {/* ── GIAI ĐOẠN 1: Tài liệu đầu vào ────────────────────── */}
      <div className="lp-illus-card lp-illus-card--input">
        <div className="lp-illus-card-badge lp-illus-badge-blue">
          <span>01</span> Đầu vào
        </div>

        {/* Stacked document visual */}
        <div className="lp-illus-doc-stack" aria-hidden="true">
          <div className="lp-illus-doc lp-illus-doc-3">
            <div className="lp-illus-doc-fold" />
          </div>
          <div className="lp-illus-doc lp-illus-doc-2">
            <div className="lp-illus-doc-fold" />
          </div>
          <div className="lp-illus-doc lp-illus-doc-1">
            <div className="lp-illus-doc-fold" />
            <div className="lp-illus-doc-lines">
              <span /><span /><span />
            </div>
          </div>
        </div>

        {/* File types */}
        <div className="lp-illus-file-types">
          <span className="lp-illus-file-tag">
            <FileText size={11} strokeWidth={2} aria-hidden="true" /> PDF
          </span>
          <span className="lp-illus-file-tag">
            <FileText size={11} strokeWidth={2} aria-hidden="true" /> DOCX
          </span>
          <span className="lp-illus-file-tag">
            <Film size={11} strokeWidth={2} aria-hidden="true" /> Video
          </span>
        </div>

        <p className="lp-illus-card-label">Học liệu</p>
      </div>

      <FlowArrow />

      {/* ── GIAI ĐOẠN 2: AI Xử lý ────────────────────────────── */}
      <div className="lp-illus-card lp-illus-card--ai">
        <div className="lp-illus-card-badge lp-illus-badge-purple">
          <span>02</span> Xử lý AI
        </div>

        {/* AI icon + topic grouping visual */}
        <div className="lp-illus-ai-core" aria-hidden="true">
          <div className="lp-illus-ai-ring">
            <div className="lp-illus-ai-icon">
              <Brain size={22} strokeWidth={1.8} aria-hidden="true" />
            </div>
          </div>
          <div className="lp-illus-kmeans">
            <TopicGroupingVisual />
          </div>
        </div>

        {/* Process tags */}
        <div className="lp-illus-process-tags">
          <span className="lp-illus-proc-tag">Tóm tắt</span>
          <span className="lp-illus-proc-tag">Chủ đề</span>
          <span className="lp-illus-proc-tag">Câu hỏi</span>
        </div>

        <p className="lp-illus-card-label">Phân tích & Sinh câu hỏi</p>
      </div>

      <FlowArrow />

      {/* ── GIAI ĐOẠN 3: Bộ câu hỏi đầu ra ─────────────────── */}
      <div className="lp-illus-card lp-illus-card--output">
        <div className="lp-illus-card-badge lp-illus-badge-green">
          <span>03</span> Kết quả
        </div>

        {/* Mini question preview */}
        <div className="lp-illus-q-preview" aria-hidden="true">
          <div className="lp-illus-q-head">
            <HelpCircle size={13} strokeWidth={2} aria-hidden="true" />
            <span>Câu 1 · Mức: Hiểu</span>
          </div>
          <p className="lp-illus-q-text">
            Nội dung chính của đoạn học liệu là gì?
          </p>
          <div className="lp-illus-q-options">
            <div className="lp-illus-q-opt lp-illus-q-opt-correct">
              <CheckCircle2 size={10} strokeWidth={2.5} aria-hidden="true" />
              <span>A. Xác định ý chính và chủ đề liên quan</span>
            </div>
            <div className="lp-illus-q-opt">
              <span className="lp-illus-q-opt-letter">B.</span>
              <span>Chọn ngẫu nhiên một câu trong tài liệu</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="lp-illus-stats">
          <div className="lp-illus-stat">
            <span className="lp-illus-stat-num">10</span>
            <span className="lp-illus-stat-lbl">câu hỏi</span>
          </div>
          <div className="lp-illus-stat-sep" />
          <div className="lp-illus-stat">
            <span className="lp-illus-stat-num">6</span>
            <span className="lp-illus-stat-lbl">mức độ</span>
          </div>
          <div className="lp-illus-stat-sep" />
          <div className="lp-illus-stat">
            <span className="lp-illus-stat-num">✓</span>
            <span className="lp-illus-stat-lbl">Đáp án</span>
          </div>
        </div>

        <p className="lp-illus-card-label">Đề kiểm tra AI</p>
      </div>
    </div>
  );
}
