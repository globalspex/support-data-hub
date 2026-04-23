import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

export const Route = createFileRoute('/admin/companies')({
  component: CompaniesPage,
});

interface Company {
  id: string;
  source_name: string;
  external_company_id: string | null;
  company_name: string | null;
  account_type: string | null;
  monthly_included_hours: number;
  care_plan_type: string | null;
  active_status: boolean | null;
  notes: string | null;
}

interface Usage {
  company_name: string;
  total_tickets: number;
  total_reportable_hours: number;
  total_labor_cost: number;
  total_billable_value: number;
  monthly_included_hours: number;
  usage_percentage: number | null;
  overage_hours: number;
}

function CompaniesPage() {
  const [rows, setRows] = useState<Company[]>([]);
  const [usage, setUsage] = useState<Map<string, Usage>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState({ account_type: '', monthly_included_hours: 0, care_plan_type: '', notes: '', active_status: true });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, u] = await Promise.all([
        apiFetch('/api/companies'),
        apiFetch('/api/reports/by-company'),
      ]);
      setRows(c as Company[]);
      const map = new Map<string, Usage>();
      for (const row of u as Usage[]) map.set(row.company_name, row);
      setUsage(map);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const startEdit = (c: Company) => {
    setEditing(c);
    setForm({
      account_type: c.account_type ?? '',
      monthly_included_hours: Number(c.monthly_included_hours ?? 0),
      care_plan_type: c.care_plan_type ?? '',
      notes: c.notes ?? '',
      active_status: c.active_status !== false,
    });
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await apiFetch(`/api/companies/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          account_type: form.account_type || null,
          monthly_included_hours: Number(form.monthly_included_hours),
          care_plan_type: form.care_plan_type || null,
          notes: form.notes || null,
          active_status: form.active_status,
        }),
      });
      toast.success('Saved');
      setEditing(null);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <Toaster />
      <div>
        <h2 className="text-2xl font-semibold">Companies</h2>
        <p className="text-sm text-muted-foreground">Set monthly included hours and care plan type per company. Usage is from current sync data.</p>
      </div>

      {editing && (
        <Card>
          <CardHeader><CardTitle>Edit: {editing.company_name}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label>Account type</Label><Input value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} /></div>
              <div><Label>Care plan type</Label><Input value={form.care_plan_type} onChange={(e) => setForm({ ...form, care_plan_type: e.target.value })} /></div>
              <div><Label>Monthly included hours</Label><Input type="number" step="0.5" value={form.monthly_included_hours} onChange={(e) => setForm({ ...form, monthly_included_hours: Number(e.target.value) })} /></div>
              <div className="flex items-end gap-2"><Switch checked={form.active_status} onCheckedChange={(v) => setForm({ ...form, active_status: v })} /><Label>Active</Label></div>
              <div className="col-span-2 md:col-span-4"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Company</TableHead><TableHead>Source</TableHead><TableHead>Account</TableHead>
            <TableHead>Care plan</TableHead><TableHead className="text-right">Included hrs</TableHead>
            <TableHead className="text-right">Used</TableHead><TableHead className="text-right">Usage %</TableHead>
            <TableHead className="text-right">Overage</TableHead><TableHead className="text-right">Labor $</TableHead>
            <TableHead className="text-right">Billable $</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((c) => {
              const u = c.company_name ? usage.get(c.company_name) : undefined;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.company_name ?? '—'}</TableCell>
                  <TableCell><Badge variant="outline">{c.source_name}</Badge></TableCell>
                  <TableCell>{c.account_type ?? '—'}</TableCell>
                  <TableCell>{c.care_plan_type ?? '—'}</TableCell>
                  <TableCell className="text-right">{Number(c.monthly_included_hours ?? 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right">{u ? u.total_reportable_hours.toFixed(1) : '0.0'}</TableCell>
                  <TableCell className="text-right">{u?.usage_percentage !== null && u?.usage_percentage !== undefined ? `${u.usage_percentage}%` : '—'}</TableCell>
                  <TableCell className="text-right">{u ? u.overage_hours.toFixed(1) : '0.0'}</TableCell>
                  <TableCell className="text-right">${(u?.total_labor_cost ?? 0).toFixed(0)}</TableCell>
                  <TableCell className="text-right">${(u?.total_billable_value ?? 0).toFixed(0)}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => startEdit(c)}>Edit</Button></TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No companies. Run a sync.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
