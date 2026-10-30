import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth-context.js';
import { rolePath } from '../utils/role-path.js';
export function ProtectedRoute({ role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p role="status">Checking your session…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={rolePath(user.role)} replace />;
  return <Outlet />;
}
