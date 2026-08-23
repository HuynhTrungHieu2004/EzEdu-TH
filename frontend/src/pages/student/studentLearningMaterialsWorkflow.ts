import type {
  ClassificationInput,
  ReviewFailedStep,
  ReviewStatus,
  TaxonomyNodeType,
  TaxonomyOption,
  ReviewQuestionStyleCounts,
} from '../../api/studentReviewApi';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'pptx']);

export function validateLearningMaterialFile(file: Pick<File, 'name' | 'size'>): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return 'Chỉ hỗ trợ tài liệu PDF, DOCX hoặc PPTX.';
  }
  return file.size > MAX_FILE_SIZE ? 'Dung lượng tài liệu vượt quá 20MB.' : null;
}

type TaxonomyFilter = {
  parentId?: string;
  grade?: number;
  curriculumVersion?: string;
};

function matchesMetadata(option: TaxonomyOption, filter: TaxonomyFilter): boolean {
  return (filter.grade === undefined || option.grade === undefined || option.grade === filter.grade)
    && (
      filter.curriculumVersion === undefined
      || option.curriculumVersion === undefined
      || option.curriculumVersion === filter.curriculumVersion
    );
}

export function filterTaxonomyOptions(
  options: readonly TaxonomyOption[],
  nodeType: TaxonomyNodeType,
  filter: TaxonomyFilter = {},
): TaxonomyOption[] {
  return options.filter((option) => option.nodeType === nodeType
    && (filter.parentId === undefined || option.parentId === filter.parentId)
    && matchesMetadata(option, filter));
}

export function reconcileTaxonomySelection(
  options: readonly TaxonomyOption[],
  selection: ClassificationInput,
): ClassificationInput {
  const subjectIsValid = options.some((option) => option.id === selection.subjectId
    && option.nodeType === 'subject'
    && matchesMetadata(option, selection));
  if (!subjectIsValid) {
    return { ...selection, subjectId: '', chapterId: '', topicIds: [] };
  }

  const chapters = filterTaxonomyOptions(options, 'chapter', {
    parentId: selection.subjectId,
    grade: selection.grade,
    curriculumVersion: selection.curriculumVersion,
  });
  if (!chapters.some((option) => option.id === selection.chapterId)) {
    return { ...selection, chapterId: '', topicIds: [] };
  }

  const topicIds = new Set(filterTaxonomyOptions(options, 'topic', {
    parentId: selection.chapterId,
    grade: selection.grade,
    curriculumVersion: selection.curriculumVersion,
  }).map((option) => option.id));
  return { ...selection, topicIds: selection.topicIds.filter((id) => topicIds.has(id)) };
}

export function shouldPollReview(status: ReviewStatus): boolean {
  return status === 'classifying' || status === 'generating';
}

export function retryLabelForFailedStep(step: ReviewFailedStep | undefined): string | null {
  if (step === 'classification') return 'Thử lại bước phân loại';
  if (step === 'generation') return 'Thử lại tạo bộ đề';
  return null;
}

export function suggestQuestionStyleCounts(
  subjectName: string,
  questionCount: number,
): ReviewQuestionStyleCounts {
  const normalized = subjectName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isCalculationHeavy = /(toan|vat ly|hoa hoc|tin hoc|cong nghe)/.test(normalized);
  const hasSomeCalculation = /dia ly/.test(normalized);
  const calculation = isCalculationHeavy
    ? Math.round(questionCount * 0.5)
    : hasSomeCalculation ? Math.round(questionCount * 0.2) : 0;
  const cloze = Math.round(questionCount * (isCalculationHeavy ? 0.2 : 0.3));
  return { knowledge: questionCount - calculation - cloze, cloze, calculation };
}
