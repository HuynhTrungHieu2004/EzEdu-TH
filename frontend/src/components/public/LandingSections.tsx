import { useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpenCheck,
  Check,
  ChevronDown,
  ClipboardList,
  FileSearch,
  FileText,
  GraduationCap,
  History,
  Info,
  Lock,
  MessageSquareQuote,
  Presentation,
  Quote,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  Users,
} from 'lucide-react';
import { Alert, Button } from '../ui';
import { useAuth } from '../../hooks/useAuth';
import SparkleStar from './SparkleStar';
import CharacterIllustration from './CharacterIllustration';
import { toolsForRole } from '../../data/toolRegistry';
import type { HeroContent } from '../../types/websiteContent';

/* ═══════════════════════════════════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════
   AI CHO GIÁO VIÊN — công cụ thật, lấy từ toolRegistry
   ═══════════════════════════════════════════════════════════════════════ */

export function TeacherToolsShowcase() {
  const tools = toolsForRole('teacher').slice(0, 6);

  return (
    <section className="ezp-section" aria-labelledby="teacher-tools-title">
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

/* ═══════════════════════════════════════════════════════════════════════
   CÔNG CỤ CHÍNH — tải học liệu
   ═══════════════════════════════════════════════════════════════════════ */

const DOC_EXT = ['pdf', 'docx', 'pptx'];
const VIDEO_EXT = ['mp4', 'mov', 'webm', 'mkv'];
const DOC_MAX_MB = 20;
const VIDEO_MAX_MB = 100;

type ToolState =
  | { kind: 'idle' }
  | { kind: 'needAccount'; fileName: string }
  | { kind: 'studentInfo' }
  | { kind: 'error'; message: string };

function validateFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const sizeMb = file.size / (1024 * 1024);

  if (DOC_EXT.includes(ext)) {
    if (sizeMb > DOC_MAX_MB) {
      return `Tài liệu vượt quá ${DOC_MAX_MB}MB. Hãy tách nhỏ tệp rồi thử lại.`;
    }
    return null;
  }
  if (VIDEO_EXT.includes(ext)) {
    if (sizeMb > VIDEO_MAX_MB) {
      return `Video vượt quá ${VIDEO_MAX_MB}MB. Hãy nén lại hoặc cắt ngắn rồi thử lại.`;
    }
    return null;
  }
  return `Chưa hỗ trợ định dạng .${ext || 'này'}. Hãy dùng PDF, DOCX, PPTX hoặc MP4, MOV, WEBM, MKV.`;
}

/**
 * Khu vực tác vụ chính ngay dưới hero.
 *
 * Khách chưa đăng nhập vẫn chọn được tệp và nhận phản hồi thật (kiểm tra định
 * dạng, kiểm tra dung lượng), nhưng được nói rõ rằng cần tài khoản để hệ thống
 * xử lý — không giả lập tiến trình, không giả lập kết quả.
 */
export function PrimaryTool() {
  const navigate = useNavigate();
  const { status, area } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<ToolState>({ kind: 'idle' });

  function handleFile(file: File | undefined) {
    if (!file) return;

    const error = validateFile(file);
    if (error) {
      setState({ kind: 'error', message: error });
      return;
    }

    // Giáo viên: đưa thẳng sang trang học liệu thật để tải lên.
    if (status === 'authenticated' && area === 'teacher') {
      navigate('/documents');
      return;
    }
    // Học sinh: tải học liệu là việc của giáo viên.
    if (status === 'authenticated' && area === 'student') {
      setState({ kind: 'studentInfo' });
      return;
    }
    if (status === 'authenticated' && area === 'admin') {
      navigate('/admin/documents');
      return;
    }
    setState({ kind: 'needAccount', fileName: file.name });
  }

  return (
    <section className="ezp-section ezp-section-alt" aria-labelledby="cong-cu-title" id="cong-cu">
      <div className="ezp-container">
        <div className="ezp-head ezp-head-center">
          <span className="ezp-eyebrow">Bắt đầu ngay</span>
          <h2 className="ezp-title" id="cong-cu-title">
            Đưa học liệu vào và chọn việc cần làm
          </h2>
          <p className="ezp-lede">
            Hệ thống đọc nội dung tài liệu, chuyển lời video thành văn bản, rồi lập chỉ mục để
            phục vụ sinh câu hỏi và hỏi đáp theo đúng học liệu của bạn.
          </p>
        </div>

        <div className="ezp-tool">
          <input
            ref={inputRef}
            type="file"
            className="ez-sr-only"
            aria-label="Chọn học liệu để kiểm tra"
            accept={[...DOC_EXT, ...VIDEO_EXT].map((e) => `.${e}`).join(',')}
            onChange={(event) => handleFile(event.target.files?.[0])}
          />

          <button
            type="button"
            className="ezp-dropzone"
            data-dragging={dragging ? 'true' : undefined}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFile(event.dataTransfer.files?.[0]);
            }}
          >
            <span className="ezp-dropzone-icon" aria-hidden="true">
              <UploadCloud size={26} />
            </span>
            <span className="ezp-dropzone-title">
              {dragging ? 'Thả tệp vào đây' : 'Chọn tệp hoặc kéo thả vào đây'}
            </span>
            <span className="ezp-dropzone-hint">
              Tài liệu PDF, DOCX, PPTX tối đa {DOC_MAX_MB}MB. Video MP4, MOV, WEBM, MKV tối đa{' '}
              {VIDEO_MAX_MB}MB.
            </span>
          </button>

          <div className="ezp-tool-meta">
            <span className="ezp-tool-meta-item">
              <FileText size={14} aria-hidden="true" />
              Tài liệu và bài giảng
            </span>
            <span className="ezp-tool-meta-item">
              <Presentation size={14} aria-hidden="true" />
              Video có chuyển lời
            </span>
            <span className="ezp-tool-meta-item">
              <Lock size={14} aria-hidden="true" />
              Học liệu chỉ hiển thị trong tài khoản của bạn
            </span>
          </div>

          {state.kind === 'error' && (
            <Alert tone="error" style={{ marginTop: 'var(--ez-space-5)' }}>
              {state.message}
            </Alert>
          )}

          {state.kind === 'needAccount' && (
            <Alert tone="info" title="Cần tài khoản để xử lý học liệu" style={{ marginTop: 'var(--ez-space-5)' }}>
              <p>
                Tệp <strong>{state.fileName}</strong> hợp lệ nhưng chưa được tải lên. EzEdu AI cần
                một tài khoản để lưu học liệu và trả kết quả về đúng nơi cho bạn.
              </p>
              <div className="ez-alert-actions">
                <Link to="/register">
                  <Button size="sm">Tạo tài khoản miễn phí</Button>
                </Link>
                <Link to="/login">
                  <Button size="sm" variant="outline">
                    Tôi đã có tài khoản
                  </Button>
                </Link>
              </div>
            </Alert>
          )}

          {state.kind === 'studentInfo' && (
            <Alert tone="info" title="Học liệu do giáo viên tải lên" style={{ marginTop: 'var(--ez-space-5)' }}>
              <p>
                Với tài khoản học sinh, bạn không cần tải học liệu. Giáo viên tải học liệu và ban
                hành đề; bạn vào phần bài luyện tập để làm bài và hỏi đáp theo học liệu đó.
              </p>
              <div className="ez-alert-actions">
                <Link to="/published-questions">
                  <Button size="sm">Tới bài luyện tập</Button>
                </Link>
              </div>
            </Alert>
          )}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   VÍ DỤ NHANH
   ═══════════════════════════════════════════════════════════════════════ */

const EXAMPLES = [
  {
    tag: 'Lịch sử',
    title: 'Tạo câu hỏi từ một bài học lịch sử',
    desc: 'Chọn số câu, độ khó và dạng câu hỏi. Hệ thống sinh câu hỏi kèm đáp án và giải thích.',
    icon: <ClipboardList size={18} />,
  },
  {
    tag: 'Địa lí',
    title: 'Tóm tắt một chương địa lí',
    desc: 'Hệ thống đọc nội dung đã lập chỉ mục và trả lời theo phạm vi tài liệu bạn chọn.',
    icon: <FileText size={18} />,
  },
  {
    tag: 'Kiểm chứng',
    title: 'Tìm điểm kiến thức đáng ngờ trong tài liệu',
    desc: 'Chạy kiểm chứng để hệ thống đánh dấu các nội dung cần xem lại, rồi bạn xử lý từng điểm.',
    icon: <FileSearch size={18} />,
  },
  {
    tag: 'Ôn tập',
    title: 'Tạo đề ôn tập rồi ban hành cho lớp',
    desc: 'Rà soát từng câu, chỉnh sửa, ban hành cho học sinh và xuất ra DOCX hoặc PDF.',
    icon: <BookOpenCheck size={18} />,
  },
  {
    tag: 'Hỏi đáp',
    title: 'Hỏi đáp theo học liệu, có dẫn nguồn',
    desc: 'Mỗi câu trả lời kèm trích dẫn phần nội dung đã dùng, để bạn kiểm lại được ngay.',
    icon: <MessageSquareQuote size={18} />,
  },
];

export function QuickExamples() {
  const { status, homePath } = useAuth();
  const target = status === 'authenticated' ? homePath : '/register';

  return (
    <section className="ezp-section" aria-labelledby="vi-du-title" id="vi-du">
      <div className="ezp-container">
        <div className="ezp-head">
          <span className="ezp-eyebrow">Ví dụ</span>
          <h2 className="ezp-title" id="vi-du-title">
            Những việc bạn có thể làm với học liệu của mình
          </h2>
          <p className="ezp-lede">
            Mỗi ví dụ dưới đây tương ứng với một chức năng đang hoạt động trong hệ thống.
          </p>
        </div>

        <div className="ezp-grid ezp-grid-3">
          {EXAMPLES.map((item) => (
            <Link key={item.title} to={target} className="ezp-example">
              <span className="ezp-card-icon ezp-card-icon-secondary" aria-hidden="true">
                {item.icon}
              </span>
              <span className="ezp-example-tag">{item.tag}</span>
              <span className="ezp-example-title">{item.title}</span>
              <span className="ezp-example-desc">{item.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CÁCH HOẠT ĐỘNG — 4 bước
   ═══════════════════════════════════════════════════════════════════════ */

const STEPS = [
  {
    title: 'Tải học liệu lên',
    desc: 'Tài liệu PDF, DOCX, PPTX hoặc video bài giảng. Video được chuyển lời thành văn bản trước khi xử lý.',
  },
  {
    title: 'AI đọc và lập chỉ mục',
    desc: 'Nội dung được trích xuất, chia đoạn và lập chỉ mục để có thể tra cứu theo ngữ nghĩa, không chỉ theo từ khoá.',
  },
  {
    title: 'Chọn nội dung cần tạo',
    desc: 'Sinh bộ câu hỏi theo số lượng, độ khó và dạng câu hỏi bạn chọn; hoặc hỏi đáp trực tiếp trên học liệu.',
  },
  {
    title: 'Xem, chỉnh sửa và sử dụng',
    desc: 'Rà soát từng câu, sửa lại nếu cần, ban hành cho học sinh, hoặc xuất ra DOCX và PDF.',
  },
];

export function HowItWorks({ headingId = 'cach-hoat-dong-title' }: { headingId?: string }) {
  return (
    <section
      className="ezp-section ezp-section-alt"
      aria-labelledby={headingId}
      id="cach-hoat-dong"
    >
      <div className="ezp-container">
        <div className="ezp-head">
          <span className="ezp-eyebrow">Quy trình</span>
          <h2 className="ezp-title" id={headingId}>
            Bốn bước từ học liệu tới đề luyện tập
          </h2>
        </div>

        <ol className="ezp-steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="ezp-step">
              <span className="ezp-step-num" aria-hidden="true">
                {index + 1}
              </span>
              <h3 className="ezp-step-title">
                <span className="ez-sr-only">Bước {index + 1}: </span>
                {step.title}
              </h3>
              <p className="ezp-step-desc">{step.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   VÌ SAO EZEDU AI — chỉ nêu lợi ích hệ thống thực sự làm được
   ═══════════════════════════════════════════════════════════════════════ */

const BENEFITS = [
  {
    icon: <Sparkles size={18} />,
    title: 'Tiết kiệm thời gian soạn đề',
    desc: 'Từ một tài liệu có sẵn, hệ thống sinh bộ câu hỏi kèm đáp án và giải thích để bạn rà soát, thay vì viết lại từ đầu.',
  },
  {
    icon: <Quote size={18} />,
    title: 'Bám sát học liệu của bạn',
    desc: 'Câu hỏi và câu trả lời dựa trên nội dung bạn đã tải lên, kèm trích dẫn phần nội dung đã dùng.',
  },
  {
    icon: <FileSearch size={18} />,
    title: 'Kiểm chứng chất lượng kiến thức',
    desc: 'Chạy kiểm chứng để hệ thống đánh dấu những điểm cần xem lại, rồi xử lý hoặc áp dụng sửa đổi.',
  },
  {
    icon: <GraduationCap size={18} />,
    title: 'Hỗ trợ học sinh luyện tập',
    desc: 'Học sinh làm bài giáo viên ban hành, xem đáp án kèm giải thích và làm lại để củng cố.',
  },
  {
    icon: <History size={18} />,
    title: 'Theo dõi lịch sử và kết quả',
    desc: 'Mỗi lần làm bài được lưu lại, kèm điểm số và thời điểm, để nhìn được tiến bộ theo thời gian.',
  },
  {
    icon: <Target size={18} />,
    title: 'Cá nhân hoá theo điểm mạnh, điểm yếu',
    desc: 'Khi được quản trị viên bật, hệ thống gợi ý nội dung ôn tập dựa trên kết quả làm bài của từng học sinh.',
  },
];

export function WhyEzEdu() {
  return (
    <section className="ezp-section" aria-labelledby="vi-sao-title" id="vi-sao">
      <div className="ezp-container">
        <div className="ezp-head">
          <span className="ezp-eyebrow">Giá trị</span>
          <h2 className="ezp-title" id="vi-sao-title">
            Vì sao chọn EzEdu AI
          </h2>
        </div>

        <div className="ezp-grid ezp-grid-3">
          {BENEFITS.map((item) => (
            <article key={item.title} className="ezp-card">
              <span className="ezp-card-icon" aria-hidden="true">
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

/* ═══════════════════════════════════════════════════════════════════════
   TÍNH NĂNG THEO VAI TRÒ
   ═══════════════════════════════════════════════════════════════════════ */

const STUDENT_FEATURES = [
  'Làm bài luyện tập do giáo viên ban hành, xem đáp án kèm giải thích',
  'Hỏi đáp AI theo học liệu, mỗi câu trả lời có dẫn nguồn',
  'Xem lại lịch sử làm bài và điểm số từng lần',
  'Theo dõi tiến độ: số bài đã hoàn thành, điểm trung bình, kết quả cao nhất',
  'Nhận gợi ý ôn tập theo điểm mạnh và điểm yếu, khi tính năng được bật',
];

const TEACHER_FEATURES = [
  'Tải tài liệu và video bài giảng, hệ thống tự trích xuất và chuyển lời',
  'Sinh bộ câu hỏi theo số lượng, độ khó và dạng câu hỏi',
  'Rà soát, chỉnh sửa từng câu rồi ban hành cho học sinh',
  'Kiểm chứng chất lượng kiến thức trong học liệu',
  'Tra cứu nội dung theo ngữ nghĩa và hỏi đáp trên học liệu đã lập chỉ mục',
  'Xuất bộ câu hỏi ra DOCX hoặc PDF',
  'Tạo lớp và thêm học sinh để giao đề theo lớp',
];

export function FeaturesByRole() {
  return (
    <section className="ezp-section ezp-section-alt" aria-labelledby="vai-tro-title" id="tinh-nang">
      <div className="ezp-container">
        <div className="ezp-head">
          <span className="ezp-eyebrow">Theo vai trò</span>
          <h2 className="ezp-title" id="vai-tro-title">
            Mỗi vai trò có không gian làm việc riêng
          </h2>
          <p className="ezp-lede">
            Học sinh và giáo viên thấy đúng những gì mình cần. Công cụ quản lý không xuất hiện
            trong giao diện học tập.
          </p>
        </div>

        <div className="ezp-grid ezp-grid-2">
          <article className="ezp-role" id="hoc-sinh">
            <div className="ezp-role-head">
              <span className="ezp-card-icon" aria-hidden="true">
                <GraduationCap size={20} />
              </span>
              <h3 className="ezp-role-title">Dành cho học sinh</h3>
            </div>
            <ul className="ezp-role-list">
              {STUDENT_FEATURES.map((text) => (
                <li key={text} className="ezp-role-item">
                  <span className="ezp-role-check" aria-hidden="true">
                    <Check size={16} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </article>

          <article className="ezp-role" id="giao-vien">
            <div className="ezp-role-head">
              <span className="ezp-card-icon ezp-card-icon-secondary" aria-hidden="true">
                <Users size={20} />
              </span>
              <h3 className="ezp-role-title">Dành cho giáo viên</h3>
            </div>
            <ul className="ezp-role-list">
              {TEACHER_FEATURES.map((text) => (
                <li key={text} className="ezp-role-item">
                  <span className="ezp-role-check" aria-hidden="true">
                    <Check size={16} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CHẤT LƯỢNG VÀ TIN CẬY
   ═══════════════════════════════════════════════════════════════════════ */

const TRUST = [
  {
    icon: <Quote size={18} />,
    title: 'Minh bạch nguồn',
    desc: 'Câu trả lời trong phần hỏi đáp kèm trích dẫn phần học liệu đã được dùng, để bạn mở ra đối chiếu.',
  },
  {
    icon: <FileSearch size={18} />,
    title: 'Kiểm tra kết quả AI',
    desc: 'Có bước kiểm chứng riêng để đánh dấu nội dung đáng ngờ trong học liệu, thay vì tin ngay kết quả đầu tiên.',
  },
  {
    icon: <Lock size={18} />,
    title: 'Quyền riêng tư',
    desc: 'Học liệu gắn với tài khoản đã tải lên. Học sinh chỉ thấy đề đã được ban hành, không thấy học liệu gốc của giáo viên khác.',
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'Bạn giữ quyền quyết định',
    desc: 'Bộ câu hỏi phải được người dạy rà soát và ban hành. Hệ thống không tự công bố nội dung cho học sinh.',
  },
];

export function TrustBlock() {
  return (
    <section className="ezp-section ezp-section-glow" aria-labelledby="tin-cay-title" id="tin-cay">
      <div className="ezp-container">
        <div className="ezp-head">
          <span className="ezp-eyebrow">Chất lượng &amp; tin cậy</span>
          <h2 className="ezp-title" id="tin-cay-title">
            AI hỗ trợ, người dạy quyết định
          </h2>
        </div>

        <div className="ezp-grid ezp-grid-2">
          {TRUST.map((item) => (
            <article key={item.title} className="ezp-card">
              <span className="ezp-card-icon ezp-card-icon-secondary" aria-hidden="true">
                {item.icon}
              </span>
              <h3 className="ezp-card-title">{item.title}</h3>
              <p className="ezp-card-desc">{item.desc}</p>
            </article>
          ))}
        </div>

        <Alert tone="warning" style={{ marginTop: 'var(--ez-space-8)' }} title="Hãy kiểm chứng nội dung quan trọng">
          Nội dung do AI tạo ra có thể sai hoặc thiếu. Với đề kiểm tra, bài thi và nội dung dùng
          để đánh giá học sinh, hãy đối chiếu lại với học liệu gốc trước khi sử dụng.
        </Alert>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   FAQ
   ═══════════════════════════════════════════════════════════════════════ */

const FAQS = [
  {
    id: 'lam-duoc-gi',
    q: 'EzEdu AI làm được những gì?',
    a: 'Hệ thống nhận tài liệu hoặc video bài giảng, trích xuất nội dung (video được chuyển lời thành văn bản), lập chỉ mục để tra cứu theo ngữ nghĩa, rồi từ đó sinh bộ câu hỏi, trả lời câu hỏi theo học liệu kèm dẫn nguồn, và kiểm chứng những điểm kiến thức đáng ngờ.',
  },
  {
    id: 'dinh-dang',
    q: 'Những định dạng nào được hỗ trợ?',
    a: `Tài liệu: PDF, DOCX, PPTX, tối đa ${DOC_MAX_MB}MB mỗi tệp. Video: MP4, MOV, WEBM, MKV, tối đa ${VIDEO_MAX_MB}MB mỗi tệp. Video sẽ được chuyển lời thành văn bản trước khi lập chỉ mục.`,
  },
  {
    id: 'chinh-xac',
    q: 'Câu hỏi do AI tạo có chính xác không?',
    a: 'Câu hỏi được sinh dựa trên học liệu bạn tải lên nên sát nội dung, nhưng không phải lúc nào cũng đúng hoàn toàn. Vì vậy bộ câu hỏi luôn ở trạng thái cần rà soát: bạn xem lại từng câu, sửa nếu cần, rồi mới ban hành. Ngoài ra có bước kiểm chứng riêng để đánh dấu nội dung cần xem lại.',
  },
  {
    id: 'quyen-rieng-tu',
    q: 'Học liệu tôi tải lên được dùng như thế nào?',
    a: 'Học liệu gắn với tài khoản đã tải lên và được dùng để phục vụ chính các tác vụ bạn yêu cầu: trích xuất nội dung, lập chỉ mục, sinh câu hỏi và hỏi đáp. Học sinh chỉ nhìn thấy bộ đề đã được giáo viên ban hành, không truy cập được học liệu gốc.',
  },
  {
    id: 'khac-nhau-vai-tro',
    q: 'Tài khoản học sinh và giáo viên khác nhau ra sao?',
    a: 'Giáo viên tải học liệu, sinh và ban hành đề, kiểm chứng nội dung, quản lý lớp. Học sinh làm bài đã được ban hành, hỏi đáp theo học liệu, xem lịch sử và tiến độ của mình. Hai khu vực tách biệt: công cụ của giáo viên không xuất hiện trong giao diện học sinh.',
  },
  {
    id: 'dieu-khoan',
    q: 'Tôi cần chuẩn bị gì để bắt đầu?',
    a: 'Chỉ cần một tài khoản và học liệu có sẵn. Khi đăng ký, bạn chọn vai trò học sinh hoặc giáo viên để hệ thống mở đúng không gian làm việc. Hạn mức sử dụng AI do quản trị viên của hệ thống cấu hình.',
  },
];

export function Faq({ headingId = 'faq-title' }: { headingId?: string }) {
  const [openId, setOpenId] = useState<string | null>(FAQS[0].id);
  const baseId = useId();

  return (
    <section className="ezp-section" aria-labelledby={headingId} id="faq">
      <div className="ezp-container">
        <div className="ezp-head ezp-head-center">
          <span className="ezp-eyebrow">Câu hỏi thường gặp</span>
          <h2 className="ezp-title" id={headingId}>
            Những điều người dùng hay hỏi
          </h2>
        </div>

        <div className="ezp-faq">
          {FAQS.map((item) => {
            const open = openId === item.id;
            const panelId = `${baseId}-${item.id}-panel`;
            const triggerId = `${baseId}-${item.id}-trigger`;
            return (
              <div key={item.id} className="ezp-faq-item" id={item.id}>
                <h3>
                  <button
                    type="button"
                    id={triggerId}
                    className="ezp-faq-trigger"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenId(open ? null : item.id)}
                  >
                    {item.q}
                    <span className="ezp-faq-icon" aria-hidden="true">
                      <ChevronDown size={20} />
                    </span>
                  </button>
                </h3>
                {open && (
                  <div className="ezp-faq-panel" id={panelId} role="region" aria-labelledby={triggerId}>
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CTA CUỐI
   ═══════════════════════════════════════════════════════════════════════ */

export function FinalCta() {
  const { status, homePath } = useAuth();
  const signedIn = status === 'authenticated';

  return (
    <section className="ezp-section ezp-section-dark" aria-labelledby="cta-title">
      <div className="ezp-container ezp-cta">
        <div className="ezp-head ezp-head-center" style={{ marginBottom: 0 }}>
          <h2 className="ezp-title" id="cta-title">
            Bắt đầu với học liệu bạn đang có
          </h2>
          <p className="ezp-lede">
            Tải một tài liệu lên và xem hệ thống tạo ra bộ câu hỏi đầu tiên cho bạn.
          </p>
        </div>

        <div className="ezp-cta-actions">
          {signedIn ? (
            <Link to={homePath}>
              <Button size="hero">Vào khu vực của tôi</Button>
            </Link>
          ) : (
            <>
              <Link to="/register">
                <Button size="hero">Tạo tài khoản miễn phí</Button>
              </Link>
              <Link to="/login">
                <Button size="hero" variant="outline">
                  Đăng nhập
                </Button>
              </Link>
            </>
          )}
        </div>

        <p className="ezp-cta-note">
          <Info size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
          Bạn chọn vai trò học sinh hoặc giáo viên khi đăng ký.
        </p>
      </div>
    </section>
  );
}

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

/* ═══════════════════════════════════════════════════════════════════════
   TÍCH HỢP — chưa có, nêu rõ "sắp ra mắt", không bịa tên đối tác
   ═══════════════════════════════════════════════════════════════════════ */

export function IntegrationsTeaser() {
  return (
    <section className="ezp-section ezp-section-alt" aria-labelledby="integrations-title">
      <div className="ezp-container ezp-head ezp-head-center">
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
