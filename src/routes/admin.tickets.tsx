import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { apiFetch } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

const STATUS_OPTIONS = ['active', 'new', 'completed', 'reopened'];

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
  assigned_team_member_id: string | null;
  customer_name: string | null;
  inbox: string | null;
  tags: string[] | null;
  ticket_url: string | null;
  created_at_source: string | null;
  updated_at_source: string | null;
  actual_logged_time: number | null;
  calculated_tag_time: number | null;
  final_reportable_time: number | null;
  labor_cost: number | null;
  billable_value: number | null;
}
interface Member { id: string; name: string; }

function TicketsPage() {
  const [filters, setFilters] = useState<{
    source_system: string; company_name: string; assigned_name_raw: string;
    status: string[]; type: string; inbox: string; tag: string; date_from: string; date_to: string;
  }>({
    source_system: '', company_name: '', assigned_name_raw: '',
    status: [], type: '', inbox: '', tag: '', date_from: '', date_to: '',
  });
  const [rows, setRows] = useState<Ticket[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) m.set(x.id, x.name);
    return m;
  }, [members]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (Array.isArray(v)) { if (v.length) params.set(k, v.join(',')); }
        else if (v) params.set(k, v);
      });
      const [data, mems] = await Promise.all([
        apiFetch(`/api/tickets?${params.toString()}`),
        apiFetch('/api/team-members'),
      ]);
      setRows(data as Ticket[]);
      setMembers((mems as Member[]).map((x) => ({ id: x.id, name: x.name })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const setF = (k: keyof typeof filters, v: string) => setFilters((p) => ({ ...p, [k]: v }));
  const num = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? '—' : Number(n).toFixed(d));
  const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `$${Number(n).toFixed(0)}`);

  return (
    <div className="space-y-6">
      <Toaster />
      <div>
        <h2 className="text-2xl font-semibold">Tickets</h2>
        <p className="text-sm text-muted-foreground">Normalized tickets with calculated time, cost, and billable value. Showing up to 200 most recent.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div><Label>Source</Label>
          <select className="w-full h-9 px-2 border rounded-md bg-background" value={filters.source_system} onChange={(e) => setF('source_system', e.target.value)}>
            <option value="">All</option><option value="teamwork">Teamwork</option><option value="teamwork_desk">Teamwork Desk</option>
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
              <TableHead>Source</TableHead><TableHead>Company</TableHead><TableHead>Ext ID</TableHead>
              <TableHead>Title</TableHead><TableHead>Status</TableHead><TableHead>Type</TableHead>
              <TableHead>Assigned (raw)</TableHead><TableHead>Mapped to</TableHead>
              <TableHead>Customer</TableHead><TableHead>Inbox</TableHead><TableHead>Tags</TableHead>
              <TableHead className="text-right">Actual h</TableHead>
              <TableHead className="text-right">Tag h</TableHead>
              <TableHead className="text-right">Reportable h</TableHead>
              <TableHead className="text-right">Labor</TableHead>
              <TableHead className="text-right">Billable</TableHead>
              <TableHead>Created</TableHead><TableHead>URL</TableHead>
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
                <TableCell>{t.assigned_team_member_id ? (memberMap.get(t.assigned_team_member_id) ?? '—') : <span className="text-muted-foreground italic">unmapped</span>}</TableCell>
                <TableCell>{t.customer_name ?? '—'}</TableCell>
                <TableCell>{t.inbox ?? '—'}</TableCell>
                <TableCell className="text-xs">{(t.tags ?? []).join(', ')}</TableCell>
                <TableCell className="text-right">{num(t.actual_logged_time)}</TableCell>
                <TableCell className="text-right">{num(t.calculated_tag_time)}</TableCell>
                <TableCell className="text-right font-medium">{num(t.final_reportable_time)}</TableCell>
                <TableCell className="text-right">{money(t.labor_cost)}</TableCell>
                <TableCell className="text-right">{money(t.billable_value)}</TableCell>
                <TableCell className="text-xs">{t.created_at_source?.slice(0, 10) ?? '—'}</TableCell>
                <TableCell>{t.ticket_url ? <a className="text-primary underline" href={t.ticket_url} target="_blank" rel="noreferrer">Open</a> : '—'}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={18} className="text-center text-muted-foreground py-8">No tickets. Configure an integration and run a sync.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
