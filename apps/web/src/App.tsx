import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useQuerySocket } from './hooks/useQuerySocket';

// Pages
import { LoginPage } from './pages/Login';
import { AuthCallback } from './pages/AuthCallback';
import { WaitingRoomPage } from './pages/WaitingRoom';
import { Dashboard } from './pages/Dashboard';
import { Raids } from './pages/Raids';
import { RaidRoom } from './pages/RaidRoom';
import { RaidHistory } from './pages/RaidHistory';
import { Profile } from './pages/Profile';
import { Items } from './pages/Items';
import { AliasMappings } from './pages/admin/AliasMappings';
import { GoldManagement } from './pages/admin/GoldManagement';
import { Lobby } from './pages/admin/Lobby';

// Layout
import { MainLayout } from './components/layout/MainLayout';

// Note: Using react-router-dom for simplicity instead of TanStack Router
// Can be migrated later if needed

// Loading spinner component
function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold-500"></div>
    </div>
  );
}

// Route for waiting room - must be WAITING status
function WaitingRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, sessionStatus } = useAuthStore();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If already approved, go to dashboard
  if (sessionStatus === 'APPROVED') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Main protected route - must be APPROVED status
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, sessionStatus } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If waiting for approval, redirect to waiting room
  if (sessionStatus === 'WAITING' && location.pathname !== '/waiting-room') {
    return <Navigate to="/waiting-room" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  // Global socket-to-query cache sync for instant updates
  useQuerySocket();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Waiting room - for users waiting for approval */}
        <Route
          path="/waiting-room"
          element={
            <WaitingRoute>
              <WaitingRoomPage />
            </WaitingRoute>
          }
        />

        {/* Legacy alias setup - redirect to waiting room */}
        <Route path="/setup-alias" element={<Navigate to="/waiting-room" replace />} />

        {/* Protected routes - require APPROVED session status */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="raids" element={<Raids />} />
          <Route path="raids/:id" element={<RaidRoom />} />
          <Route path="items" element={<Items />} />
          <Route path="raid-history" element={<RaidHistory />} />
          <Route path="profile" element={<Profile />} />

          {/* Admin routes */}
          <Route
            path="admin/lobby"
            element={
              <AdminRoute>
                <Lobby />
              </AdminRoute>
            }
          />
          <Route
            path="admin/aliases"
            element={
              <AdminRoute>
                <AliasMappings />
              </AdminRoute>
            }
          />
          <Route
            path="admin/gold"
            element={
              <AdminRoute>
                <GoldManagement />
              </AdminRoute>
            }
          />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
