import { useNavigate } from 'react-router-dom';
import { Sparkles, Workflow } from 'lucide-react';
import { scrollToSection } from './scroll';

interface CtaSectionProps {
  hasToken: boolean;
}

export default function CtaSection({ hasToken }: CtaSectionProps) {
  const navigate = useNavigate();

  const startCreating = () => {
    navigate(hasToken ? '/documents' : '/register');
  };

  const exploreWorkflow = () => {
    scrollToSection('#workflow');
  };

  return (
    <section className="lp-cta-bottom" aria-label="Kêu gọi hành động">
      <div className="lp-cta-bottom-inner">
        <h2 className="lp-cta-bottom-title">Sẵn sàng biến học liệu của bạn thành đề kiểm tra?</h2>
        <p className="lp-cta-bottom-desc">
          Bắt đầu với một tài liệu và để EzEdu AI hỗ trợ những bước còn lại.
        </p>
        <div className="lp-cta-actions">
          <button className="lp-btn-cta-white" onClick={startCreating}>
            <Sparkles size={16} aria-hidden="true" /> Tạo đề ngay
          </button>
          <button className="lp-btn-cta-outline" onClick={exploreWorkflow}>
            <Workflow size={16} aria-hidden="true" /> Khám phá quy trình
          </button>
        </div>
      </div>
    </section>
  );
}
