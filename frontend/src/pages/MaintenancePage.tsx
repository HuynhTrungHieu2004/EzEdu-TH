import React from 'react';

const MaintenancePage: React.FC = () => (
  <div className="page">
    <div className="page-narrow" style={{ textAlign: 'center', paddingTop: '15vh' }}>
      <h2 className="section-title">Hệ thống đang bảo trì</h2>
      <p className="section-subtitle">
        EzEdu AI hiện đang bảo trì để nâng cấp hệ thống. Vui lòng quay lại sau ít phút.
      </p>
      <button type="button" className="btn-primary" onClick={() => window.location.assign('/')}>
        Thử lại
      </button>
    </div>
  </div>
);

export default MaintenancePage;
