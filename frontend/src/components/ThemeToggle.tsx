import { Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTheme, type ThemePreference } from '../contexts/ThemeContext';

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Sáng', icon: Sun },
  { value: 'dark',  label: 'Tối',  icon: Moon },
  { value: 'system', label: 'Hệ thống', icon: Monitor },
];

const ThemeToggle = () => {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="theme-toggle"
      role="group"
      aria-label="Chọn giao diện"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            id={`theme-toggle-${opt.value}`}
            aria-pressed={preference === opt.value}
            onClick={() => setPreference(opt.value)}
            className={`theme-toggle-btn${preference === opt.value ? ' theme-toggle-btn--active' : ''}`}
            title={opt.label}
          >
            <span aria-hidden="true"><Icon size={16} /></span>
            <span className="theme-toggle-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
