import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useQuerySocket } from './hooks/useQuerySocket';

// Build version - must match server version
const BUILD_VERSION = '2026-02-14-v1';
console.log(`%c[GDKP] Build Version: ${BUILD_VERSION}`, 'color: #ffcc00; font-weight: bold');

// Check for new version and reload if needed
async function checkForUpdates() {
  try {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    const res = await fetch(`${apiUrl}/api/version`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.version && data.version !== BUILD_VERSION) {
        console.log(`%c[GDKP] New version available: ${data.version}, reloading...`, 'color: #ff6600; font-weight: bold');
        window.location.reload();
      }
    }
  } catch {
    // Ignore fetch errors
  }
}

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
import { RaidSelection } from './pages/RaidSelection';
import { PreAuctionPage } from './pages/PreAuctionPage';
import { PreAuctionsList } from './pages/PreAuctionsList';
import { WishlistPage } from './pages/WishlistPage';

// Layout
import { MainLayout } from './components/layout/MainLayout';
import { RestrictedLayout } from './components/layout/RestrictedLayout';

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
  const { user, isAuthenticated, isLoading, sessionStatus } = useAuthStore();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If already approved, redirect based on role
  if (sessionStatus === 'APPROVED') {
    // Admins go to dashboard, regular users go to raid selection
    return <Navigate to={user?.role === 'ADMIN' ? '/' : '/raids-select'} replace />;
  }

  return <>{children}</>;
}

// Protected route for ADMIN users - full access
function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, sessionStatus } = useAuthStore();
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

  // Non-admin users should use restricted routes
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/raids-select" replace />;
  }

  return <>{children}</>;
}

// Protected route for regular USER - restricted access
function UserProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, sessionStatus } = useAuthStore();
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

  // Admin users should use full routes
  if (user?.role === 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Legacy ProtectedRoute - for backward compatibility (redirects based on role)
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

// Redirect based on user role
function RoleBasedRedirect() {
  const { user, isAuthenticated, isLoading, sessionStatus } = useAuthStore();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (sessionStatus === 'WAITING') {
    return <Navigate to="/waiting-room" replace />;
  }

  // Admins go to dashboard, regular users go to raid selection
  return <Navigate to={user?.role === 'ADMIN' ? '/' : '/raids-select'} replace />;
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
  const versionChecked = useRef(false);

  // Global socket-to-query cache sync for instant updates
  useQuerySocket();

  useEffect(() => {
    checkAuth();

    // Check for new version on startup (once)
    if (!versionChecked.current) {
      versionChecked.current = true;
      checkForUpdates();
    }

    // Check for updates every 5 minutes
    const interval = setInterval(checkForUpdates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/wishlist" element={<WishlistPage />} />

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

        {/* Restricted routes for regular USER - only raid access */}
        <Route
          path="/raids-select"
          element={
            <UserProtectedRoute>
              <RestrictedLayout />
            </UserProtectedRoute>
          }
        >
          <Route index element={<RaidSelection />} />
        </Route>

        {/* Raid room accessible to both USER and ADMIN */}
        <Route
          path="/raids/:id"
          element={
            <ProtectedRoute>
              <RaidRoom />
            </ProtectedRoute>
          }
        />

        {/* Pre-auction page accessible to both USER and ADMIN */}
        <Route
          path="/raids/:id/pre-auction"
          element={
            <ProtectedRoute>
              <PreAuctionPage />
            </ProtectedRoute>
          }
        />

        {/* Admin-only routes - full dashboard access */}
        <Route
          path="/"
          element={
            <AdminProtectedRoute>
              <MainLayout />
            </AdminProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="raids" element={<Raids />} />
          <Route path="pre-auctions" element={<PreAuctionsList />} />
          <Route path="items" element={<Items />} />
          <Route path="raid-history" element={<RaidHistory />} />
          <Route path="profile" element={<Profile />} />

          {/* Admin pages */}
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

        {/* Fallback - redirect based on role */}
        <Route path="*" element={<RoleBasedRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
