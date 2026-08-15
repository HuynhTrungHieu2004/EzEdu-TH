import type { ComponentType } from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Database,
  FileQuestion,
  Globe,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Users,
} from 'lucide-react';

export type ToolRole = 'teacher' | 'student';
export type ToolCategory =
  | 'document'
  | 'question'
  | 'assessment'
  | 'personalization'
  | 'management';

export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  roles: ToolRole[];
  category: ToolCategory;
  /**
   * Cờ tính năng phải bật thì công cụ mới dùng được. Thiếu nó thì thẻ vẫn hiện
   * trong thư viện công cụ dù backend đã tắt phân hệ, bấm vào là gặp 403.
   */
  featureFlag?: string;
}

/**
 * Danh mục "Công cụ AI" — CHỈ liệt kê tính năng đã có backend thật, có route
 * dùng được ngay (không tạo thẻ dẫn tới route chưa xây hoặc cần tham số động
 * không có nguồn để điền, ví dụ "làm bài thi có giờ" cần `examId` cụ thể mà
 * học sinh chưa có cách tự tìm — bỏ khỏi thư viện, ghi vào roadmap thay vì
 * làm thẻ dẫn tới trang lỗi).
 */
export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    id: 'upload-documents',
    title: 'Tải & quản lý học liệu',
    description: 'Tải tài liệu PDF, DOCX, PPTX hoặc video bài giảng — hệ thống tự trích xuất nội dung.',
    href: '/documents',
    icon: Upload,
    roles: ['teacher'],
    category: 'document',
  },
  {
    id: 'generate-questions',
    title: 'Sinh câu hỏi từ học liệu',
    description: 'Chọn số câu, độ khó, mức Bloom — AI tạo câu hỏi kèm đáp án và giải thích.',
    href: '/generate',
    icon: Sparkles,
    roles: ['teacher'],
    category: 'question',
  },
  {
    id: 'question-bank',
    title: 'Ngân hàng câu hỏi',
    description: 'Lưu trữ, duyệt và tái sử dụng câu hỏi cho nhiều đề khác nhau.',
    href: '/question-bank',
    icon: Database,
    roles: ['teacher'],
    category: 'question',
  },
  {
    id: 'exam-blueprints',
    title: 'Ma trận đề & sinh đề tự động',
    description: 'Định nghĩa ma trận theo chủ đề/mức độ, hệ thống tự chọn câu và sinh nhiều mã đề tương đương.',
    href: '/exam-blueprints',
    icon: ClipboardList,
    roles: ['teacher'],
    category: 'question',
  },
  {
    id: 'classes',
    title: 'Quản lý lớp học',
    description: 'Tạo lớp, thêm học sinh, ban hành đề cho đúng nhóm người học.',
    href: '/classes',
    icon: Users,
    roles: ['teacher'],
    category: 'management',
  },
  {
    id: 'document-verification',
    title: 'Kiểm tra độ chính xác học liệu',
    description: 'Rà soát nội dung trích xuất, đối chiếu và đánh dấu điểm cần xác minh trước khi dùng để sinh câu hỏi.',
    href: '/documents',
    icon: ShieldCheck,
    roles: ['teacher'],
    category: 'assessment',
  },
  {
    id: 'practice-questions',
    title: 'Bài luyện tập',
    description: 'Làm các bộ câu hỏi giáo viên đã ban hành, xem kết quả và giải thích ngay sau khi nộp.',
    href: '/published-questions',
    icon: FileQuestion,
    roles: ['student'],
    category: 'assessment',
  },
  {
    id: 'personalization',
    title: 'Cá nhân hóa lộ trình học',
    description: 'Gợi ý nội dung ôn tập dựa trên điểm mạnh/điểm yếu của riêng bạn.',
    href: '/personalization',
    icon: Target,
    roles: ['student'],
    category: 'personalization',
  },
  {
    id: 'chat-advanced',
    title: 'Hỏi đáp AI theo học liệu',
    description: 'Đặt câu hỏi và nhận câu trả lời có trích dẫn từ học liệu hoặc nguồn đã kiểm chứng.',
    href: '/chat-advanced',
    icon: MessageSquare,
    roles: ['teacher', 'student'],
    category: 'document',
  },
  {
    id: 'web-knowledge',
    title: 'Khám phá kiến thức Internet có kiểm chứng',
    description: 'Tra cứu qua AI có tìm kiếm, ưu tiên nguồn chính thống, hiện rõ độ tin cậy từng nguồn.',
    href: '/web-knowledge',
    icon: Globe,
    roles: ['teacher', 'student'],
    category: 'document',
    featureFlag: 'enable_web_knowledge',
  },
  {
    id: 'curriculum-kb',
    title: 'Kho tri thức chuẩn',
    description: 'Tìm kiếm nội dung giáo khoa đã được giáo viên kiểm duyệt và nạp vào kho dùng chung.',
    href: '/curriculum-kb',
    icon: BookOpen,
    roles: ['teacher', 'student'],
    category: 'document',
    featureFlag: 'enable_curriculum_kb',
  },
  {
    id: 'progress',
    title: 'Tiến độ học tập',
    description: 'Xem kết quả, lịch sử làm bài và điểm số theo thời gian.',
    href: '/learning-history',
    icon: BarChart3,
    roles: ['student'],
    category: 'personalization',
  },
];

export const TOOL_CATEGORY_LABEL: Record<ToolCategory, string> = {
  document: 'Học liệu',
  question: 'Tạo câu hỏi',
  assessment: 'Kiểm tra và đánh giá',
  personalization: 'Cá nhân hóa',
  management: 'Quản lý',
};

const RECENT_TOOLS_KEY = 'ezedu_recent_tools';
const MAX_RECENT = 6;

export function trackRecentTool(id: string): void {
  try {
    const raw = localStorage.getItem(RECENT_TOOLS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [id, ...list.filter((existing) => existing !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_TOOLS_KEY, JSON.stringify(next));
  } catch {
    // localStorage không khả dụng (chế độ riêng tư...) — bỏ qua, không chặn điều hướng.
  }
}

export function getRecentToolIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_TOOLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function toolsForRole(role: ToolRole): ToolDefinition[] {
  return TOOL_REGISTRY.filter((tool) => tool.roles.includes(role));
}

/** Bỏ công cụ mà phân hệ đứng sau đang tắt — tránh dẫn người dùng tới trang 403. */
export function toolsEnabledBy(
  tools: ToolDefinition[],
  isEnabled: (key: string) => boolean,
): ToolDefinition[] {
  return tools.filter((tool) => !tool.featureFlag || isEnabled(tool.featureFlag));
}

export function searchTools(tools: ToolDefinition[], query: string): ToolDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return tools;
  return tools.filter(
    (tool) => tool.title.toLowerCase().includes(q) || tool.description.toLowerCase().includes(q),
  );
}
