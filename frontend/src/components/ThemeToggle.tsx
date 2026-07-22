import { useTheme, type ThemePreference } from '../contexts/ThemeContext';

const OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'light', label: 'Sáng', icon: '☀️' },
  { value: 'dark',  label: 'Tối',  icon: '🌙' },
  { value: 'system', label: 'Hệ thống', icon: '🖥️' },
];

const ThemeToggle = () => {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="theme-toggle"
      role="group"
      aria-label="Chọn giao diện"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          id={`theme-toggle-${opt.value}`}
          aria-pressed={preference === opt.value}
          onClick={() => setPreference(opt.value)}
          className={`theme-toggle-btn${preference === opt.value ? ' theme-toggle-btn--active' : ''}`}
          title={opt.label}
        >
          <span aria-hidden="true">{opt.icon}</span>
          <span className="theme-toggle-label">{opt.label}</span>
        </button>
      ))}
    </div>
  );
};

export default ThemeToggle;
