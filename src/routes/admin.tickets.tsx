import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

export const Route = createFileRoute('/admin/tickets')({
  component: TicketsPage,
});

interface Ticket {
  id: string;
  source_system: string;
  external_ticket_id: string;
  company_name: string | null;
  ticket_title: string | null;
  status: string | null;
  type: string | null;
  assigned_name_raw: string | null;
  customer_name: string | null;
  inbox: string | null;
  tags: string[] | null;
  ticket_url: string | null;
  created_at_source: string | null;
  updated_at_source: string | null;
}

function TicketsPage() {
  const [filters, setFilters] = useState({
    source_system: '',
    company_name: '',
    assigned_name_raw: '',
    status: '',
    type: '',
    inbox: '',
    tag: '',
    date_from: '',
    date_to: '',
  });
  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const data = (await apiFetch(`/api/tickets?${params.toString()}`)) as Ticket[];
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const setF = (k: keyof typeof filters, v: string) => setFilters((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <Toaster />
      <div>
        <h2 className="text-2xl font-semibold">Tickets</h2>
        <p className="text-sm text-muted-foreground">Normalized tickets from all enabled sources. Showing up to 200 most recent.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div><Label>Source</Label>
          <select className="w-full h-9 px-2 border rounded-md bg-background" value={filters.source_system} onChange={(e) => setF('source_system', e.target.value)}>
            <option value="">All</option>
            <option value="teamwork">Teamwork</option>
            <option value="teamwork_desk">Teamwork Desk</option>
          </select>
        </div>
        <div><Label>Company</Label><Input value={filters.company_name} onChange={(e) => setF('company_name', e.target.value)} /></div>
        <div><Label>Assigned</Label><Input value={filters.assigned_name_raw} onChange={(e) => setF('assigned_name_raw', e.target.value)} /></div>
        <div><Label>Status</Label><Input value={filters.status} onChange={(e) => setF('status', e.target.value)} /></div>
        <div><Label>Type</Label><Input value={filters.type} onChange={(e) => setF('type', e.target.value)} /></div>
        <div><Label>Inbox</Label><Input value={filters.inbox} onChange={(e) => setF('inbox', e.target.value)} /></div>
        <div><Label>Tag</Label><Input value={filters.tag} onChange={(e) => setF('tag', e.target.value)} /></div>
        <div><Label>Date from</Label><Input type="date" value={filters.date_from} onChange={(e) => setF('date_from', e.target.value)} /></div>
        <div><Label>Date to</Label><Input type="date" value={filters.date_to} onChange={(e) => setF('date_to', e.target.value)} /></div>
        <div className="flex items-end"><Button onClick={load} disabled={loading} className="w-full">{loading ? 'Loading…' : 'Apply'}</Button></div>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Ext ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Inbox</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell><Badge variant="outline">{t.source_system}</Badge></TableCell>
                <TableCell>{t.company_name ?? '—'}</TableCell>
                <TableCell className="font-mono text-xs">{t.external_ticket_id}</TableCell>
                <TableCell className="max-w-xs truncate">{t.ticket_title ?? '—'}</TableCell>
                <TableCell>{t.status ?? '—'}</TableCell>
                <TableCell>{t.type ?? '—'}</TableCell>
                <TableCell>{t.assigned_name_raw ?? '—'}</TableCell>
                <TableCell>{t.customer_name ?? '—'}</TableCell>
                <TableCell>{t.inbox ?? '—'}</TableCell>
                <TableCell className="text-xs">{(t.tags ?? []).join(', ')}</TableCell>
                <TableCell className="text-xs">{t.created_at_source?.slice(0, 10) ?? '—'}</TableCell>
                <TableCell className="text-xs">{t.updated_at_source?.slice(0, 10) ?? '—'}</TableCell>
                <TableCell>{t.ticket_url ? <a className="text-primary underline" href={t.ticket_url} target="_blank" rel="noreferrer">Open</a> : '—'}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">No tickets. Configure an integration and run a sync.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
