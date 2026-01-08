import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api } from '../api/client';
import type { AuthUser } from '@gdkp/shared';

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      console.error('Auth error:', error);
      navigate('/login?error=' + error);
      return;
    }

    if (!token) {
      navigate('/login');
      return;
    }

    // Set token first so API calls work
    useAuthStore.setState({ token });

    // Fetch user data
    api
      .get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        const user = response.data as AuthUser;
        setAuth(user, token);

        // Redirect based on session status
        if (user.session_status === 'APPROVED') {
          navigate('/');
        } else {
          // WAITING status - go to waiting room
          navigate('/waiting-room');
        }
      })
      .catch((err) => {
        console.error('Failed to get user:', err);
        navigate('/login?error=auth_failed');
      });
  }, [searchParams, navigate, setAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold-500 mx-auto"></div>
        <p className="mt-4 text-gray-400">Logging you in...</p>
      </div>
    </div>
  );
}
