import type { ComponentType, SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileText } from 'lucide-react';
import { SectionHeading } from './shared';
import type { LandingSectionItem } from '../../types/websiteContent';

const docItems = [
  { icon: BookOpen, name: 'Giáo trình CSDL.pdf',         size: '2.4 MB · 180 trang', active: true  },
  { icon: FileText, name: 'Slide Lập trình Web.pptx',    size: '1.8 MB · 64 slide',  active: false },
  { icon: FileText, name: 'Tài liệu OOP.docx',           size: '890 KB · 45 trang',  active: false },
];

type Difficulty = 'easy' | 'medium' | 'hard';

interface DemoQuestionData {
  number: number;
  text: string;
  difficulty: Difficulty;
  options?: Array<{ letter: string; text: string; correct?: boolean }>;
}

const difficultyLabels: Record<Difficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

const demoQuestions: DemoQuestionData[] = [
  {
    number: 1,
    text: 'Trong SQL, lệnh nào dùng để thêm dữ liệu mới vào bảng?',
    difficulty: 'easy',
    options: [
      { letter: 'A', text: 'INSERT INTO', correct: true },
      { letter: 'B', text: 'ADD INTO' },
      { letter: 'C', text: 'UPDATE SET' },
      { letter: 'D', text: 'CREATE INTO' },
    ],
  },
  {
    number: 2,
    text: 'Khóa ngoại (Foreign Key) trong CSDL quan hệ có chức năng chính là gì?',
    difficulty: 'medium',
    options: [
      { letter: 'A', text: 'Tăng tốc truy vấn' },
      { letter: 'B', text: 'Duy trì tính toàn vẹn', correct: true },
      { letter: 'C', text: 'Mã hóa dữ liệu' },
      { letter: 'D', text: 'Tạo chỉ mục tự động' },
    ],
  },
];

const previewQuestion: DemoQuestionData = {
  number: 3,
  text: 'Normalization trong CSDL nhằm mục đích chính nào sau đây?',
  difficulty: 'hard',
};

interface DemoDocItem {
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;
  name: string;
  size: string;
  active: boolean;
}

function DemoDocumentItem({ item }: { item: DemoDocItem }) {
  const Icon = item.icon;
  return (
    <div className={`lp-demo-doc-item${item.active ? ' active' : ''}`}>
      <span className="lp-demo-doc-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <div className="lp-demo-doc-info">
        <p className="lp-demo-doc-name">{item.name}</p>
        <p className="lp-demo-doc-size">{item.size}</p>
      </div>
    </div>
  );
}

function DemoQuestion({ question }: { question: DemoQuestionData }) {
  return (
    <div className="lp-demo-question">
      <div className="lp-demo-q-header">
        <span className="lp-demo-q-num">Câu {question.number}</span>
        <p className="lp-demo-q-text">{question.text}</p>
        <span className={`lp-demo-q-level lp-demo-q-level-${question.difficulty}`}>
          {difficultyLabels[question.difficulty]}
        </span>
      </div>
      {question.options && (
        <div className="lp-demo-q-options">
          {question.options.map(option => (
            <div
              key={option.letter}
              className={`lp-demo-q-option${option.correct ? ' correct' : ''}`}
            >
              <span className="lp-demo-q-option-letter">{option.letter}.</span>
              {option.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DemoSection({ content }: { content?: LandingSectionItem }) {
  const navigate = useNavigate();

  return (
    <section className="lp-section" id="tinh-nang" aria-labelledby="demo-heading">
      <div className="lp-container">
        <SectionHeading
          eyebrow={content?.eyebrow || 'Kết quả thực tế'}
          title={content?.title || 'Xem EzEdu AI tạo đề thi'}
          description={content?.description || 'Câu hỏi được sinh ra kèm đáp án, lời giải thích và mức độ phù hợp.'}
          titleId="demo-heading"
        />

        <div className="lp-demo-wrap" aria-label="Minh họa giao diện EzEdu AI">
          {/* Browser chrome */}
          <div className="lp-demo-topbar">
            <div className="lp-demo-dots" aria-hidden="true">
              <span className="lp-demo-dot lp-demo-dot-red" />
              <span className="lp-demo-dot lp-demo-dot-yellow" />
              <span className="lp-demo-dot lp-demo-dot-green" />
            </div>
            <div className="lp-demo-url-bar">ezedu.ai / question-sets / 42</div>
          </div>

          <div className="lp-demo-body">
            {/* Sidebar */}
            <aside className="lp-demo-sidebar">
              <p className="lp-demo-sidebar-title">Học liệu của tôi</p>
              {docItems.map(doc => <DemoDocumentItem key={doc.name} item={doc} />)}
            </aside>

            {/* Main content */}
            <div className="lp-demo-content">
              <div className="lp-demo-content-title">
                Bộ đề: Cơ sở dữ liệu – Chương 3
                <span className="lp-demo-badge lp-demo-badge-green">✓ Hoàn thành</span>
                <span className="lp-demo-badge lp-demo-badge-blue">10 câu hỏi</span>
              </div>

              <div className="lp-demo-question-list">
                {demoQuestions.map(question => (
                  <DemoQuestion key={question.number} question={question} />
                ))}

                <div className="lp-demo-locked-preview">
                  <div className="lp-demo-locked-content" aria-hidden="true">
                    <DemoQuestion question={previewQuestion} />
                  </div>
                  <div className="lp-demo-locked-overlay">
                    <button
                      className="lp-demo-locked-btn"
                      onClick={() => navigate('/register')}
                    >
                      Đăng ký để xem thêm →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
