import { createFileRoute, Outlet, Link, useNavigate, useLocation } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/admin')({
  component: AdminLayout,
});

function AdminLayout() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate({ to: '/login' });
  }, [loading, user, navigate]);

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-xl font-semibold">Admin access required</h1>
          <p className="text-muted-foreground mt-2">Your account does not have the admin role.</p>
          <Button variant="outline" className="mt-4" onClick={() => signOut()}>Sign out</Button>
        </div>
      </div>
    );
  }

  const tabs: Array<{ to: string; label: string; exact?: boolean }> = [
    { to: '/admin', label: 'Dashboard', exact: true },
    { to: '/admin/tickets', label: 'Tickets' },
    { to: '/admin/companies', label: 'Companies' },
    { to: '/admin/team-members', label: 'Team' },
    { to: '/admin/tag-rules', label: 'Tag Rules' },
    { to: '/admin/mappings', label: 'Mappings' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/integrations', label: 'Integrations' },
    { to: '/admin/sync-runs', label: 'Sync Runs' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <h1 className="font-semibold">Ops Dashboard</h1>
            <nav className="flex gap-1">
              {tabs.map((t) => {
                const active = t.exact
                  ? location.pathname === t.to
                  : location.pathname.startsWith(t.to) && t.to !== '/admin';
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    className={`px-3 py-1.5 text-sm rounded-md ${active ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <Button size="sm" variant="outline" onClick={() => signOut()}>Sign out</Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
