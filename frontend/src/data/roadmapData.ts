export type LevelType = 'Tiểu học' | 'THCS' | 'THPT';

export type LessonStatus = 'completed' | 'in_progress' | 'not_started' | 'locked';

export type SubjectDifficulty = 'Dễ' | 'Trung bình' | 'Khó';

export interface LessonItem {
  id: string;
  title: string;
  durationMinutes: number;
  status: LessonStatus;
  score?: number;
  completedAt?: string;
  type?: 'theory' | 'exercise' | 'video' | 'quiz';
}

export interface ChapterData {
  id: string;
  title: string;
  completionRate: number;
  lessons: LessonItem[];
}

export interface SubjectData {
  id: string;
  name: string;
  icon: string; // Emoji or Lucide icon key
  category?: string;
  chapterCount: number;
  lessonCount: number;
  avgScore: number;
  progressPct: number;
  aiRemark: string;
  difficulty: SubjectDifficulty;
  studyHours: number;
  chapters: ChapterData[];
}

export interface GradeData {
  id: string; // class-1 to class-12
  gradeNumber: number;
  name: string;
  level: LevelType;
  thumbnail: string;
  completionRate: number;
  subjectCount: number;
  lessonCount: number;
  studyHours: number;
  subjects: SubjectData[];
}

export interface AIRecommendationItem {
  id: string;
  type: 'video' | 'document' | 'practice' | 'flashcard' | 'quiz';
  title: string;
  description: string;
  subjectName: string;
  estimatedMinutes: number;
  actionUrl?: string;
}

export interface AIRecommendation {
  summary: string;
  weaknessArea: string;
  suggestedChapter: string;
  targetSubject: string;
  items: AIRecommendationItem[];
}

export interface TeacherRemark {
  id: string;
  teacherName: string;
  teacherRole: string;
  date: string;
  content: string;
  ratingScore: number;
  strengths: string[];
  improvements: string[];
}

export interface RecentSubjectHistory {
  id: string;
  subjectName: string;
  gradeName: string;
  lastLessonTitle: string;
  completedAt: string;
  score?: number;
  progressPct: number;
  icon: string;
}

export interface BadgeItem {
  id: string;
  title: string;
  icon: string;
  description: string;
  unlockedAt?: string;
}

export interface RoadmapOverallStats {
  completionPercentage: number;
  completedClasses: number;
  totalClasses: number;
  totalSubjects: number;
  totalLessons: number;
  completedLessons: number;
  remainingLessons: number;
  avgScore: number;
  totalStudyHours: number;
  streakDays: number;
  badges: BadgeItem[];
}

// ── MOCK DATA CHO DỰ ÁN ───────────────────────────────────────────────────

export const MOCK_OVERALL_STATS: RoadmapOverallStats = {
  completionPercentage: 65,
  completedClasses: 9,
  totalClasses: 12,
  totalSubjects: 148,
  totalLessons: 1840,
  completedLessons: 1196,
  remainingLessons: 644,
  avgScore: 8.4,
  totalStudyHours: 320,
  streakDays: 14,
  badges: [
    { id: 'b1', title: 'Thần đồng Toán học', icon: '🧮', description: 'Hoàn thành 50 bài tập Toán trên 9.0 điểm', unlockedAt: '2026-07-20' },
    { id: 'b2', title: 'Chăm chỉ mỗi ngày', icon: '🔥', description: 'Duy trì chuỗi học 14 ngày liên tiếp', unlockedAt: '2026-08-01' },
    { id: 'b3', title: 'Vua Tiếng Anh', icon: '🇬🇧', description: 'Đạt điểm tối đa bài kiểm tra từ vựng', unlockedAt: '2026-07-28' },
    { id: 'b4', title: 'Bậc thầy Khoa học', icon: '🧪', description: 'Hoàn thành các thí nghiệm Vật lý - Hóa học', unlockedAt: '2026-07-15' },
  ],
};

export const MOCK_AI_RECOMMENDATION: AIRecommendation = {
  summary: 'Hệ thống nhận thấy bạn cần củng cố kiến thức phần Hàm số và Đồ thị.',
  weaknessArea: 'Hàm số & Phương trình bậc hai',
  suggestedChapter: 'Chương 2: Hàm số bậc nhất và bậc hai',
  targetSubject: 'Toán học Lớp 10',
  items: [
    {
      id: 'rec-1',
      type: 'video',
      title: 'Video: Bài giảng Đồ thị hàm số bậc 2',
      description: 'Hình ảnh hóa trực quan cách xác định đỉnh và trục đối xứng.',
      subjectName: 'Toán 10',
      estimatedMinutes: 15,
    },
    {
      id: 'rec-2',
      type: 'document',
      title: 'Tóm tắt công thức trọng tâm Chương 2',
      description: 'Tải về sơ đồ tư duy hệ thống toàn bộ lý thuyết hàm số.',
      subjectName: 'Toán 10',
      estimatedMinutes: 10,
    },
    {
      id: 'rec-3',
      type: 'practice',
      title: 'Đề luyện tập chuyên sâu (15 câu chọn lọc)',
      description: 'Các bài tập từ dễ đến khó kèm đáp án giải thích chi tiết AI.',
      subjectName: 'Toán 10',
      estimatedMinutes: 20,
    },
    {
      id: 'rec-4',
      type: 'flashcard',
      title: 'Bộ Flashcard: Nhớ nhanh các dạng bài tập',
      description: 'Luyện tập phản xạ nhận diện dạng đề thi.',
      subjectName: 'Toán 10',
      estimatedMinutes: 8,
    },
    {
      id: 'rec-5',
      type: 'quiz',
      title: 'Quiz nhanh 5 phút kiểm tra lại',
      description: 'Đánh giá mức độ hiểu bài sau khi ôn tập.',
      subjectName: 'Toán 10',
      estimatedMinutes: 5,
    },
  ],
};

export const MOCK_TEACHER_REMARK: TeacherRemark = {
  id: 'tr-01',
  teacherName: 'ThS. Nguyễn Văn An',
  teacherRole: 'Giáo viên Chủ nhiệm & Bộ môn Toán',
  date: '02/08/2026',
  content: 'Học sinh nắm vững lý thuyết Chương 1 và làm bài tập trắc nghiệm rất nhanh. Tuy nhiên ở phần Hàm số bậc 2 cần chú ý vẽ bảng biến thiên cẩn thận hơn để tránh mất điểm trình bày.',
  ratingScore: 8.8,
  strengths: ['Tư duy logic tốt', 'Phản xạ trắc nghiệm nhanh', 'Hoàn thành 80% bài tập đúng hạn'],
  improvements: ['Cần rèn luyện cách trình bày tự luận', 'Ôn lại bảng biến thiên hàm số'],
};

export const MOCK_RECENT_HISTORY: RecentSubjectHistory[] = [
  {
    id: 'hist-1',
    subjectName: 'Toán học',
    gradeName: 'Lớp 10',
    lastLessonTitle: 'Bài 3: Đồ thị hàm số bậc hai',
    completedAt: 'Hôm nay, 14:30',
    score: 8.5,
    progressPct: 80,
    icon: '📐',
  },
  {
    id: 'hist-2',
    subjectName: 'Vật lý',
    gradeName: 'Lớp 10',
    lastLessonTitle: 'Bài 2: Chuyển động thẳng biến đổi đều',
    completedAt: 'Hôm qua, 20:15',
    score: 9.0,
    progressPct: 65,
    icon: '⚡',
  },
  {
    id: 'hist-3',
    subjectName: 'Hóa học',
    gradeName: 'Lớp 10',
    lastLessonTitle: 'Bài 1: Cấu tạo hạt nhân nguyên tử',
    completedAt: '3 ngày trước',
    score: 7.8,
    progressPct: 45,
    icon: '🧪',
  },
  {
    id: 'hist-4',
    subjectName: 'Tiếng Anh',
    gradeName: 'Lớp 10',
    lastLessonTitle: 'Unit 2: Humans and the Environment',
    completedAt: '4 ngày trước',
    score: 9.2,
    progressPct: 90,
    icon: '🇬🇧',
  },
];

// Hàm hỗ trợ khởi tạo bài học chuẩn
function createMockLessons(chapterId: string, baseTitle: string, count: number): LessonItem[] {
  return Array.from({ length: count }, (_, i) => {
    const isCompleted = i < Math.floor(count * 0.7);
    const isInProgress = i === Math.floor(count * 0.7);
    const status: LessonStatus = isCompleted
      ? 'completed'
      : isInProgress
      ? 'in_progress'
      : i === count - 1
      ? 'locked'
      : 'not_started';

    return {
      id: `${chapterId}-les-${i + 1}`,
      title: `Bài ${i + 1}: ${baseTitle} (Phần ${i + 1})`,
      durationMinutes: 20 + (i % 3) * 10,
      status,
      score: isCompleted ? Number((7.5 + (i % 3) * 0.8).toFixed(1)) : undefined,
      completedAt: isCompleted ? '2026-07-25' : undefined,
      type: i % 4 === 0 ? 'theory' : i % 4 === 1 ? 'exercise' : i % 4 === 2 ? 'video' : 'quiz',
    };
  });
}

// 📖 Danh sách môn học tiêu chuẩn Lớp 10 (THPT)
const CLASS_10_SUBJECTS: SubjectData[] = [
  {
    id: 'c10-toan',
    name: 'Toán học',
    icon: '📐',
    chapterCount: 9,
    lessonCount: 45,
    avgScore: 8.2,
    progressPct: 80,
    aiRemark: 'Cần ôn thêm phần Đồ thị hàm số bậc 2.',
    difficulty: 'Khó',
    studyHours: 42,
    chapters: [
      {
        id: 'c10-t-ch1',
        title: 'Chương 1: Mệnh đề và Tập hợp',
        completionRate: 100,
        lessons: createMockLessons('c10-t-ch1', 'Mệnh đề toán học & các phép toán tập hợp', 5),
      },
      {
        id: 'c10-t-ch2',
        title: 'Chương 2: Hàm số bậc nhất và bậc hai',
        completionRate: 75,
        lessons: createMockLessons('c10-t-ch2', 'Hàm số, tập xác định & Đồ thị hàm số', 6),
      },
      {
        id: 'c10-t-ch3',
        title: 'Chương 3: Giá trị lượng giác của một góc từ 0° đến 180°',
        completionRate: 60,
        lessons: createMockLessons('c10-t-ch3', 'Lượng giác & Định lý cosin, sin', 5),
      },
      {
        id: 'c10-t-ch4',
        title: 'Chương 4: Vectơ và các phép toán',
        completionRate: 40,
        lessons: createMockLessons('c10-t-ch4', 'Khái niệm vectơ, tổng và hiệu hai vectơ', 6),
      },
      {
        id: 'c10-t-ch5',
        title: 'Chương 5: Các số đặc trưng của mẫu số liệu không ghép nhóm',
        completionRate: 0,
        lessons: createMockLessons('c10-t-ch5', 'Số trung bình, trung vị, mốt', 4),
      },
    ],
  },
  {
    id: 'c10-van',
    name: 'Ngữ văn',
    icon: '📖',
    chapterCount: 8,
    lessonCount: 40,
    avgScore: 8.7,
    progressPct: 85,
    aiRemark: 'Khả năng cảm thụ văn học thần thoại rất tốt.',
    difficulty: 'Trung bình',
    studyHours: 35,
    chapters: [
      {
        id: 'c10-v-ch1',
        title: 'Chương 1: Sức hấp dẫn của truyện thần thoại',
        completionRate: 100,
        lessons: createMockLessons('c10-v-ch1', 'Phân tích văn bản Thần Thoại & Viết bài cảm nhận', 5),
      },
      {
        id: 'c10-v-ch2',
        title: 'Chương 2: Vẻ đẹp truyền thống qua Thơ ca',
        completionRate: 90,
        lessons: createMockLessons('c10-v-ch2', 'Thơ trung đại Việt Nam', 5),
      },
      {
        id: 'c10-v-ch3',
        title: 'Chương 3: Nghệ thuật thuyết minh & Nghị luận',
        completionRate: 70,
        lessons: createMockLessons('c10-v-ch3', 'Cấu trúc bài văn nghị luận xã hội', 5),
      },
    ],
  },
  {
    id: 'c10-anh',
    name: 'Tiếng Anh (Global Success)',
    icon: '🇬🇧',
    chapterCount: 10,
    lessonCount: 50,
    avgScore: 9.0,
    progressPct: 92,
    aiRemark: 'Kỹ năng Reading và Listening phát triển vượt trội.',
    difficulty: 'Trung bình',
    studyHours: 48,
    chapters: [
      {
        id: 'c10-e-ch1',
        title: 'Unit 1: Family Life',
        completionRate: 100,
        lessons: createMockLessons('c10-e-ch1', 'Vocabulary & Present Simple vs Continuous', 5),
      },
      {
        id: 'c10-e-ch2',
        title: 'Unit 2: Humans and the Environment',
        completionRate: 100,
        lessons: createMockLessons('c10-e-ch2', 'Environment protection & Future Tenses', 5),
      },
      {
        id: 'c10-e-ch3',
        title: 'Unit 3: Music & Arts',
        completionRate: 80,
        lessons: createMockLessons('c10-e-ch3', 'Compound sentences & Listening skills', 5),
      },
    ],
  },
  {
    id: 'c10-ly',
    name: 'Vật lý',
    icon: '⚡',
    chapterCount: 7,
    lessonCount: 35,
    avgScore: 8.0,
    progressPct: 70,
    aiRemark: 'Cần chú ý các bài toán về Chuyển động biến đổi đều.',
    difficulty: 'Khó',
    studyHours: 30,
    chapters: [
      {
        id: 'c10-p-ch1',
        title: 'Chương 1: Mở đầu & Động học',
        completionRate: 100,
        lessons: createMockLessons('c10-p-ch1', 'Chuyển động thẳng đều và gia tốc', 5),
      },
      {
        id: 'c10-p-ch2',
        title: 'Chương 2: Động lực học',
        completionRate: 60,
        lessons: createMockLessons('c10-p-ch2', 'Các lực cơ học & Ba định luật New-ton', 5),
      },
    ],
  },
  {
    id: 'c10-hoa',
    name: 'Hóa học',
    icon: '🧪',
    chapterCount: 7,
    lessonCount: 35,
    avgScore: 8.3,
    progressPct: 75,
    aiRemark: 'Hiểu rõ cấu tạo nguyên tử & bảng tuần hoàn.',
    difficulty: 'Khó',
    studyHours: 28,
    chapters: [
      {
        id: 'c10-c-ch1',
        title: 'Chương 1: Cấu tạo nguyên tử',
        completionRate: 100,
        lessons: createMockLessons('c10-c-ch1', 'Hạt nhân, electron & cấu hình electron', 5),
      },
      {
        id: 'c10-c-ch2',
        title: 'Chương 2: Bảng tuần hoàn các nguyên tố hóa học',
        completionRate: 80,
        lessons: createMockLessons('c10-c-ch2', 'Quy luật biến đổi tính chất các nguyên tố', 5),
      },
    ],
  },
  {
    id: 'c10-sinh',
    name: 'Sinh học',
    icon: '🧬',
    chapterCount: 6,
    lessonCount: 30,
    avgScore: 8.8,
    progressPct: 80,
    aiRemark: 'Nắm vững lý thuyết về Tế bào và trao đổi chất.',
    difficulty: 'Trung bình',
    studyHours: 25,
    chapters: [
      {
        id: 'c10-b-ch1',
        title: 'Chương 1: Giới thiệu thế giới sống & Sinh học tế bào',
        completionRate: 100,
        lessons: createMockLessons('c10-b-ch1', 'Cấu trúc tế bào nhân sơ và nhân thực', 5),
      },
    ],
  },
  {
    id: 'c10-su',
    name: 'Lịch sử',
    icon: '📜',
    chapterCount: 6,
    lessonCount: 28,
    avgScore: 8.6,
    progressPct: 85,
    aiRemark: 'Ghi nhớ tốt các mốc lịch sử thế giới cổ trung đại.',
    difficulty: 'Dễ',
    studyHours: 22,
    chapters: [
      {
        id: 'c10-h-ch1',
        title: 'Chương 1: Lịch sử và Sử học',
        completionRate: 100,
        lessons: createMockLessons('c10-h-ch1', 'Đối tượng, chức năng của Sử học', 4),
      },
    ],
  },
  {
    id: 'c10-dia',
    name: 'Địa lý',
    icon: '🌍',
    chapterCount: 6,
    lessonCount: 28,
    avgScore: 8.5,
    progressPct: 80,
    aiRemark: 'Kỹ năng đọc bản đồ và phân tích số liệu rất tốt.',
    difficulty: 'Dễ',
    studyHours: 20,
    chapters: [
      {
        id: 'c10-g-ch1',
        title: 'Chương 1: Sử dụng bản đồ & Đơn vị bản đồ',
        completionRate: 100,
        lessons: createMockLessons('c10-g-ch1', 'Phương pháp biểu hiện các đối tượng địa lý', 4),
      },
    ],
  },
  {
    id: 'c10-gdktpl',
    name: 'Giáo dục kinh tế và pháp luật',
    icon: '⚖️',
    chapterCount: 5,
    lessonCount: 25,
    avgScore: 9.1,
    progressPct: 90,
    aiRemark: 'Hiểu rõ các quy định pháp luật và nền kinh tế thị trường.',
    difficulty: 'Dễ',
    studyHours: 18,
    chapters: [
      {
        id: 'c10-law-ch1',
        title: 'Chương 1: Nền kinh tế và các chủ thể kinh tế',
        completionRate: 100,
        lessons: createMockLessons('c10-law-ch1', 'Thị trường và cơ chế thị trường', 4),
      },
    ],
  },
  {
    id: 'c10-tin',
    name: 'Tin học',
    icon: '💻',
    chapterCount: 6,
    lessonCount: 30,
    avgScore: 9.5,
    progressPct: 95,
    aiRemark: 'Tư duy lập trình Python xuất sắc.',
    difficulty: 'Trung bình',
    studyHours: 32,
    chapters: [
      {
        id: 'c10-cs-ch1',
        title: 'Chương 1: Máy tính và xã hội tri thức',
        completionRate: 100,
        lessons: createMockLessons('c10-cs-ch1', 'Hệ điều hành & Kiến thức khoa học máy tính', 5),
      },
      {
        id: 'c10-cs-ch2',
        title: 'Chương 2: Lập trình Python cơ bản',
        completionRate: 90,
        lessons: createMockLessons('c10-cs-ch2', 'Biến, kiểu dữ liệu & Cấu trúc rẽ nhánh', 5),
      },
    ],
  },
  {
    id: 'c10-cn',
    name: 'Công nghệ',
    icon: '🛠️',
    chapterCount: 5,
    lessonCount: 22,
    avgScore: 8.9,
    progressPct: 88,
    aiRemark: 'Nắm vững kiến thức công nghệ trồng trọt / cơ khí.',
    difficulty: 'Dễ',
    studyHours: 16,
    chapters: [
      {
        id: 'c10-tech-ch1',
        title: 'Chương 1: Công nghệ và đời sống',
        completionRate: 100,
        lessons: createMockLessons('c10-tech-ch1', 'Bản vẽ kỹ thuật & Quy trình sản xuất', 4),
      },
    ],
  },
  {
    id: 'c10-gdqp',
    name: 'Giáo dục quốc phòng và an ninh',
    icon: '🛡️',
    chapterCount: 4,
    lessonCount: 18,
    avgScore: 9.2,
    progressPct: 100,
    aiRemark: 'Đã hoàn thành toàn bộ nội dung học phần.',
    difficulty: 'Dễ',
    studyHours: 15,
    chapters: [
      {
        id: 'c10-mil-ch1',
        title: 'Chương 1: Lịch sử truyền thống lực lượng vũ trang',
        completionRate: 100,
        lessons: createMockLessons('c10-mil-ch1', 'Truyền thống đánh giặc giữ nước của dân tộc', 4),
      },
    ],
  },
  {
    id: 'c10-gdtc',
    name: 'Giáo dục thể chất',
    icon: '⚽',
    chapterCount: 4,
    lessonCount: 16,
    avgScore: 9.4,
    progressPct: 100,
    aiRemark: 'Đạt thể lực tốt các bài tập vận động.',
    difficulty: 'Dễ',
    studyHours: 14,
    chapters: [
      {
        id: 'c10-pe-ch1',
        title: 'Chương 1: Đội hình đội ngũ & Bài tập thể dục',
        completionRate: 100,
        lessons: createMockLessons('c10-pe-ch1', 'Rèn luyện sức bền & Thể thao tự chọn', 4),
      },
    ],
  },
  {
    id: 'c10-hdtn',
    name: 'Hoạt động trải nghiệm, hướng nghiệp',
    icon: '🚀',
    chapterCount: 5,
    lessonCount: 20,
    avgScore: 9.3,
    progressPct: 90,
    aiRemark: 'Tích cực tham gia các dự án hướng nghiệp.',
    difficulty: 'Dễ',
    studyHours: 18,
    chapters: [
      {
        id: 'c10-exp-ch1',
        title: 'Chương 1: Khám phá bản thân và lập kế hoạch',
        completionRate: 100,
        lessons: createMockLessons('c10-exp-ch1', 'Xác định sở thích & Năng lực nghề nghiệp', 4),
      },
    ],
  },
];

// Tạo các môn cho cấp Tiểu học
function generatePrimarySubjects(gradeNum: number): SubjectData[] {
  const subjects = ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Tự nhiên và Xã hội', 'Đạo đức', 'Âm nhạc', 'Mỹ thuật', 'Tin học & Công nghệ'];
  const icons = ['📐', '📚', '🇬🇧', '🌿', '🕊️', '🎵', '🎨', '💻'];

  return subjects.map((sub, idx) => ({
    id: `c${gradeNum}-${idx}`,
    name: `${sub} Lớp ${gradeNum}`,
    icon: icons[idx % icons.length],
    chapterCount: 6,
    lessonCount: 30,
    avgScore: 8.5 + (idx % 3) * 0.4,
    progressPct: 100,
    aiRemark: `Đã hoàn thành xuất sắc chương trình ${sub} Lớp ${gradeNum}.`,
    difficulty: 'Dễ',
    studyHours: 20 + idx * 2,
    chapters: [
      {
        id: `c${gradeNum}-${idx}-ch1`,
        title: 'Chương 1: Kiến thức nền tảng',
        completionRate: 100,
        lessons: createMockLessons(`c${gradeNum}-${idx}-ch1`, `Bài tập cơ bản ${sub}`, 4),
      },
    ],
  }));
}

// Tạo các môn cho cấp THCS
function generateTHCSSubjects(gradeNum: number): SubjectData[] {
  const subjects = ['Toán', 'Ngữ văn', 'Tiếng Anh', 'Khoa học tự nhiên', 'Lịch sử & Địa lý', 'GDCD', 'Tin học', 'Công nghệ'];
  const icons = ['📐', '📖', '🇬🇧', '🧪', '🌍', '⚖️', '💻', '🛠️'];

  const isCurrentGrade = gradeNum === 9;

  return subjects.map((sub, idx) => ({
    id: `c${gradeNum}-${idx}`,
    name: `${sub} Lớp ${gradeNum}`,
    icon: icons[idx % icons.length],
    chapterCount: 7,
    lessonCount: 35,
    avgScore: 8.2 + (idx % 3) * 0.5,
    progressPct: isCurrentGrade ? 90 : 100,
    aiRemark: `Hoàn thành tốt môn ${sub} Lớp ${gradeNum}.`,
    difficulty: idx < 3 ? 'Khó' : 'Trung bình',
    studyHours: 25 + idx * 3,
    chapters: [
      {
        id: `c${gradeNum}-${idx}-ch1`,
        title: 'Chương 1: Các khái niệm cơ bản',
        completionRate: 100,
        lessons: createMockLessons(`c${gradeNum}-${idx}-ch1`, `Chủ đề học tập ${sub}`, 5),
      },
    ],
  }));
}

// 🏫 DANH SÁCH 12 KHỐI LỚP (LỚP 1 - LỚP 12)
export const MOCK_GRADES: GradeData[] = [
  // Cấp Tiểu học (Lớp 1 - 5)
  {
    id: 'class-1',
    gradeNumber: 1,
    name: 'Lớp 1',
    level: 'Tiểu học',
    thumbnail: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&auto=format&fit=crop&q=80',
    completionRate: 100,
    subjectCount: 8,
    lessonCount: 240,
    studyHours: 180,
    subjects: generatePrimarySubjects(1),
  },
  {
    id: 'class-2',
    gradeNumber: 2,
    name: 'Lớp 2',
    level: 'Tiểu học',
    thumbnail: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&auto=format&fit=crop&q=80',
    completionRate: 100,
    subjectCount: 8,
    lessonCount: 240,
    studyHours: 190,
    subjects: generatePrimarySubjects(2),
  },
  {
    id: 'class-3',
    gradeNumber: 3,
    name: 'Lớp 3',
    level: 'Tiểu học',
    thumbnail: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&auto=format&fit=crop&q=80',
    completionRate: 100,
    subjectCount: 8,
    lessonCount: 250,
    studyHours: 200,
    subjects: generatePrimarySubjects(3),
  },
  {
    id: 'class-4',
    gradeNumber: 4,
    name: 'Lớp 4',
    level: 'Tiểu học',
    thumbnail: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=600&auto=format&fit=crop&q=80',
    completionRate: 100,
    subjectCount: 8,
    lessonCount: 260,
    studyHours: 210,
    subjects: generatePrimarySubjects(4),
  },
  {
    id: 'class-5',
    gradeNumber: 5,
    name: 'Lớp 5',
    level: 'Tiểu học',
    thumbnail: 'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=600&auto=format&fit=crop&q=80',
    completionRate: 100,
    subjectCount: 8,
    lessonCount: 270,
    studyHours: 220,
    subjects: generatePrimarySubjects(5),
  },

  // Cấp THCS (Lớp 6 - 9)
  {
    id: 'class-6',
    gradeNumber: 6,
    name: 'Lớp 6',
    level: 'THCS',
    thumbnail: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop&q=80',
    completionRate: 100,
    subjectCount: 10,
    lessonCount: 320,
    studyHours: 260,
    subjects: generateTHCSSubjects(6),
  },
  {
    id: 'class-7',
    gradeNumber: 7,
    name: 'Lớp 7',
    level: 'THCS',
    thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80',
    completionRate: 100,
    subjectCount: 10,
    lessonCount: 330,
    studyHours: 270,
    subjects: generateTHCSSubjects(7),
  },
  {
    id: 'class-8',
    gradeNumber: 8,
    name: 'Lớp 8',
    level: 'THCS',
    thumbnail: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&auto=format&fit=crop&q=80',
    completionRate: 100,
    subjectCount: 10,
    lessonCount: 340,
    studyHours: 280,
    subjects: generateTHCSSubjects(8),
  },
  {
    id: 'class-9',
    gradeNumber: 9,
    name: 'Lớp 9',
    level: 'THCS',
    thumbnail: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&auto=format&fit=crop&q=80',
    completionRate: 100,
    subjectCount: 10,
    lessonCount: 350,
    studyHours: 300,
    subjects: generateTHCSSubjects(9),
  },

  // Cấp THPT (Lớp 10 - 12)
  {
    id: 'class-10',
    gradeNumber: 10,
    name: 'Lớp 10',
    level: 'THPT',
    thumbnail: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&auto=format&fit=crop&q=80',
    completionRate: 82,
    subjectCount: 14,
    lessonCount: 449,
    studyHours: 360,
    subjects: CLASS_10_SUBJECTS,
  },
  {
    id: 'class-11',
    gradeNumber: 11,
    name: 'Lớp 11',
    level: 'THPT',
    thumbnail: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=600&auto=format&fit=crop&q=80',
    completionRate: 0,
    subjectCount: 14,
    lessonCount: 460,
    studyHours: 0,
    subjects: CLASS_10_SUBJECTS.map((s) => ({
      ...s,
      id: s.id.replace('c10', 'c11'),
      name: `${s.name.split(' ')[0]} Lớp 11`,
      progressPct: 0,
      avgScore: 0,
      aiRemark: 'Chưa bắt đầu chương trình học.',
    })),
  },
  {
    id: 'class-12',
    gradeNumber: 12,
    name: 'Lớp 12',
    level: 'THPT',
    thumbnail: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=600&auto=format&fit=crop&q=80',
    completionRate: 0,
    subjectCount: 14,
    lessonCount: 480,
    studyHours: 0,
    subjects: CLASS_10_SUBJECTS.map((s) => ({
      ...s,
      id: s.id.replace('c10', 'c12'),
      name: `${s.name.split(' ')[0]} Lớp 12 (Ôn thi THPT)`,
      progressPct: 0,
      avgScore: 0,
      aiRemark: 'Chưa bắt đầu chương trình học.',
    })),
  },
];
