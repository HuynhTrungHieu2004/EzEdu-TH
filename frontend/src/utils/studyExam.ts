import type { StudyDifficulty } from '../types/chat';

export const STUDY_QUESTION_COUNTS = [5, 10, 15, 20] as const;

export const STUDY_DIFFICULTIES: ReadonlyArray<{
  value: StudyDifficulty;
  label: string;
}> = [
  { value: 'adaptive', label: 'Thích ứng (khuyến nghị)' },
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' },
];
