import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Settings2, Plus, Upload, Trash2 } from 'lucide-react';
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
  website: string | null;
  airtable_record_id: string | null;
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

type ColumnKey =
  | 'company' | 'website' | 'source' | 'account' | 'care_plan' | 'included'
  | 'used' | 'usage_pct' | 'overage' | 'labor' | 'billable' | 'active' | 'actions';

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'company', label: 'Company' },
  { key: 'website', label: 'Website' },
  { key: 'source', label: 'Source' },
  { key: 'account', label: 'Account' },
  { key: 'care_plan', label: 'Care plan' },
  { key: 'included', label: 'Included hrs' },
  { key: 'used', label: 'Used' },
  { key: 'usage_pct', label: 'Usage %' },
  { key: 'overage', label: 'Overage' },
  { key: 'labor', label: 'Labor $' },
  { key: 'billable', label: 'Billable $' },
  { key: 'active', label: 'Active' },
  { key: 'actions', label: 'Actions' },
];

const STORAGE_KEY = 'companies.visibleColumns.v2';

interface CsvRow { company_name: string; website: string | null; care_plan_type: string | null; active_status: boolean }
interface DiffEntry {
  csv: CsvRow;
  matchedId: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  status: 'update' | 'no_change' | 'create' | 'unmatched';
}
interface DryRunResponse {
  ok: boolean;
  dryRun: boolean;
  summary: { total: number; toUpdate: number; unchanged: number; unmatched: number; toCreate: number };
  diff: DiffEntry[];
}

function CompaniesPage() {
  const [rows, setRows] = useState<Company[]>([]);
  const [usage, setUsage] = useState<Map<string, Usage>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Company | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    account_type: '',
    monthly_included_hours: 0,
    care_plan_type: '',
    website: '',
    notes: '',
    active_status: true,
  });
  const [busy, setBusy] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);

  // Import state
  const fileRef = useRef<HTMLInputElement>(null);
  const [importDiff, setImportDiff] = useState<DryRunResponse | null>(null);
  const [importRows, setImportRows] = useState<CsvRow[]>([]);
  const [createMissing, setCreateMissing] = useState(false);
  const [applying, setApplying] = useState(false);

  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch { /* ignore */ }
    }
    return Object.fromEntries(COLUMNS.map((c) => [c.key, true])) as Record<ColumnKey, boolean>;
  });

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visible)); } catch { /* ignore */ }
  }, [visible]);

  const visibleCount = useMemo(() => Object.values(visible).filter(Boolean).length, [visible]);

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

  const resetForm = () => setForm({
    company_name: '', account_type: '', monthly_included_hours: 0, care_plan_type: '',
    website: '', notes: '', active_status: true,
  });

  const startCreate = () => { resetForm(); setCreating(true); };

  const startEdit = (c: Company) => {
    setEditing(c);
    setForm({
      company_name: c.company_name ?? '',
      account_type: c.account_type ?? '',
      monthly_included_hours: Number(c.monthly_included_hours ?? 0),
      care_plan_type: c.care_plan_type ?? '',
      website: c.website ?? '',
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
          company_name: form.company_name || editing.company_name,
          account_type: form.account_type || null,
          monthly_included_hours: Number(form.monthly_included_hours),
          care_plan_type: form.care_plan_type || null,
          website: form.website || null,
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

  const create = async () => {
    if (!form.company_name.trim()) { toast.error('Company name is required'); return; }
    setBusy(true);
    try {
      await apiFetch('/api/companies', {
        method: 'POST',
        body: JSON.stringify({
          company_name: form.company_name.trim(),
          account_type: form.account_type || null,
          monthly_included_hours: Number(form.monthly_included_hours),
          care_plan_type: form.care_plan_type || null,
          website: form.website || null,
          notes: form.notes || null,
          active_status: form.active_status,
        }),
      });
      toast.success('Company created');
      setCreating(false);
      resetForm();
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const remove = async (c: Company) => {
    if (!confirm(`Delete "${c.company_name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/companies/${c.id}`, { method: 'DELETE' });
      toast.success('Deleted');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  const toggleActive = async (c: Company) => {
    try {
      await apiFetch(`/api/companies/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active_status: c.active_status === false }),
      });
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  const onCsvChosen = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        const parsed: CsvRow[] = [];
        for (const r of result.data) {
          const name = (r['Company'] ?? r['company'] ?? r['Company Name'] ?? '').trim();
          if (!name) continue;
          const website = (r['Websites'] ?? r['Website'] ?? r['website'] ?? '').trim() || null;
          const carePlan = (r['Care Plan'] ?? r['care_plan'] ?? '').trim() || null;
          const statusStr = (r['Active-Inactive'] ?? r['Status'] ?? r['active'] ?? 'Active').trim().toLowerCase();
          parsed.push({
            company_name: name,
            website,
            care_plan_type: carePlan,
            active_status: statusStr === 'active' || statusStr === 'true' || statusStr === '1',
          });
        }
        if (parsed.length === 0) { toast.error('No valid rows found in CSV'); return; }
        setImportRows(parsed);
        try {
          const res = await apiFetch('/api/companies/import', {
            method: 'POST',
            body: JSON.stringify({ rows: parsed, createMissing: false }),
          }) as DryRunResponse;
          setImportDiff(res);
        } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
      },
      error: (err) => toast.error(`CSV parse error: ${err.message}`),
    });
  };

  const applyImport = async () => {
    setApplying(true);
    try {
      const res = await apiFetch('/api/companies/import', {
        method: 'POST',
        body: JSON.stringify({ rows: importRows, confirm: true, createMissing }),
      }) as { applied: boolean; summary: { updated: number; created: number; errors: number } };
      toast.success(`Imported: ${res.summary.updated} updated, ${res.summary.created} created${res.summary.errors ? `, ${res.summary.errors} errors` : ''}`);
      setImportDiff(null);
      setImportRows([]);
      setCreateMissing(false);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setApplying(false); }
  };

  // Re-run dry-run when createMissing toggles
  useEffect(() => {
    if (!importDiff || importRows.length === 0) return;
    (async () => {
      try {
        const res = await apiFetch('/api/companies/import', {
          method: 'POST',
          body: JSON.stringify({ rows: importRows, createMissing }),
        }) as DryRunResponse;
        setImportDiff(res);
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createMissing]);

  const isOn = (k: ColumnKey) => visible[k];

  const filteredRows = useMemo(
    () => (activeOnly ? rows.filter((r) => r.active_status !== false) : rows),
    [rows, activeOnly],
  );

  return (
    <div className="space-y-6">
      <Toaster />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Companies</h2>
          <p className="text-sm text-muted-foreground">Manage company records, care plans, and monthly included hours.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <Switch id="active-only" checked={activeOnly} onCheckedChange={setActiveOnly} />
            <Label htmlFor="active-only" className="text-sm">Active only</Label>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onCsvChosen(f);
              e.target.value = '';
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />Import CSV
          </Button>
          <Button size="sm" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2" />New company
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="h-4 w-4 mr-2" />
                Columns ({visibleCount}/{COLUMNS.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={visible[c.key]}
                  onCheckedChange={(v) => setVisible((prev) => ({ ...prev, [c.key]: Boolean(v) }))}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setVisible(Object.fromEntries(COLUMNS.map((c) => [c.key, true])) as Record<ColumnKey, boolean>)}
                >
                  Show all
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Edit existing */}
      {editing && (
        <Card>
          <CardHeader><CardTitle>Edit: {editing.company_name}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2"><Label>Company name</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
              <div><Label>Account type</Label><Input value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} /></div>
              <div><Label>Care plan type</Label><Input value={form.care_plan_type} onChange={(e) => setForm({ ...form, care_plan_type: e.target.value })} /></div>
              <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="example.com" /></div>
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

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={(v) => { setCreating(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New company</DialogTitle>
            <DialogDescription>Add a customer manually.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Company name *</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
            <div><Label>Account type</Label><Input value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} /></div>
            <div><Label>Care plan type</Label><Input value={form.care_plan_type} onChange={(e) => setForm({ ...form, care_plan_type: e.target.value })} /></div>
            <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="example.com" /></div>
            <div><Label>Monthly included hours</Label><Input type="number" step="0.5" value={form.monthly_included_hours} onChange={(e) => setForm({ ...form, monthly_included_hours: Number(e.target.value) })} /></div>
            <div className="flex items-end gap-2"><Switch checked={form.active_status} onCheckedChange={(v) => setForm({ ...form, active_status: v })} /><Label>Active</Label></div>
            <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import preview dialog */}
      <Dialog open={!!importDiff} onOpenChange={(v) => { if (!v) { setImportDiff(null); setImportRows([]); setCreateMissing(false); } }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Import preview</DialogTitle>
            <DialogDescription>Review changes before applying. Matched by company name (case-insensitive).</DialogDescription>
          </DialogHeader>
          {importDiff && (
            <>
              <div className="grid grid-cols-5 gap-2 text-sm">
                <div className="border rounded p-2"><div className="text-muted-foreground">Total rows</div><div className="text-lg font-semibold">{importDiff.summary.total}</div></div>
                <div className="border rounded p-2"><div className="text-muted-foreground">Will update</div><div className="text-lg font-semibold text-primary">{importDiff.summary.toUpdate}</div></div>
                <div className="border rounded p-2"><div className="text-muted-foreground">Unchanged</div><div className="text-lg font-semibold">{importDiff.summary.unchanged}</div></div>
                <div className="border rounded p-2"><div className="text-muted-foreground">Unmatched</div><div className="text-lg font-semibold">{importDiff.summary.unmatched}</div></div>
                <div className="border rounded p-2"><div className="text-muted-foreground">Will create</div><div className="text-lg font-semibold">{importDiff.summary.toCreate}</div></div>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="create-missing" checked={createMissing} onCheckedChange={setCreateMissing} />
                <Label htmlFor="create-missing" className="text-sm">Create unmatched rows as new companies</Label>
              </div>
              <div className="overflow-auto border rounded">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Company (CSV)</TableHead>
                    <TableHead>Changes</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {importDiff.diff.slice(0, 500).map((d, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {d.status === 'update' && <Badge>Update</Badge>}
                          {d.status === 'create' && <Badge variant="secondary">Create</Badge>}
                          {d.status === 'unmatched' && <Badge variant="outline">Unmatched</Badge>}
                          {d.status === 'no_change' && <Badge variant="outline">No change</Badge>}
                        </TableCell>
                        <TableCell className="text-sm">{d.csv.company_name}</TableCell>
                        <TableCell className="text-xs">
                          {d.status === 'update' ? (
                            <ul className="space-y-0.5">
                              {Object.entries(d.changes).map(([k, v]) => (
                                <li key={k}><span className="font-mono">{k}</span>: <span className="text-muted-foreground">{String(v.from ?? '∅')}</span> → <span className="text-foreground">{String(v.to ?? '∅')}</span></li>
                              ))}
                            </ul>
                          ) : d.status === 'create' || d.status === 'unmatched' ? (
                            <span className="text-muted-foreground">website: {d.csv.website ?? '∅'} · plan: {d.csv.care_plan_type ?? '∅'} · {d.csv.active_status ? 'Active' : 'Inactive'}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {importDiff.diff.length > 500 && (
                  <div className="p-2 text-xs text-muted-foreground text-center">Showing first 500 of {importDiff.diff.length} rows.</div>
                )}
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportDiff(null); setImportRows([]); }}>Cancel</Button>
            <Button onClick={applyImport} disabled={applying}>{applying ? 'Applying…' : 'Apply changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            {isOn('company') && <TableHead>Company</TableHead>}
            {isOn('website') && <TableHead>Website</TableHead>}
            {isOn('source') && <TableHead>Source</TableHead>}
            {isOn('account') && <TableHead>Account</TableHead>}
            {isOn('care_plan') && <TableHead>Care plan</TableHead>}
            {isOn('included') && <TableHead className="text-right">Included hrs</TableHead>}
            {isOn('used') && <TableHead className="text-right">Used</TableHead>}
            {isOn('usage_pct') && <TableHead className="text-right">Usage %</TableHead>}
            {isOn('overage') && <TableHead className="text-right">Overage</TableHead>}
            {isOn('labor') && <TableHead className="text-right">Labor $</TableHead>}
            {isOn('billable') && <TableHead className="text-right">Billable $</TableHead>}
            {isOn('active') && <TableHead>Active</TableHead>}
            {isOn('actions') && <TableHead></TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {filteredRows.map((c) => {
              const u = c.company_name ? usage.get(c.company_name) : undefined;
              return (
                <TableRow key={c.id}>
                  {isOn('company') && <TableCell className="font-medium">{c.company_name ?? '—'}</TableCell>}
                  {isOn('website') && (
                    <TableCell>
                      {c.website ? (
                        <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.website}</a>
                      ) : '—'}
                    </TableCell>
                  )}
                  {isOn('source') && <TableCell><Badge variant="outline">{c.source_name}</Badge></TableCell>}
                  {isOn('account') && <TableCell>{c.account_type ?? '—'}</TableCell>}
                  {isOn('care_plan') && <TableCell>{c.care_plan_type ?? '—'}</TableCell>}
                  {isOn('included') && <TableCell className="text-right">{Number(c.monthly_included_hours ?? 0).toFixed(1)}</TableCell>}
                  {isOn('used') && <TableCell className="text-right">{u ? u.total_reportable_hours.toFixed(1) : '0.0'}</TableCell>}
                  {isOn('usage_pct') && <TableCell className="text-right">{u?.usage_percentage !== null && u?.usage_percentage !== undefined ? `${u.usage_percentage}%` : '—'}</TableCell>}
                  {isOn('overage') && <TableCell className="text-right">{u ? u.overage_hours.toFixed(1) : '0.0'}</TableCell>}
                  {isOn('labor') && <TableCell className="text-right">${(u?.total_labor_cost ?? 0).toFixed(0)}</TableCell>}
                  {isOn('billable') && <TableCell className="text-right">${(u?.total_billable_value ?? 0).toFixed(0)}</TableCell>}
                  {isOn('active') && (
                    <TableCell>
                      <button onClick={() => toggleActive(c)} className="cursor-pointer">
                        {c.active_status === false ? <Badge variant="outline">Inactive</Badge> : <Badge>Active</Badge>}
                      </button>
                    </TableCell>
                  )}
                  {isOn('actions') && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(c)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(c)} title="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {filteredRows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={visibleCount} className="text-center text-muted-foreground py-8">No companies. Click "New company" or "Import CSV".</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
