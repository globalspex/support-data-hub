import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export const Route = createFileRoute('/admin/')({
  component: DashboardPage,
});

interface Summary {
  total_tickets: number;
  total_actual_hours: number;
  total_tag_hours: number;
  total_reportable_hours: number;
  total_labor_cost: number;
  total_billable_value: number;
  average_hours_per_ticket: number;
}
interface CompanyRow {
  company_name: string;
  total_tickets: number;
  total_reportable_hours: number;
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
interface TrendRow {
  period: string;
  total_tickets: number;
  total_reportable_hours: number;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtHours(n: number) {
  return `${n.toFixed(1)}h`;
}

function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [activeCompanies, setActiveCompanies] = useState(0);
  const [activeMembers, setActiveMembers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c, t, tr, comps, mems] = await Promise.all([
        apiFetch('/api/reports/summary'),
        apiFetch('/api/reports/by-company'),
        apiFetch('/api/reports/by-team-member'),
        apiFetch('/api/reports/trends?granularity=month'),
        apiFetch('/api/companies'),
        apiFetch('/api/team-members'),
      ]);
      setSummary(s as Summary);
      setCompanies(c as CompanyRow[]);
      setTeam(t as TeamRow[]);
      setTrend(tr as TrendRow[]);
      const compsArr = comps as Array<{ active_status: boolean | null }>;
      const memsArr = mems as Array<{ active_status: boolean }>;
      setActiveCompanies(compsArr.filter((x) => x.active_status !== false).length);
      setActiveMembers(memsArr.filter((x) => x.active_status).length);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const recalc = async () => {
    setBusy(true);
    try {
      const r = (await apiFetch('/api/recalculate', { method: 'POST' })) as { processed: number; updated: number; unmapped: number };
      toast.success(`Recalculated ${r.updated}/${r.processed} tickets (${r.unmapped} unmapped)`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const topCompanies = useMemo(() => companies.slice(0, 8), [companies]);
  const topTeam = useMemo(() => team.slice(0, 8), [team]);

  return (
    <div className="space-y-6">
      <Toaster />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">All-time overview across enabled sources.</p>
        </div>
        <Button variant="outline" onClick={recalc} disabled={busy || loading}>
          {busy ? 'Recalculating…' : 'Recalculate Metrics'}
        </Button>
      </div>

      {loading && !summary ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <Kpi label="Total Tickets" value={String(summary?.total_tickets ?? 0)} />
            <Kpi label="Reportable Hours" value={fmtHours(summary?.total_reportable_hours ?? 0)} />
            <Kpi label="Actual Hours" value={fmtHours(summary?.total_actual_hours ?? 0)} />
            <Kpi label="Tag-Based Hours" value={fmtHours(summary?.total_tag_hours ?? 0)} />
            <Kpi label="Avg Hrs / Ticket" value={fmtHours(summary?.average_hours_per_ticket ?? 0)} />
            <Kpi label="Labor Cost" value={fmtMoney(summary?.total_labor_cost ?? 0)} />
            <Kpi label="Billable Value" value={fmtMoney(summary?.total_billable_value ?? 0)} />
            <Kpi label="Active Companies" value={String(activeCompanies)} />
            <Kpi label="Active Team" value={String(activeMembers)} />
          </div>

          <Card>
            <CardHeader><CardTitle>Reportable Hours by Month</CardTitle></CardHeader>
            <CardContent>
              {trend.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">No trend data yet — run a sync.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="period" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Line type="monotone" dataKey="total_reportable_hours" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Top Companies</CardTitle></CardHeader>
              <CardContent>
                {topCompanies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-xs">
                      <tr><th className="text-left py-1">Company</th><th className="text-right">Tickets</th><th className="text-right">Hours</th><th className="text-right">Usage</th></tr>
                    </thead>
                    <tbody>
                      {topCompanies.map((c) => (
                        <tr key={c.company_name} className="border-t">
                          <td className="py-1.5">{c.company_name}</td>
                          <td className="text-right">{c.total_tickets}</td>
                          <td className="text-right">{fmtHours(c.total_reportable_hours)}</td>
                          <td className="text-right">{c.usage_percentage !== null ? `${c.usage_percentage}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Top Team Members</CardTitle></CardHeader>
              <CardContent>
                {topTeam.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-xs">
                      <tr><th className="text-left py-1">Member</th><th className="text-right">Tickets</th><th className="text-right">Hours</th><th className="text-right">Billable</th></tr>
                    </thead>
                    <tbody>
                      {topTeam.map((m) => (
                        <tr key={m.team_member_name} className="border-t">
                          <td className="py-1.5">{m.team_member_name}</td>
                          <td className="text-right">{m.total_tickets}</td>
                          <td className="text-right">{fmtHours(m.total_reportable_hours)}</td>
                          <td className="text-right">{fmtMoney(m.total_billable_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
