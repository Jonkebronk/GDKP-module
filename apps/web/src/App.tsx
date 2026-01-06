import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';

// Pages
import { LoginPage } from './pages/Login';
import { AuthCallback } from './pages/AuthCallback';
import { AliasSetupPage } from './pages/AliasSetup';
import { Dashboard } from './pages/Dashboard';
import { Wallet } from './pages/Wallet';
import { Raids } from './pages/Raids';
import { RaidRoom } from './pages/RaidRoom';
import { Profile } from './pages/Profile';
import { Items } from './pages/Items';
import { AliasMappings } from './pages/admin/AliasMappings';
import { GoldManagement } from './pages/admin/GoldManagement';

// Layout
import { MainLayout } from './components/layout/MainLayout';

// Note: Using react-router-dom for simplicity instead of TanStack Router
// Can be migrated later if needed

function ProtectedRoute({ children, requireAlias = true }: { children: React.ReactNode; requireAlias?: boolean }) {
  const { isAuthenticated, isLoading, needsAliasSetup } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to alias setup if user hasn't set an alias (except on setup page itself)
  if (requireAlias && needsAliasSetup && location.pathname !== '/setup-alias') {
    return <Navigate to="/setup-alias" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold-500"></div>
      </div>
    );
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

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Alias setup - no alias required */}
        <Route
          path="/setup-alias"
          element={
            <ProtectedRoute requireAlias={false}>
              <AliasSetupPage />
            </ProtectedRoute>
          }
        />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="raids" element={<Raids />} />
          <Route path="raids/:id" element={<RaidRoom />} />
          <Route path="items" element={<Items />} />
          <Route path="profile" element={<Profile />} />

          {/* Admin routes */}
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
