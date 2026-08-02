/**
 * EzEdu AI — Component nền tảng
 *
 * Đây là điểm nhập duy nhất cho design system. Trang và component nghiệp vụ
 * nên import từ đây: `import { Button, Card } from '../components/ui'`.
 *
 * File này chịu trách nhiệm nạp CSS của toàn bộ primitive — các component
 * riêng lẻ không tự import ui.css để tránh nạp trùng.
 */
import './ui.css';

/* Hành động */
export { Button } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';
export { Spinner } from './Spinner';
export type { SpinnerProps } from './Spinner';

/* Nhập liệu */
export { FormField } from './FormField';
export { useFieldIds } from './useFieldIds';
export { Input } from './Input';
export { Textarea } from './Textarea';
export { Select } from './Select';
export type { SelectOption } from './Select';
export { Checkbox, Radio, RadioCard } from './Choice';
export { Chip, ChipGroup } from './ChipGroup';

/* Hiển thị */
export { Card, CardBody, CardDescription, CardFooter, CardHeader, CardTitle } from './Card';
export { Badge } from './Badge';
export type { BadgeProps, BadgeVariant } from './Badge';
export { Alert } from './Alert';
export type { AlertProps, AlertTone } from './Alert';
export { PageHeader, SectionHeader } from './Headers';
export { StatGrid, StatTile } from './StatTile';
export { ChalkUnderline } from './ChalkUnderline';
export type { ChalkUnderlineProps } from './ChalkUnderline';
export { RedCheckmark } from './RedCheckmark';
export type { RedCheckmarkProps } from './RedCheckmark';
export { ToolCard } from './ToolCard';
export type { ToolCardProps } from './ToolCard';
export { SearchCommand } from './SearchCommand';
export type { SearchCommandProps } from './SearchCommand';
export { ProgressBar, ProgressSteps } from './Progress';
export type { ProgressStep } from './Progress';

/* Lớp nổi */
export { Dialog, DialogFooter } from './Dialog';
export type { DialogProps, DialogSize } from './Dialog';
export { Drawer } from './Drawer';
export type { DrawerProps, DrawerSide } from './Drawer';
export { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from './Dropdown';
export { Tooltip } from './Tooltip';
export type { TooltipProps } from './Tooltip';

/* Điều hướng trong trang */
export { Tabs } from './Tabs';
export type { TabItem, TabsProps } from './Tabs';

/* Phản hồi & trạng thái */
export { ToastProvider, useToast } from './Toast';
export type { ToastInput, ToastTone } from './Toast';
export { Skeleton, SkeletonStack, SkeletonText } from './Skeleton';
export {
  EmptyState,
  ErrorState,
  FeatureDisabledState,
  PermissionDeniedState,
} from './States';

/* Hook dùng chung */
export { useFocusTrap } from './useFocusTrap';
export { useLockBodyScroll } from './useLockBodyScroll';

/* Admin primitives */
export { ConfirmDialog, DataTable, FilterBar, Pagination } from './AdminPrimitives';
export type {
  ConfirmDialogProps,
  DataTableColumn,
  DataTableProps,
  FilterBarProps,
  PaginationProps,
} from './AdminPrimitives';
