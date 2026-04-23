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

export const Route = createFileRoute('/admin/tag-rules')({
  component: TagRulesPage,
});

interface Rule {
  id: string;
  tag_name: string;
  hours_value: number;
  active_status: boolean;
  stacking_priority: number;
  notes: string | null;
}

const empty = { tag_name: '', hours_value: 0, active_status: true, stacking_priority: 0, notes: '' };

function TagRulesPage() {
  const [rows, setRows] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [editing, setEditing] = useState<Rule | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await apiFetch('/api/tag-rules')) as Rule[]); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.tag_name.trim()) { toast.error('Tag name required'); return; }
    setBusy(true);
    try {
      const body = {
        tag_name: form.tag_name.trim(),
        hours_value: Number(form.hours_value),
        active_status: form.active_status,
        stacking_priority: Number(form.stacking_priority),
        notes: form.notes || null,
      };
      if (editing) {
        await apiFetch(`/api/tag-rules/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast.success('Updated & recalculated');
      } else {
        await apiFetch('/api/tag-rules', { method: 'POST', body: JSON.stringify(body) });
        toast.success('Created & recalculated');
      }
      setForm({ ...empty }); setEditing(null);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const toggle = async (r: Rule) => {
    setBusy(true);
    try {
      await apiFetch(`/api/tag-rules/${r.id}`, { method: 'PUT', body: JSON.stringify({ active_status: !r.active_status }) });
      toast.success(`${r.tag_name} ${r.active_status ? 'deactivated' : 'activated'}`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const startEdit = (r: Rule) => {
    setEditing(r);
    setForm({
      tag_name: r.tag_name,
      hours_value: Number(r.hours_value),
      active_status: r.active_status,
      stacking_priority: r.stacking_priority,
      notes: r.notes ?? '',
    });
  };

  return (
    <div className="space-y-6">
      <Toaster />
      <div>
        <h2 className="text-2xl font-semibold">Tag Rules</h2>
        <p className="text-sm text-muted-foreground">
          Tag matching is <strong>case-sensitive</strong>. Multiple matching active rules <strong>stack</strong> (sum). Saving recalculates all tickets.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>{editing ? `Edit: ${editing.tag_name}` : 'Add tag rule'}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label>Tag name *</Label><Input value={form.tag_name} onChange={(e) => setForm({ ...form, tag_name: e.target.value })} /></div>
            <div><Label>Hours value</Label><Input type="number" step="0.25" value={form.hours_value} onChange={(e) => setForm({ ...form, hours_value: Number(e.target.value) })} /></div>
            <div><Label>Stacking priority</Label><Input type="number" value={form.stacking_priority} onChange={(e) => setForm({ ...form, stacking_priority: Number(e.target.value) })} /></div>
            <div className="flex items-end gap-2"><Switch checked={form.active_status} onCheckedChange={(v) => setForm({ ...form, active_status: v })} /><Label>Active</Label></div>
            <div className="col-span-2 md:col-span-4"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing ? 'Update' : 'Add'}</Button>
            {editing && <Button variant="outline" onClick={() => { setEditing(null); setForm({ ...empty }); }}>Cancel</Button>}
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-md">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Tag</TableHead><TableHead className="text-right">Hours</TableHead>
            <TableHead className="text-right">Priority</TableHead><TableHead>Status</TableHead>
            <TableHead>Notes</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.tag_name}</TableCell>
                <TableCell className="text-right">{Number(r.hours_value).toFixed(2)}</TableCell>
                <TableCell className="text-right">{r.stacking_priority}</TableCell>
                <TableCell>{r.active_status ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.notes ?? '—'}</TableCell>
                <TableCell className="space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(r)} disabled={busy}>{r.active_status ? 'Deactivate' : 'Activate'}</Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No tag rules.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
