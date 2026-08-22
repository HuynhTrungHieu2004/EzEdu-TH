// ============================================================
// Dữ liệu mẫu — Học liệu & Tri thức (dành cho học sinh)
// ============================================================

export type MaterialType =
  | 'Bài giảng'
  | 'Giáo trình'
  | 'Chuyên đề'
  | 'Slide bài học'
  | 'Tóm tắt kiến thức'
  | 'Bài đọc tham khảo'
  | 'Video bài giảng'
  | 'Tài liệu PDF';

export type MaterialStatus = 'Chưa xem' | 'Đã xem' | 'Đang học' | 'Đã hoàn thành';

export interface LearningMaterial {
  id: string;
  name: string;
  subject: string;
  topic: string;
  grade: number;
  type: MaterialType;
  description: string;
  author: string;
  updatedAt: string;
  views: number;
  status: MaterialStatus;
  progress: number; // 0–100
  contentSummary: string;
}

export const LEARNING_MATERIALS: LearningMaterial[] = [
  {
    id: 'lm-001',
    name: 'Ôn tập Hàm số bậc nhất',
    subject: 'Toán học',
    topic: 'Hàm số và đồ thị',
    grade: 10,
    type: 'Chuyên đề',
    description: 'Ôn tập khái niệm, tính chất và đồ thị hàm số bậc nhất. Bao gồm các dạng bài tập từ cơ bản đến nâng cao.',
    author: 'ThS. Nguyễn Văn An',
    updatedAt: '2026-08-15',
    views: 312,
    status: 'Đã hoàn thành',
    progress: 100,
    contentSummary:
      'Hàm số bậc nhất y = ax + b (a ≠ 0). Tập xác định: D = ℝ. Đồ thị là đường thẳng cắt trục tung tại điểm (0; b). Hàm đồng biến khi a > 0, nghịch biến khi a < 0. Giao với trục hoành tại điểm (-b/a; 0). Ứng dụng giải bài toán thực tế.',
  },
  {
    id: 'lm-002',
    name: 'Chuyên đề Phương trình và hệ phương trình',
    subject: 'Toán học',
    topic: 'Phương trình – Bất phương trình',
    grade: 10,
    type: 'Chuyên đề',
    description: 'Hệ thống kiến thức phương trình bậc nhất, bậc hai và hệ phương trình bậc nhất hai ẩn. Kèm phương pháp giải và bài tập.',
    author: 'ThS. Nguyễn Văn An',
    updatedAt: '2026-08-10',
    views: 275,
    status: 'Đang học',
    progress: 60,
    contentSummary:
      'Phương trình bậc nhất ax + b = 0. Phương trình bậc hai ax² + bx + c = 0, biệt thức Δ = b² – 4ac. Hệ phương trình bậc nhất hai ẩn: phương pháp thế và cộng đại số. Bài toán thực tế áp dụng hệ phương trình.',
  },
  {
    id: 'lm-003',
    name: 'Tổng hợp công thức Hình học cơ bản',
    subject: 'Toán học',
    topic: 'Hình học phẳng',
    grade: 10,
    type: 'Tóm tắt kiến thức',
    description: 'Tóm tắt toàn bộ công thức hình học phẳng: diện tích, chu vi, tính chất các hình cơ bản dùng trong chương trình lớp 10.',
    author: 'GS. Lê Thị Bình',
    updatedAt: '2026-07-28',
    views: 489,
    status: 'Đã hoàn thành',
    progress: 100,
    contentSummary:
      'Tam giác: S = ½ah; Hình chữ nhật: S = ab; Hình thang: S = ½(a+b)h; Hình tròn: S = πr², C = 2πr. Định lý Pitago, hệ thức lượng trong tam giác vuông. Tỉ số lượng giác: sin, cos, tan, cot.',
  },
  {
    id: 'lm-004',
    name: 'Kỹ năng đọc hiểu văn bản',
    subject: 'Ngữ văn',
    topic: 'Đọc hiểu',
    grade: 10,
    type: 'Bài giảng',
    description: 'Hướng dẫn phương pháp đọc hiểu văn bản theo cấu trúc đề thi mới nhất. Phân tích các dạng câu hỏi và cách trả lời hiệu quả.',
    author: 'ThS. Trần Thị Mai',
    updatedAt: '2026-08-12',
    views: 401,
    status: 'Đã xem',
    progress: 50,
    contentSummary:
      'Xác định phong cách ngôn ngữ: báo chí, nghệ thuật, khoa học, hành chính. Nhận diện phương thức biểu đạt. Phân tích biện pháp tu từ: so sánh, ẩn dụ, hoán dụ, điệp ngữ. Nắm nội dung chính và thông điệp văn bản.',
  },
  {
    id: 'lm-005',
    name: 'Phân tích tác phẩm văn học lớp 10',
    subject: 'Ngữ văn',
    topic: 'Tác phẩm văn học',
    grade: 10,
    type: 'Chuyên đề',
    description: 'Phân tích chi tiết các tác phẩm trọng tâm chương trình Ngữ văn 10: Tấm Cám, Chinh phụ ngâm, thơ Hồ Xuân Hương.',
    author: 'ThS. Trần Thị Mai',
    updatedAt: '2026-08-05',
    views: 334,
    status: 'Chưa xem',
    progress: 0,
    contentSummary:
      'Truyện cổ tích Tấm Cám: xung đột thiện – ác, ý nghĩa nhân văn. Chinh phụ ngâm: nỗi sầu ly biệt, số phận người phụ nữ. Thơ Hồ Xuân Hương: phong cách đặc sắc, tiếng nói phụ nữ thời phong kiến.',
  },
  {
    id: 'lm-006',
    name: 'Ngữ pháp Tiếng Anh cơ bản – Thì động từ',
    subject: 'Tiếng Anh',
    topic: 'Ngữ pháp',
    grade: 10,
    type: 'Giáo trình',
    description: 'Tổng hợp 12 thì trong tiếng Anh với cấu trúc, cách dùng và dấu hiệu nhận biết. Kèm bài tập thực hành.',
    author: 'Ms. Emily Watson',
    updatedAt: '2026-08-18',
    views: 528,
    status: 'Đang học',
    progress: 75,
    contentSummary:
      'Simple Present: S + V(s/es). Simple Past: S + V2. Present Perfect: S + have/has + V3. Future Simple: S + will + V. Present Continuous: S + am/is/are + V-ing. Past Continuous: S + was/were + V-ing. Cách dùng và dấu hiệu nhận biết từng thì.',
  },
  {
    id: 'lm-007',
    name: 'Từ vựng Tiếng Anh theo chủ đề – Unit 1-5',
    subject: 'Tiếng Anh',
    topic: 'Từ vựng',
    grade: 10,
    type: 'Tóm tắt kiến thức',
    description: 'Tổng hợp từ vựng 5 chủ đề đầu: Gia đình, Trường học, Sở thích, Thiên nhiên, Công nghệ. Phiên âm và ví dụ đầy đủ.',
    author: 'Ms. Emily Watson',
    updatedAt: '2026-08-08',
    views: 463,
    status: 'Đã hoàn thành',
    progress: 100,
    contentSummary:
      'Family: nuclear family, extended family, relatives. School: classroom, subject, curriculum, semester. Hobbies: outdoor activities, indoor activities, leisure time. Nature: environment, ecosystem, biodiversity. Technology: device, application, artificial intelligence.',
  },
  {
    id: 'lm-008',
    name: 'Định luật Newton và ứng dụng',
    subject: 'Vật lý',
    topic: 'Cơ học',
    grade: 10,
    type: 'Bài giảng',
    description: 'Ba định luật Newton về chuyển động, phân tích lực và các ứng dụng thực tế trong cuộc sống và kỹ thuật.',
    author: 'GS. Ts. Lê Thị Bình',
    updatedAt: '2026-08-14',
    views: 387,
    status: 'Đã xem',
    progress: 40,
    contentSummary:
      'Định luật I: vật giữ nguyên trạng thái khi không có lực tác dụng (quán tính). Định luật II: F = ma. Định luật III: lực và phản lực bằng nhau, ngược chiều. Ứng dụng: phân tích lực trên mặt phẳng nghiêng, lực ma sát, bài toán chuyển động.',
  },
  {
    id: 'lm-009',
    name: 'Điện học cơ bản – Mạch điện một chiều',
    subject: 'Vật lý',
    topic: 'Điện học',
    grade: 11,
    type: 'Slide bài học',
    description: 'Kiến thức cơ bản về dòng điện một chiều: định luật Ohm, mạch nối tiếp, song song, công và công suất điện.',
    author: 'GS. Ts. Lê Thị Bình',
    updatedAt: '2026-08-02',
    views: 298,
    status: 'Chưa xem',
    progress: 0,
    contentSummary:
      'Cường độ dòng điện I = q/t (A). Định luật Ohm: I = U/R. Đoạn mạch nối tiếp: R = R1 + R2 + ... Đoạn mạch song song: 1/R = 1/R1 + 1/R2 + ... Công điện: A = UIt. Công suất: P = UI = I²R = U²/R.',
  },
  {
    id: 'lm-010',
    name: 'Cấu tạo nguyên tử và bảng tuần hoàn',
    subject: 'Hóa học',
    topic: 'Nguyên tử – Nguyên tố',
    grade: 10,
    type: 'Bài giảng',
    description: 'Cấu tạo nguyên tử, các hạt cơ bản, cấu hình electron và quy luật trong bảng tuần hoàn Mendeleev.',
    author: 'ThS. Trần Minh Đức',
    updatedAt: '2026-08-11',
    views: 356,
    status: 'Đang học',
    progress: 80,
    contentSummary:
      'Nguyên tử gồm hạt nhân (proton, neutron) và lớp vỏ electron. Số hiệu nguyên tử Z = số proton. Cấu hình electron: 1s² 2s² 2p⁶ 3s² 3p⁶... Bảng tuần hoàn: chu kỳ (hàng), nhóm (cột). Tính kim loại giảm, phi kim tăng từ trái sang phải trong cùng chu kỳ.',
  },
  {
    id: 'lm-011',
    name: 'Phản ứng hóa học và cân bằng phương trình',
    subject: 'Hóa học',
    topic: 'Phản ứng hóa học',
    grade: 10,
    type: 'Chuyên đề',
    description: 'Phân loại phản ứng hóa học, cách cân bằng phương trình theo phương pháp đại số và electron. Kèm bài tập áp dụng.',
    author: 'ThS. Trần Minh Đức',
    updatedAt: '2026-07-30',
    views: 241,
    status: 'Chưa xem',
    progress: 0,
    contentSummary:
      'Phân loại: phản ứng hóa hợp, phân hủy, thế, trao đổi, oxi hóa – khử. Bảo toàn khối lượng. Cân bằng phương trình: đếm nguyên tử mỗi nguyên tố. Phản ứng oxi hóa – khử: xác định số oxi hóa, chất khử và chất oxi hóa.',
  },
  {
    id: 'lm-012',
    name: 'Hệ sinh thái và môi trường',
    subject: 'Sinh học',
    topic: 'Sinh thái học',
    grade: 12,
    type: 'Bài đọc tham khảo',
    description: 'Khái niệm hệ sinh thái, chuỗi thức ăn, lưới thức ăn và các mức độ đa dạng sinh học. Tác động của con người đến môi trường.',
    author: 'Cô Võ Thị Mai',
    updatedAt: '2026-08-07',
    views: 195,
    status: 'Đã xem',
    progress: 30,
    contentSummary:
      'Hệ sinh thái: sinh vật + môi trường sống. Chuỗi thức ăn: Cây xanh → Sâu → Chim → Rắn. Lưới thức ăn: nhiều chuỗi thức ăn đan xen. Chu trình vật chất: C, N, nước. Đa dạng sinh học: gen, loài, hệ sinh thái. Ô nhiễm và biến đổi khí hậu.',
  },
  {
    id: 'lm-013',
    name: 'Kiến thức cơ bản về lập trình Pascal/Python',
    subject: 'Tin học',
    topic: 'Lập trình cơ bản',
    grade: 10,
    type: 'Giáo trình',
    description: 'Nhập môn lập trình: biến, kiểu dữ liệu, cấu trúc điều kiện, vòng lặp và hàm trong ngôn ngữ Pascal và Python.',
    author: 'ThS. Phạm Quang Huy',
    updatedAt: '2026-08-16',
    views: 412,
    status: 'Đang học',
    progress: 55,
    contentSummary:
      'Biến và kiểu dữ liệu: Integer, Real, String, Boolean. Câu lệnh gán: a := 5 (Pascal) / a = 5 (Python). Rẽ nhánh: if-then-else. Vòng lặp: for, while. Chương trình con: procedure, function. Python: def, return, print, input.',
  },
  {
    id: 'lm-014',
    name: 'Thuật toán và lưu đồ giải toán',
    subject: 'Tin học',
    topic: 'Thuật toán',
    grade: 10,
    type: 'Slide bài học',
    description: 'Khái niệm thuật toán, cách biểu diễn bằng lưu đồ và ngôn ngữ tự nhiên. Một số thuật toán cơ bản: tìm kiếm, sắp xếp.',
    author: 'ThS. Phạm Quang Huy',
    updatedAt: '2026-08-03',
    views: 267,
    status: 'Chưa xem',
    progress: 0,
    contentSummary:
      'Thuật toán: dãy hữu hạn các bước giải quyết bài toán (tính xác định, tính dừng, tính đúng, tính phổ dụng). Lưu đồ: hình thoi (điều kiện), hình chữ nhật (xử lý), elip (bắt đầu/kết thúc). Thuật toán tìm max, tính tổng, sắp xếp nổi bọt.',
  },
  {
    id: 'lm-015',
    name: 'Kỹ năng sử dụng Internet an toàn',
    subject: 'Tin học',
    topic: 'An toàn thông tin',
    grade: 10,
    type: 'Bài đọc tham khảo',
    description: 'Hướng dẫn sử dụng Internet an toàn cho học sinh: nhận biết thông tin giả mạo, bảo vệ tài khoản cá nhân và ứng xử văn minh trực tuyến.',
    author: 'ThS. Phạm Quang Huy',
    updatedAt: '2026-07-25',
    views: 183,
    status: 'Đã hoàn thành',
    progress: 100,
    contentSummary:
      'Nhận biết Fake News: kiểm tra nguồn, so sánh nhiều nguồn tin. Bảo mật tài khoản: mật khẩu mạnh (≥8 ký tự, chữ hoa, số, ký tự đặc biệt), xác thực 2 bước. Không chia sẻ thông tin cá nhân. Ứng xử văn minh: tôn trọng người khác, không phát tán nội dung độc hại.',
  },
];

// ============================================================
// Dữ liệu mẫu — Tài liệu chương trình (dành cho học sinh)
// ============================================================

export type CurriculumStatus = 'Đang áp dụng' | 'Sắp cập nhật' | 'Tài liệu tham khảo';
export type Semester = 'Học kỳ I' | 'Học kỳ II' | 'Cả năm';

export interface CurriculumDocument {
  id: string;
  name: string;
  subject: string;
  grade: number;
  semester: Semester;
  academicYear: string;
  chapters: number;
  description: string;
  updatedAt: string;
  responsible: string;
  status: CurriculumStatus;
  objectives: string[];
  weeklyHours: number;
}

export const CURRICULUM_DOCUMENTS: CurriculumDocument[] = [
  {
    id: 'cu-001',
    name: 'Chương trình môn Toán lớp 10',
    subject: 'Toán học',
    grade: 10,
    semester: 'Cả năm',
    academicYear: '2026–2027',
    chapters: 8,
    description: 'Tổng hợp nội dung học tập, các chủ đề trọng tâm và yêu cầu cần đạt của môn Toán lớp 10 theo chương trình GDPT 2018.',
    updatedAt: '2026-08-01',
    responsible: 'Tổ Toán – Tin',
    status: 'Đang áp dụng',
    objectives: [
      'Nắm vững các khái niệm hàm số và đồ thị',
      'Giải được phương trình và bất phương trình bậc nhất, bậc hai',
      'Vận dụng hình học phẳng và lượng giác',
      'Phát triển tư duy logic và giải quyết vấn đề',
    ],
    weeklyHours: 4,
  },
  {
    id: 'cu-002',
    name: 'Chương trình môn Ngữ văn lớp 10',
    subject: 'Ngữ văn',
    grade: 10,
    semester: 'Cả năm',
    academicYear: '2026–2027',
    chapters: 10,
    description: 'Nội dung chương trình Ngữ văn 10 bao gồm đọc hiểu văn bản, kiến thức tiếng Việt và viết văn nghị luận, thuyết minh.',
    updatedAt: '2026-08-01',
    responsible: 'Tổ Ngữ văn',
    status: 'Đang áp dụng',
    objectives: [
      'Đọc hiểu văn bản văn học và phi văn học',
      'Phân tích tác phẩm văn học trong chương trình',
      'Viết bài văn nghị luận xã hội và văn học',
      'Nâng cao năng lực sử dụng tiếng Việt',
    ],
    weeklyHours: 4,
  },
  {
    id: 'cu-003',
    name: 'Chương trình môn Tiếng Anh lớp 10',
    subject: 'Tiếng Anh',
    grade: 10,
    semester: 'Cả năm',
    academicYear: '2026–2027',
    chapters: 10,
    description: 'Chương trình Tiếng Anh 10 theo bộ sách Global Success, phát triển đồng đều 4 kỹ năng: Nghe – Nói – Đọc – Viết.',
    updatedAt: '2026-08-01',
    responsible: 'Tổ Ngoại ngữ',
    status: 'Đang áp dụng',
    objectives: [
      'Đạt trình độ A2+ theo khung tham chiếu Châu Âu (CEFR)',
      'Giao tiếp cơ bản trong các tình huống hàng ngày',
      'Nắm vững ngữ pháp và từ vựng theo chủ đề',
      'Đọc hiểu văn bản Tiếng Anh trung cấp',
    ],
    weeklyHours: 3,
  },
  {
    id: 'cu-004',
    name: 'Chương trình môn Vật lý lớp 10',
    subject: 'Vật lý',
    grade: 10,
    semester: 'Cả năm',
    academicYear: '2026–2027',
    chapters: 7,
    description: 'Chương trình Vật lý 10 bao gồm kiến thức cơ học, nhiệt học và các định luật bảo toàn. Gắn kết lý thuyết với thực nghiệm.',
    updatedAt: '2026-08-01',
    responsible: 'Tổ Vật lý',
    status: 'Đang áp dụng',
    objectives: [
      'Hiểu và vận dụng ba định luật Newton',
      'Giải bài toán chuyển động thẳng đều và biến đổi đều',
      'Nắm vững định luật bảo toàn động lượng và năng lượng',
      'Biết thiết kế thí nghiệm vật lý đơn giản',
    ],
    weeklyHours: 3,
  },
  {
    id: 'cu-005',
    name: 'Chương trình môn Hóa học lớp 10',
    subject: 'Hóa học',
    grade: 10,
    semester: 'Cả năm',
    academicYear: '2026–2027',
    chapters: 9,
    description: 'Chương trình Hóa học 10 từ cấu tạo nguyên tử đến bảng tuần hoàn, liên kết hóa học và phản ứng oxi hóa – khử.',
    updatedAt: '2026-08-01',
    responsible: 'Tổ Hóa học',
    status: 'Đang áp dụng',
    objectives: [
      'Hiểu được cấu tạo nguyên tử và bảng tuần hoàn',
      'Phân loại và viết phương trình hóa học',
      'Giải bài tập tính theo phương trình hóa học',
      'Liên hệ kiến thức hóa học với đời sống',
    ],
    weeklyHours: 3,
  },
  {
    id: 'cu-006',
    name: 'Chương trình môn Sinh học lớp 10',
    subject: 'Sinh học',
    grade: 10,
    semester: 'Cả năm',
    academicYear: '2026–2027',
    chapters: 7,
    description: 'Chương trình Sinh học 10 nghiên cứu về tế bào – đơn vị cơ bản của sự sống, trao đổi chất và phân chia tế bào.',
    updatedAt: '2026-08-01',
    responsible: 'Tổ Sinh học',
    status: 'Đang áp dụng',
    objectives: [
      'Nắm vững cấu trúc và chức năng của tế bào',
      'Hiểu quá trình trao đổi chất và năng lượng',
      'Mô tả được quá trình phân chia tế bào',
      'Vận dụng kiến thức vào thực tiễn sức khỏe',
    ],
    weeklyHours: 2,
  },
  {
    id: 'cu-007',
    name: 'Chương trình môn Tin học lớp 10',
    subject: 'Tin học',
    grade: 10,
    semester: 'Cả năm',
    academicYear: '2026–2027',
    chapters: 6,
    description: 'Chương trình Tin học 10 định hướng Khoa học máy tính: thuật toán, lập trình cơ bản và ứng dụng Tin học trong thực tiễn.',
    updatedAt: '2026-08-01',
    responsible: 'Tổ Toán – Tin',
    status: 'Đang áp dụng',
    objectives: [
      'Hiểu khái niệm thuật toán và cách trình bày thuật toán',
      'Lập trình cơ bản bằng Python hoặc Pascal',
      'Sử dụng máy tính và phần mềm văn phòng thành thạo',
      'An toàn thông tin và ứng xử văn minh trên mạng',
    ],
    weeklyHours: 2,
  },
  {
    id: 'cu-008',
    name: 'Kế hoạch học tập Học kỳ I – 2026/2027',
    subject: 'Chung',
    grade: 10,
    semester: 'Học kỳ I',
    academicYear: '2026–2027',
    chapters: 0,
    description: 'Phân phối chương trình chi tiết học kỳ I: lịch học, tuần dạy, bài kiểm tra định kỳ và lịch thi học kỳ cho toàn khối lớp 10.',
    updatedAt: '2026-08-01',
    responsible: 'Ban Giám hiệu',
    status: 'Đang áp dụng',
    objectives: [
      'Hoàn thành 18 tuần học kỳ I',
      'Kiểm tra 1 tiết: tuần 9',
      'Kiểm tra giữa kỳ: tuần 9–10',
      'Thi học kỳ I: tuần 18–19',
    ],
    weeklyHours: 0,
  },
  {
    id: 'cu-009',
    name: 'Kế hoạch học tập Học kỳ II – 2026/2027',
    subject: 'Chung',
    grade: 10,
    semester: 'Học kỳ II',
    academicYear: '2026–2027',
    chapters: 0,
    description: 'Phân phối chương trình chi tiết học kỳ II: lịch học, tuần dạy, lịch thi THPT Quốc gia thử và lịch thi kết thúc năm học.',
    updatedAt: '2026-08-01',
    responsible: 'Ban Giám hiệu',
    status: 'Sắp cập nhật',
    objectives: [
      'Hoàn thành 17 tuần học kỳ II',
      'Kiểm tra giữa kỳ II: tuần 8–9',
      'Ôn tập và kiểm tra cuối năm: tuần 16–17',
    ],
    weeklyHours: 0,
  },
  {
    id: 'cu-010',
    name: 'Nội dung kiểm tra và đánh giá năm học 2026–2027',
    subject: 'Chung',
    grade: 10,
    semester: 'Cả năm',
    academicYear: '2026–2027',
    chapters: 0,
    description: 'Tổng hợp cấu trúc đề kiểm tra, thang điểm, hình thức đánh giá thường xuyên và định kỳ cho toàn bộ các môn học lớp 10.',
    updatedAt: '2026-08-01',
    responsible: 'Ban Giám hiệu',
    status: 'Đang áp dụng',
    objectives: [
      'Đánh giá thường xuyên: hệ số 1 (miệng, 15 phút)',
      'Đánh giá định kỳ: hệ số 2 (45 phút, giữa kỳ)',
      'Thi học kỳ: hệ số 3',
      'Xếp loại học lực theo thông tư 22/2021/TT-BGDĐT',
    ],
    weeklyHours: 0,
  },
];

// ============================================================
// Tiến độ mở rộng 6 môn (Tiến độ tổng quan)
// ============================================================
export const SUBJECT_PROGRESS = [
  { subject: 'Toán học',   color: '#2563eb', percent: 82, icon: '📐', status: 'Đang học'    },
  { subject: 'Ngữ văn',    color: '#7c3aed', percent: 74, icon: '📖', status: 'Đang học'    },
  { subject: 'Tiếng Anh',  color: '#059669', percent: 91, icon: '🌍', status: 'Tốt'         },
  { subject: 'Vật lý',     color: '#d97706', percent: 68, icon: '⚡', status: 'Cần cố gắng' },
  { subject: 'Hóa học',    color: '#dc2626', percent: 55, icon: '🧪', status: 'Cần cố gắng' },
  { subject: 'Tin học',    color: '#0891b2', percent: 88, icon: '💻', status: 'Tốt'         },
];

export const ASSIGNMENT_STATS = { done: 24, doing: 5, pending: 3, total: 32 };
export const MATERIAL_STATS   = { viewed: 18, total: 25 };
export const STUDY_HOURS      = '12 giờ 35 phút';

// ============================================================
// Hoạt động gần đây
// ============================================================
export type ActivityType =
  | 'lesson_done'
  | 'assignment_submit'
  | 'quiz_done'
  | 'material_view'
  | 'class_join'
  | 'score_received'
  | 'achievement'
  | 'notification';

export interface RecentActivity {
  id: string;
  type: ActivityType;
  icon: string;
  title: string;
  detail: string;
  subject?: string;
  time: string;
}

export const RECENT_ACTIVITIES: RecentActivity[] = [
  {
    id: 'act-001',
    type: 'lesson_done',
    icon: '📚',
    title: 'Đã hoàn thành bài học',
    detail: 'Phương trình bậc hai và ứng dụng',
    subject: 'Toán học',
    time: '10 phút trước',
  },
  {
    id: 'act-002',
    type: 'assignment_submit',
    icon: '📝',
    title: 'Đã nộp bài tập',
    detail: 'Unit 5 – Writing & Grammar',
    subject: 'Tiếng Anh',
    time: '30 phút trước',
  },
  {
    id: 'act-003',
    type: 'class_join',
    icon: '📅',
    title: 'Đã tham gia lớp học trực tuyến',
    detail: 'Tiếng Anh – Unit 5: Technology',
    subject: 'Tiếng Anh',
    time: '1 giờ trước',
  },
  {
    id: 'act-004',
    type: 'score_received',
    icon: '⭐',
    title: 'Nhận điểm 9.0',
    detail: 'Bài kiểm tra chương 2 – Cấu trúc dữ liệu',
    subject: 'Tin học',
    time: '2 giờ trước',
  },
  {
    id: 'act-005',
    type: 'material_view',
    icon: '📖',
    title: 'Đã xem tài liệu',
    detail: 'Ngữ pháp Tiếng Anh cơ bản – Thì động từ',
    subject: 'Tiếng Anh',
    time: 'Hôm qua, 20:15',
  },
  {
    id: 'act-006',
    type: 'quiz_done',
    icon: '🎯',
    title: 'Hoàn thành bài kiểm tra',
    detail: 'Định luật Newton và ứng dụng – Đạt 85%',
    subject: 'Vật lý',
    time: 'Hôm qua, 15:30',
  },
  {
    id: 'act-007',
    type: 'achievement',
    icon: '🏆',
    title: 'Đạt thành tích mới',
    detail: 'Hoàn thành 10 bài học liên tiếp',
    time: '2 ngày trước',
  },
  {
    id: 'act-008',
    type: 'lesson_done',
    icon: '📚',
    title: 'Đã hoàn thành bài học',
    detail: 'Cấu tạo nguyên tử và bảng tuần hoàn',
    subject: 'Hóa học',
    time: '2 ngày trước',
  },
];
