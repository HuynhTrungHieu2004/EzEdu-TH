import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { isAdminAreaRole } from '../utils/adminPermissions';
import type { ReactNode } from 'react';

interface AdminRouteProps {
  children: ReactNode;
}

/**
 * AdminRoute – UX-only guard.
 * The backend is the authoritative authorization layer.
 * This component hides admin pages from non-admin users in the browser,
 * but backend enforces 403 on every request regardless.
 */
export default function AdminRoute({ children }: AdminRouteProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied'>('loading');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    // Always fetch the latest user info to get the most recent role.
    authApi.getMe()
      .then((user) => {
        if (isAdminAreaRole(user.role)) {
          setStatus('allowed');
        } else {
          setStatus('denied');
          navigate('/dashboard', { replace: true });
        }
      })
      .catch(() => {
        navigate('/login', { replace: true });
      });
  }, [navigate]);

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span>Đang xác thực quyền truy cập...</span>
      </div>
    );
  }

  if (status === 'denied') return null;

  return <>{children}</>;
}
