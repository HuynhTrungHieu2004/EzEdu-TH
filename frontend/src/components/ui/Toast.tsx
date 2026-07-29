import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Button } from './Button';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastRecord extends ToastInput {
  id: string;
  tone: ToastTone;
}

export interface ToastContextValue {
  /** Hiện một thông báo và trả về id để có thể tự đóng sớm. */
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'success') return <CheckCircle2 aria-hidden="true" />;
  if (tone === 'error') return <AlertCircle aria-hidden="true" />;
  if (tone === 'warning') return <AlertTriangle aria-hidden="true" />;
  return <Info aria-hidden="true" />;
}

export interface ToastProviderProps {
  children: ReactNode;
  duration?: number;
}

export function ToastProvider({
  children,
  duration = 5000,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timeouts = timeoutsRef.current;
    const handle = timeouts.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timeouts.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      counterRef.current += 1;
      const id = `ez-toast-${counterRef.current}`;

      setToasts((current) => [
        ...current,
        { ...input, id, tone: input.tone ?? 'info' },
      ]);

      const handle = setTimeout(() => {
        timeoutsRef.current.delete(id);
        setToasts((current) => current.filter((item) => item.id !== id));
      }, duration);
      timeoutsRef.current.set(id, handle);

      return id;
    },
    [duration],
  );

  // Dọn mọi hẹn giờ còn treo khi provider bị tháo khỏi cây.
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((handle) => clearTimeout(handle));
      timeouts.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toast, dismiss }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="ez-toast-region"
          role="region"
          aria-label="Thông báo"
          aria-live="polite"
        >
          {toasts.map((item) => (
            <div key={item.id} className={`ez-toast ez-toast-${item.tone}`}>
              <ToneIcon tone={item.tone} />
              <div className="ez-toast-content">
                <div className="ez-toast-title">{item.title}</div>
                {item.description ? (
                  <div className="ez-toast-desc">{item.description}</div>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Đóng thông báo"
                onClick={() => dismiss(item.id)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// Provider và hook đi cùng nhau trong một file là chủ ý; chỉ ảnh hưởng fast-refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error(
      'useToast phải được dùng bên trong <ToastProvider>. Hãy bọc ứng dụng bằng <ToastProvider> trước khi gọi useToast().',
    );
  }
  return context;
}
