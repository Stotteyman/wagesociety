import { Navigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import type { ReactNode } from 'react';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  if (loading) return <div className="p-16 text-center text-neutral-400">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
