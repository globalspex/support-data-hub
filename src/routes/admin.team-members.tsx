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

export const Route = createFileRoute('/admin/team-members')({
  component: TeamMembersPage,
});

interface Member {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  hourly_cost_rate: number;
  billable_rate: number;
  active_status: boolean;
  notes: string | null;
}

const empty = { name: '', role: '', department: '', hourly_cost_rate: 0, billable_rate: 0, active_status: true, notes: '' };

function TeamMembersPage() {
  const [rows, setRows] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [editing, setEditing] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await apiFetch('/api/team-members')) as Member[];
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setBusy(true);
    try {
      if (editing) {
        await apiFetch(`/api/team-members/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: form.name,
            role: form.role || null,
            department: form.department || null,
            hourly_cost_rate: Number(form.hourly_cost_rate),
            billable_rate: Number(form.billable_rate),
            active_status: form.active_status,
            notes: form.notes || null,
          }),
        });
        toast.success('Updated');
      } else {
        await apiFetch('/api/team-members', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            role: form.role || null,
            department: form.department || null,
            hourly_cost_rate: Number(form.hourly_cost_rate),
            billable_rate: Number(form.billable_rate),
            active_status: form.active_status,
            notes: form.notes || null,
          }),
        });
        toast.success('Created');
      }
      setForm({ ...empty });
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (m: Member) => {
    setEditing(m);
    setForm({
      name: m.name,
      role: m.role ?? '',
      department: m.department ?? '',
      hourly_cost_rate: Number(m.hourly_cost_rate),
      billable_rate: Number(m.billable_rate),
      active_status: m.active_status,
      notes: m.notes ?? '',
    });
  };

  return (
    <div className="space-y-6">
      <Toaster />
      <div>
        <h2 className="text-2xl font-semibold">Team Members</h2>
        <p className="text-sm text-muted-foreground">Hourly cost and billable rates drive labor cost and billable value.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>{editing ? `Edit: ${editing.name}` : 'Add team member'}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Role</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
            <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
            <div><Label>Hourly cost ($)</Label><Input type="number" step="0.01" value={form.hourly_cost_rate} onChange={(e) => setForm({ ...form, hourly_cost_rate: Number(e.target.value) })} /></div>
            <div><Label>Billable rate ($)</Label><Input type="number" step="0.01" value={form.billable_rate} onChange={(e) => setForm({ ...form, billable_rate: Number(e.target.value) })} /></div>
            <div className="flex items-end gap-2"><Switch checked={form.active_status} onCheckedChange={(v) => setForm({ ...form, active_status: v })} /><Label>Active</Label></div>
            <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing ? 'Update' : 'Add'}</Button>
            {editing && <Button variant="outline" onClick={() => { setEditing(null); setForm({ ...empty }); }}>Cancel</Button>}
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Department</TableHead>
              <TableHead className="text-right">Cost / hr</TableHead><TableHead className="text-right">Billable / hr</TableHead>
              <TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell>{m.role ?? '—'}</TableCell>
                <TableCell>{m.department ?? '—'}</TableCell>
                <TableCell className="text-right">${Number(m.hourly_cost_rate).toFixed(2)}</TableCell>
                <TableCell className="text-right">${Number(m.billable_rate).toFixed(2)}</TableCell>
                <TableCell>{m.active_status ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => startEdit(m)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No team members yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
