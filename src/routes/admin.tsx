import { createFileRoute, Outlet, Link, useLocation } from '@tanstack/react-router';

export const Route = createFileRoute('/admin')({
  component: AdminLayout,
});

function AdminLayout() {
  const location = useLocation();


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
        
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
