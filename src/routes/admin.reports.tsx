import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

export const Route = createFileRoute('/admin/reports')({
  component: ReportsPage,
});

interface CompanyRow {
  company_name: string;
  total_tickets: number;
  total_reportable_hours: number;
  total_labor_cost: number;
  total_billable_value: number;
  monthly_included_hours: number;
  overage_hours: number;
  usage_percentage: number | null;
}
interface TeamRow {
  team_member_name: string;
  total_tickets: number;
  total_reportable_hours: number;
  total_labor_cost: number;
  total_billable_value: number;
}
interface SettingsRow { reportable_time_mode: string; }
interface Member { id: string; name: string; }

function downloadCSV(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const escape = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const [filters, setFilters] = useState({
    company: '', assigned_team_member: '', source_system: '',
    status: '', type: '', inbox: '', tag: '', date_from: '', date_to: '', month: '', year: '',
  });
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingMode, setSavingMode] = useState(false);

  const buildQS = useCallback(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQS();
      const [c, t, s, m] = await Promise.all([
        apiFetch(`/api/reports/by-company?${qs}`),
        apiFetch(`/api/reports/by-team-member?${qs}`),
        apiFetch('/api/reporting-settings'),
        apiFetch('/api/team-members'),
      ]);
      setCompanies(c as CompanyRow[]);
      setTeam(t as TeamRow[]);
      setSettings(s as SettingsRow | null);
      setMembers((m as Member[]).map((x) => ({ id: x.id, name: x.name })));
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [buildQS]);

  useEffect(() => { load(); }, [load]);

  const setF = (k: keyof typeof filters, v: string) => setFilters((p) => ({ ...p, [k]: v }));

  const updateMode = async (mode: string) => {
    setSavingMode(true);
    try {
      await apiFetch('/api/reporting-settings', {
        method: 'PUT',
        body: JSON.stringify({ reportable_time_mode: mode }),
      });
      toast.success('Mode updated & all tickets recalculated');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setSavingMode(false); }
  };

  return (
    <div className="space-y-6">
      <Toaster />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Reports</h2>
          <p className="text-sm text-muted-foreground">Filtered totals by company and team member. Export to CSV.</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Reportable time mode</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <select
              className="h-9 px-2 border rounded-md bg-background text-sm"
              value={settings?.reportable_time_mode ?? 'greater_of_actual_or_tag'}
              disabled={savingMode}
              onChange={(e) => updateMode(e.target.value)}
            >
              <option value="actual_only">actual_only</option>
              <option value="tag_only">tag_only</option>
              <option value="greater_of_actual_or_tag">greater_of_actual_or_tag (default)</option>
              <option value="actual_plus_tag">actual_plus_tag</option>
            </select>
            <span className="text-xs text-muted-foreground">Changing this triggers a full recalculation.</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div><Label>Company</Label><Input value={filters.company} onChange={(e) => setF('company', e.target.value)} /></div>
            <div>
              <Label>Team member</Label>
              <select className="w-full h-9 px-2 border rounded-md bg-background text-sm" value={filters.assigned_team_member} onChange={(e) => setF('assigned_team_member', e.target.value)}>
                <option value="">All</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Source</Label>
              <select className="w-full h-9 px-2 border rounded-md bg-background text-sm" value={filters.source_system} onChange={(e) => setF('source_system', e.target.value)}>
                <option value="">All</option><option value="teamwork">Teamwork</option><option value="teamwork_desk">Teamwork Desk</option>
              </select>
            </div>
            <div><Label>Status</Label><Input value={filters.status} onChange={(e) => setF('status', e.target.value)} /></div>
            <div><Label>Type</Label><Input value={filters.type} onChange={(e) => setF('type', e.target.value)} /></div>
            <div><Label>Inbox</Label><Input value={filters.inbox} onChange={(e) => setF('inbox', e.target.value)} /></div>
            <div><Label>Tag</Label><Input value={filters.tag} onChange={(e) => setF('tag', e.target.value)} /></div>
            <div><Label>Date from</Label><Input type="date" value={filters.date_from} onChange={(e) => setF('date_from', e.target.value)} /></div>
            <div><Label>Date to</Label><Input type="date" value={filters.date_to} onChange={(e) => setF('date_to', e.target.value)} /></div>
            <div><Label>Month (1-12)</Label><Input type="number" min={1} max={12} value={filters.month} onChange={(e) => setF('month', e.target.value)} /></div>
            <div><Label>Year</Label><Input type="number" value={filters.year} onChange={(e) => setF('year', e.target.value)} /></div>
            <div className="flex items-end"><Button onClick={load} disabled={loading} className="w-full">{loading ? 'Loading…' : 'Apply'}</Button></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>By Company ({companies.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => downloadCSV('report-by-company.csv',
            ['company','tickets','reportable_hours','included','overage','usage_pct','labor_cost','billable_value'],
            companies.map((c) => [c.company_name, c.total_tickets, c.total_reportable_hours, c.monthly_included_hours, c.overage_hours, c.usage_percentage, c.total_labor_cost, c.total_billable_value]))}>
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Company</TableHead><TableHead className="text-right">Tickets</TableHead>
              <TableHead className="text-right">Hours</TableHead><TableHead className="text-right">Included</TableHead>
              <TableHead className="text-right">Overage</TableHead><TableHead className="text-right">Usage</TableHead>
              <TableHead className="text-right">Labor</TableHead><TableHead className="text-right">Billable</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.company_name}>
                  <TableCell>{c.company_name}</TableCell>
                  <TableCell className="text-right">{c.total_tickets}</TableCell>
                  <TableCell className="text-right">{c.total_reportable_hours.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{c.monthly_included_hours.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{c.overage_hours.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{c.usage_percentage !== null ? `${c.usage_percentage}%` : '—'}</TableCell>
                  <TableCell className="text-right">${c.total_labor_cost.toFixed(0)}</TableCell>
                  <TableCell className="text-right">${c.total_billable_value.toFixed(0)}</TableCell>
                </TableRow>
              ))}
              {companies.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No data.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>By Team Member ({team.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => downloadCSV('report-by-team.csv',
            ['team_member','tickets','reportable_hours','labor_cost','billable_value'],
            team.map((t) => [t.team_member_name, t.total_tickets, t.total_reportable_hours, t.total_labor_cost, t.total_billable_value]))}>
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Member</TableHead><TableHead className="text-right">Tickets</TableHead>
              <TableHead className="text-right">Hours</TableHead><TableHead className="text-right">Labor</TableHead>
              <TableHead className="text-right">Billable</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {team.map((t) => (
                <TableRow key={t.team_member_name}>
                  <TableCell>{t.team_member_name}</TableCell>
                  <TableCell className="text-right">{t.total_tickets}</TableCell>
                  <TableCell className="text-right">{t.total_reportable_hours.toFixed(1)}</TableCell>
                  <TableCell className="text-right">${t.total_labor_cost.toFixed(0)}</TableCell>
                  <TableCell className="text-right">${t.total_billable_value.toFixed(0)}</TableCell>
                </TableRow>
              ))}
              {team.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No data.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
