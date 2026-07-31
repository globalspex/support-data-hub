import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Ops Dashboard — Tickets, Time & Reporting' },
      { name: 'description', content: 'Manage synced tickets, companies, team members and time reporting in one operations dashboard.' },
      { property: 'og:title', content: 'Ops Dashboard — Tickets, Time & Reporting' },
      { property: 'og:description', content: 'Manage synced tickets, companies, team members and time reporting in one operations dashboard.' },
    ],
  }),
  component: Index,
});

function Index() {
  return <Navigate to="/admin/integrations" />;
}
