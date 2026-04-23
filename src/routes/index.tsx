import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useAuth } from '@/lib/auth';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  return <Navigate to={user ? '/admin/integrations' : '/login'} />;
}
