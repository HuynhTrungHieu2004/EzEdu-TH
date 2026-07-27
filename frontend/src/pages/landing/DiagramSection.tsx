import type { ComponentType, SVGProps } from 'react';
import {
  BadgeCheck,
  BrainCircuit,
  Braces,
  CheckCircle,
  Database,
  Edit3,
  FileOutput,
  FileQuestion,
  GraduationCap,
  History,
  Rows3,
  ScanText,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  User,
} from 'lucide-react';
import { SectionHeading } from './shared';
import type { LandingSectionItem } from '../../types/websiteContent';

type WorkflowGroup = 'input' | 'mining' | 'ai' | 'output';

interface WorkflowNodeData {
  label: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;
  group: WorkflowGroup;
}

const workflowNodes: WorkflowNodeData[] = [
  {
    label: 'Người dùng',
    description: 'Người dùng đăng nhập và thao tác trong giao diện EzEdu AI.',
    icon: User,
    group: 'input',
  },
  {
    label: 'Tải học liệu',
    description: 'Tải PDF, DOCX, PPTX hoặc video từ máy tính lên hệ thống.',
    icon: Upload,
    group: 'input',
  },
  {
    label: 'Kiểm tra tệp',
    description: 'Hệ thống kiểm tra định dạng, dung lượng, vai trò và quyền sở hữu tài liệu.',
    icon: ShieldCheck,
    group: 'input',
  },
  {
    label: 'Trích xuất nội dung',
    description: 'Hệ thống đọc nội dung từ tài liệu hoặc video đã tải lên.',
    icon: ScanText,
    group: 'input',
  },
  {
    label: 'Làm sạch dữ liệu',
    description: 'Chuẩn hóa khoảng trắng, dòng trống và nội dung trước khi chia đoạn.',
    icon: Braces,
    group: 'mining',
  },
  {
    label: 'Chia đoạn',
    description: 'Nội dung được chia thành các phần nhỏ để dễ tìm kiếm và tạo câu hỏi.',
    icon: Rows3,
    group: 'mining',
  },
  {
    label: 'Nhận diện chủ đề',
    description: 'Hệ thống xác định các ý chính và nhóm kiến thức trong học liệu.',
    icon: BrainCircuit,
    group: 'mining',
  },
  {
    label: 'Tìm nội dung liên quan',
    description: 'Các phần nội dung phù hợp được chọn làm ngữ cảnh để tạo câu hỏi.',
    icon: Search,
    group: 'mining',
  },
  {
    label: 'AI sinh câu hỏi',
    description: 'EzEdu AI tạo câu hỏi dựa trên nội dung học liệu đã xử lý.',
    icon: Sparkles,
    group: 'ai',
  },
  {
    label: 'Đáp án & lời giải',
    description: 'Mỗi câu hỏi có đáp án, lựa chọn trả lời và lời giải thích đi kèm.',
    icon: FileQuestion,
    group: 'ai',
  },
  {
    label: 'Kiểm tra chất lượng',
    description: 'Hệ thống rà soát nội dung để người dùng dễ xem lại trước khi sử dụng.',
    icon: CheckCircle,
    group: 'ai',
  },
  {
    label: 'Lưu cơ sở dữ liệu',
    description: 'Lưu học liệu, bộ câu hỏi, lịch sử tạo đề và kết quả làm bài.',
    icon: Database,
    group: 'output',
  },
  {
    label: 'Chỉnh sửa & duyệt',
    description: 'Người dùng xem lại, chỉnh sửa và hoàn thiện từng câu hỏi.',
    icon: Edit3,
    group: 'output',
  },
  {
    label: 'Làm bài & đánh giá',
    description: 'Người học làm bài, nhận điểm và lưu kết quả để xem lại.',
    icon: GraduationCap,
    group: 'output',
  },
  {
    label: 'Xuất đề & lịch sử',
    description: 'Xuất PDF/DOCX, xem lịch sử bộ câu hỏi và lịch sử làm bài.',
    icon: FileOutput,
    group: 'output',
  },
  {
    label: 'Theo dõi lịch sử',
    description: 'Người dùng xem lại học liệu, bộ câu hỏi và các lần làm bài trước đó.',
    icon: History,
    group: 'output',
  },
];

const groupMeta: Record<WorkflowGroup, { label: string; color: string }> = {
  input: { label: 'Học liệu đầu vào', color: '#5b4ef8' },
  mining: { label: 'Khai phá và truy xuất', color: '#10b981' },
  ai: { label: 'Trí tuệ nhân tạo', color: '#d97706' },
  output: { label: 'Cơ sở dữ liệu và đầu ra', color: '#0891b2' },
};

interface WorkflowNodeProps {
  node: WorkflowNodeData;
  index: number;
}

function WorkflowNode({ node, index }: WorkflowNodeProps) {
  const Icon = node.icon;
  const nodeId = `workflow-node-${index}`;
  const descId = `${nodeId}-desc`;

  return (
    <article
      className={`lp-flow-node-box lp-flow-node-box--${node.group}`}
      tabIndex={0}
      aria-labelledby={`${nodeId}-label`}
      aria-describedby={descId}
    >
      <span className="lp-flow-node-icon" aria-hidden="true">
        <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="lp-flow-node-label" id={`${nodeId}-label`}>{node.label}</span>
      <small id={descId}>{node.description}</small>
      <span className="lp-flow-tooltip" role="tooltip">
        {node.description}
      </span>
    </article>
  );
}

export default function DiagramSection({ content }: { content?: LandingSectionItem }) {
  return (
    <section className="lp-section-white" id="workflow" aria-labelledby="diagram-heading">
      <div className="lp-container">
        <SectionHeading
          eyebrow={content?.eyebrow || 'Sơ đồ nghiệp vụ'}
          title={content?.title || 'Từ học liệu đầu vào đến đề kiểm tra hoàn chỉnh'}
          description={content?.description || 'Quy trình kết hợp xử lý dữ liệu, cơ sở dữ liệu, thuật toán khai phá và trí tuệ nhân tạo.'}
          titleId="diagram-heading"
        />

        <div className="lp-diagram-wrap" aria-label="Sơ đồ luồng nghiệp vụ EzEdu AI">
          <div className="lp-diagram-title-bar">
            <div className="lp-diagram-badge">
              <BadgeCheck size={14} strokeWidth={2} aria-hidden="true" />
              Đã đối chiếu với code hiện tại
            </div>
          </div>

          <div className="lp-diagram-flow">
            {workflowNodes.map((node, index) => (
              <div className="lp-flow-step" key={`${node.group}-${node.label}`}>
                <WorkflowNode node={node} index={index} />
                {index < workflowNodes.length - 1 && (
                  <span className="lp-flow-arrow" aria-hidden="true">→</span>
                )}
              </div>
            ))}
          </div>

          <div className="lp-diagram-legend">
            {(Object.keys(groupMeta) as WorkflowGroup[]).map((group) => (
              <div key={group} className="lp-legend-item">
                <span className="lp-legend-dot" style={{ background: groupMeta[group].color }} aria-hidden="true" />
                <span>{groupMeta[group].label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
