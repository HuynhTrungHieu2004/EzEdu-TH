interface BrandLogoProps {
  ariaLabel: string;
  onClick: () => void;
  logoText?: string;
  logoUrl?: string;
}

export function BrandLogo({ ariaLabel, onClick, logoText = 'EzEdu AI', logoUrl }: BrandLogoProps) {
  const [first = 'EzEdu', second = 'AI'] = logoText.split(/\s+/);
  return (
    <button
      className="lp-logo"
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <span className="lp-logo-icon" aria-hidden="true">
        {logoUrl ? (
          <img src={logoUrl} alt="" width="22" height="22" />
        ) : (
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect x="2" y="1" width="13" height="17" rx="2.5" fill="white" fillOpacity="0.30" />
          <rect x="2" y="1" width="13" height="17" rx="2.5" stroke="white" strokeWidth="1.4" />
          <line x1="5.5" y1="6" x2="11.5" y2="6" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="5.5" y1="9" x2="10" y2="9" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="5.5" y1="12" x2="11.5" y2="12" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="16.5" cy="15.5" r="5" fill="white" fillOpacity="0.20" />
          <circle cx="16.5" cy="15.5" r="5" stroke="white" strokeWidth="1.2" />
          <polyline
            points="13.8,15.5 15.7,17.3 19.2,13.5"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        )}
      </span>
      <span className="lp-logo-name" translate="no">
        {first}
        <span className="lp-logo-badge">{second || 'AI'}</span>
      </span>
    </button>
  );
}

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description: string;
  titleId: string;
}

export function SectionHeading({ eyebrow, title, description, titleId }: SectionHeadingProps) {
  return (
    <div className="lp-section-head">
      <p className="lp-section-eyebrow">{eyebrow}</p>
      <h2 className="lp-section-title" id={titleId}>{title}</h2>
      <p className="lp-section-desc">{description}</p>
    </div>
  );
}
