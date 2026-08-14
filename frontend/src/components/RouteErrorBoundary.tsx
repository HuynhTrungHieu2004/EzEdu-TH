import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button, ErrorState } from './ui';

interface RouteErrorBoundaryProps {
  /** Đổi giá trị này (thường là pathname) sẽ reset lỗi khi điều hướng sang trang khác. */
  resetKey: string;
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  failed: boolean;
  resetKey: string;
}

/**
 * Chặn màn hình trắng khi một trang lỗi lúc render.
 *
 * Trước đây app không có error boundary nào: một lỗi render duy nhất — ví dụ
 * `Object.keys(stats.by_action)` khi backend trả thiếu field — làm trắng toàn bộ
 * `#main`, mất cả sidebar, người dùng không còn đường nào ngoài bấm tải lại.
 * Nay khung vẫn còn, nội dung trang được thay bằng ErrorState và người dùng vẫn
 * điều hướng được sang trang khác.
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<RouteErrorBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: RouteErrorBoundaryProps,
    state: RouteErrorBoundaryState,
  ): Partial<RouteErrorBoundaryState> | null {
    // Điều hướng sang route khác thì thử render lại thay vì giữ mãi trạng thái lỗi.
    if (props.resetKey !== state.resetKey) {
      return { failed: false, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Giữ log để còn dò được nguyên nhân; không hiện chi tiết kỹ thuật cho người dùng.
    console.error('[RouteErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <ErrorState
          title="Không mở được nội dung trang này"
          description="Đã có lỗi khi hiển thị dữ liệu. Bạn có thể tải lại, hoặc chuyển sang mục khác ở thanh điều hướng."
          actions={<Button onClick={() => window.location.reload()}>Tải lại trang</Button>}
        />
      );
    }
    return this.props.children;
  }
}
