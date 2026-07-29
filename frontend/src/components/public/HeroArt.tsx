/**
 * Minh hoạ hero của EzEdu AI — SVG tự dựng, không dùng tài sản bên ngoài.
 *
 * Diễn đạt đúng ba bước nghiệp vụ thật của hệ thống:
 *   học liệu vào  ->  AI phân tích  ->  câu hỏi / tóm tắt / hỏi đáp ra
 *
 * Toàn bộ màu lấy từ token qua currentColor và biến CSS, nên hình tự đổi theo
 * chế độ sáng/tối mà không cần hai phiên bản ảnh.
 */
export default function HeroArt() {
  return (
    <svg
      className="ezp-hero-art"
      viewBox="0 0 520 400"
      role="img"
      aria-labelledby="hero-art-title hero-art-desc"
    >
      <title id="hero-art-title">Sơ đồ quy trình xử lý học liệu của EzEdu AI</title>
      <desc id="hero-art-desc">
        Học liệu dạng tài liệu và video được đưa vào hệ thống, AI đọc và lập chỉ mục nội dung,
        sau đó tạo ra bộ câu hỏi, phần tóm tắt và khả năng hỏi đáp theo học liệu.
      </desc>

      {/* ── Cột 1: học liệu đưa vào ── */}
      <g>
        <text
          x="16"
          y="30"
          fill="var(--ez-text-muted)"
          fontSize="11"
          fontWeight="600"
          letterSpacing="1.2"
        >
          HỌC LIỆU
        </text>

        {/* Tài liệu */}
        <rect
          x="16"
          y="46"
          width="118"
          height="74"
          rx="10"
          fill="var(--ez-surface)"
          stroke="var(--ez-border-strong)"
          strokeWidth="1.5"
        />
        <rect x="30" y="62" width="56" height="7" rx="3.5" fill="var(--ez-primary)" />
        <rect x="30" y="78" width="90" height="6" rx="3" fill="var(--ez-border-strong)" />
        <rect x="30" y="90" width="76" height="6" rx="3" fill="var(--ez-border-strong)" />
        <rect x="30" y="102" width="84" height="6" rx="3" fill="var(--ez-border-strong)" />

        {/* Video */}
        <rect
          x="16"
          y="136"
          width="118"
          height="74"
          rx="10"
          fill="var(--ez-surface)"
          stroke="var(--ez-border-strong)"
          strokeWidth="1.5"
        />
        <rect x="30" y="150" width="90" height="38" rx="6" fill="var(--ez-neutral-200)" />
        <path d="M66 160 L82 169 L66 178 Z" fill="var(--ez-primary)" />
        <rect x="30" y="194" width="60" height="6" rx="3" fill="var(--ez-border-strong)" />

        {/* Bài giảng */}
        <rect
          x="16"
          y="226"
          width="118"
          height="58"
          rx="10"
          fill="var(--ez-surface)"
          stroke="var(--ez-border-strong)"
          strokeWidth="1.5"
        />
        <rect x="30" y="242" width="48" height="7" rx="3.5" fill="var(--ez-secondary)" />
        <rect x="30" y="258" width="88" height="6" rx="3" fill="var(--ez-border-strong)" />
      </g>

      {/* ── Mũi tên vào lõi AI ── */}
      <g stroke="var(--ez-border-strong)" strokeWidth="1.5" fill="none" strokeDasharray="4 4">
        <path d="M134 83 C 168 83, 172 150, 198 160" />
        <path d="M134 173 C 168 173, 176 172, 198 172" />
        <path d="M134 255 C 168 255, 172 196, 198 186" />
      </g>

      {/* ── Lõi AI ── */}
      <g>
        <rect
          x="198"
          y="120"
          width="124"
          height="104"
          rx="16"
          fill="var(--ez-primary)"
        />
        <text
          x="260"
          y="160"
          textAnchor="middle"
          fill="var(--ez-text-on-brand)"
          fontSize="13"
          fontWeight="700"
        >
          EzEdu AI
        </text>
        <text
          x="260"
          y="180"
          textAnchor="middle"
          fill="var(--ez-indigo-100)"
          fontSize="10.5"
        >
          Đọc &amp; lập chỉ mục
        </text>
        <text
          x="260"
          y="196"
          textAnchor="middle"
          fill="var(--ez-indigo-100)"
          fontSize="10.5"
        >
          nội dung học liệu
        </text>

        {/* Ba điểm nhịp thể hiện việc xử lý — tĩnh, không animation trang trí */}
        <circle cx="243" cy="212" r="3" fill="var(--ez-indigo-200)" />
        <circle cx="260" cy="212" r="3" fill="var(--ez-indigo-200)" />
        <circle cx="277" cy="212" r="3" fill="var(--ez-indigo-200)" />
      </g>

      {/* ── Mũi tên ra kết quả ── */}
      <g stroke="var(--ez-primary-border)" strokeWidth="1.5" fill="none">
        <path d="M322 150 C 348 150, 352 86, 378 78" />
        <path d="M322 172 C 348 172, 352 172, 378 172" />
        <path d="M322 194 C 348 194, 352 258, 378 266" />
      </g>

      {/* ── Cột 3: kết quả ── */}
      <g>
        <text
          x="378"
          y="30"
          fill="var(--ez-text-muted)"
          fontSize="11"
          fontWeight="600"
          letterSpacing="1.2"
        >
          KẾT QUẢ
        </text>

        {/* Bộ câu hỏi */}
        <rect
          x="378"
          y="46"
          width="126"
          height="76"
          rx="10"
          fill="var(--ez-surface)"
          stroke="var(--ez-primary-border)"
          strokeWidth="1.5"
        />
        <text x="392" y="66" fill="var(--ez-text)" fontSize="11" fontWeight="700">
          Bộ câu hỏi
        </text>
        <circle cx="396" cy="82" r="4.5" fill="none" stroke="var(--ez-secondary)" strokeWidth="1.5" />
        <path d="M394 82 L396 84 L399 80" stroke="var(--ez-secondary)" strokeWidth="1.5" fill="none" />
        <rect x="407" y="78" width="80" height="6" rx="3" fill="var(--ez-border-strong)" />
        <circle cx="396" cy="100" r="4.5" fill="none" stroke="var(--ez-border-strong)" strokeWidth="1.5" />
        <rect x="407" y="96" width="62" height="6" rx="3" fill="var(--ez-border-strong)" />

        {/* Tóm tắt */}
        <rect
          x="378"
          y="140"
          width="126"
          height="64"
          rx="10"
          fill="var(--ez-surface)"
          stroke="var(--ez-primary-border)"
          strokeWidth="1.5"
        />
        <text x="392" y="160" fill="var(--ez-text)" fontSize="11" fontWeight="700">
          Tóm tắt nội dung
        </text>
        <rect x="392" y="170" width="96" height="6" rx="3" fill="var(--ez-border-strong)" />
        <rect x="392" y="182" width="72" height="6" rx="3" fill="var(--ez-border-strong)" />

        {/* Hỏi đáp có nguồn */}
        <rect
          x="378"
          y="222"
          width="126"
          height="82"
          rx="10"
          fill="var(--ez-surface)"
          stroke="var(--ez-primary-border)"
          strokeWidth="1.5"
        />
        <text x="392" y="242" fill="var(--ez-text)" fontSize="11" fontWeight="700">
          Hỏi đáp có nguồn
        </text>
        <rect x="392" y="252" width="60" height="16" rx="8" fill="var(--ez-surface-muted)" />
        <rect x="426" y="274" width="62" height="16" rx="8" fill="var(--ez-primary-subtle)" />
        <rect x="392" y="296" width="44" height="5" rx="2.5" fill="var(--ez-secondary)" />
      </g>

      {/* ── Ghi chú kiểm chứng: đúng với nghiệp vụ verification đã có ── */}
      <g>
        <rect
          x="198"
          y="300"
          width="124"
          height="46"
          rx="10"
          fill="var(--ez-secondary-subtle)"
          stroke="var(--ez-secondary-border)"
          strokeWidth="1.5"
        />
        <text
          x="260"
          y="320"
          textAnchor="middle"
          fill="var(--ez-secondary-text)"
          fontSize="10.5"
          fontWeight="700"
        >
          Kiểm chứng
        </text>
        <text
          x="260"
          y="335"
          textAnchor="middle"
          fill="var(--ez-secondary-text)"
          fontSize="9.5"
        >
          đối chiếu học liệu gốc
        </text>
      </g>
      <path
        d="M260 300 L260 232"
        stroke="var(--ez-secondary-border)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        fill="none"
      />
    </svg>
  );
}
