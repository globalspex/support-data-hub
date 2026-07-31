import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { driveRun, stageLabel } from '@/lib/syncRunner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

export const Route = createFileRoute('/admin/integrations')({
  component: IntegrationsPage,
});

interface IntegrationRow {
  id: string;
  source_name: 'teamwork' | 'teamwork_desk';
  is_enabled: boolean;
  base_url: string | null;
  status: string | null;
  last_tested_at: string | null;
  last_sync_at: string | null;
  notes: string | null;
  has_token: boolean;
  sync_window_days: number | null;
  history_imported_through: string | null;
}

const LABELS: Record<string, string> = {
  teamwork: 'Teamwork (Projects)',
  teamwork_desk: 'Teamwork Desk',
};

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISODate(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function ImportHistoryDialog({ source, open, onOpenChange, onDone }: {
  source: 'teamwork' | 'teamwork_desk';
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [fromDate, setFromDate] = useState(daysAgoISODate(365));
  const [busy, setBusy] = useState(false);

  const [progress, setProgress] = useState<string>('');

  const run = async () => {
    setBusy(true);
    setProgress('Starting…');
    try {
      const started = (await apiFetch('/api/integrations/import-history', {
        method: 'POST',
        body: JSON.stringify({ source_name: source, from_date: fromDate }),
      })) as { runId: string };
      const final = await driveRun(started.runId, (r) =>
        setProgress(`${stageLabel(r.stage)} — ${r.received} received, ${r.created} new`),
      );
      toast.success(`History imported — received ${final.received}, created ${final.created}, updated ${final.updated}`);
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import history — {LABELS[source]}</DialogTitle>
          <DialogDescription>
            One-shot sync that ignores the routine window and pulls everything updated since the date you pick. May take a while for wide ranges.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>From date</Label>
          <Input type="date" value={fromDate} max={todayISODate()} onChange={(e) => setFromDate(e.target.value)} />
          {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
          {busy && <p className="text-xs text-muted-foreground">Keep this tab open until the import finishes.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy || !fromDate}>{busy ? 'Importing…' : 'Run import'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurgeDialog({ source, defaultDays, open, onOpenChange, onDone }: {
  source: 'teamwork' | 'teamwork_desk';
  defaultDays: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [cutoff, setCutoff] = useState(daysAgoISODate(defaultDays));
  const [confirmText, setConfirmText] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<'preview' | 'purge' | null>(null);

  useEffect(() => {
    if (open) {
      setCutoff(daysAgoISODate(defaultDays));
      setConfirmText('');
      setCount(null);
    }
  }, [open, defaultDays]);

  const preview = async () => {
    setBusy('preview');
    try {
      const r = (await apiFetch(`/api/integrations/purge-preview?source_name=${source}&older_than_date=${cutoff}`)) as { count: number };
      setCount(r.count);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const purge = async () => {
    setBusy('purge');
    try {
      const r = (await apiFetch('/api/integrations/purge-old', {
        method: 'POST',
        body: JSON.stringify({ source_name: source, older_than_date: cutoff, confirm: 'PURGE' }),
      })) as { deleted: number };
      toast.success(`Deleted ${r.deleted} ticket${r.deleted === 1 ? '' : 's'}.`);
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Purge old tickets — {LABELS[source]}</DialogTitle>
          <DialogDescription>
            Permanently deletes tickets from this source whose last update is before the cutoff. Companies, mappings, and rules are not touched. Cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Cutoff date (delete tickets older than)</Label>
            <Input type="date" value={cutoff} max={todayISODate()} onChange={(e) => { setCutoff(e.target.value); setCount(null); }} />
          </div>
          <div>
            <Button variant="outline" onClick={preview} disabled={busy !== null || !cutoff}>
              {busy === 'preview' ? 'Counting…' : 'Preview count'}
            </Button>
            {count !== null && (
              <span className="ml-3 text-sm">
                <strong>{count}</strong> ticket{count === 1 ? '' : 's'} would be deleted.
              </span>
            )}
          </div>
          <div className="space-y-2">
            <Label>Type <code>PURGE</code> to confirm</Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="PURGE" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy !== null}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={purge}
            disabled={busy !== null || confirmText !== 'PURGE' || count === null || count === 0}
          >
            {busy === 'purge' ? 'Purging…' : 'Purge tickets'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationCard({ row, onChange }: { row: IntegrationRow; onChange: () => void }) {
  const [baseUrl, setBaseUrl] = useState(row.base_url ?? '');
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(row.is_enabled);
  const [windowDays, setWindowDays] = useState<number>(row.sync_window_days ?? 90);
  const [busy, setBusy] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);

  const save = async () => {
    setBusy('save');
    try {
      await apiFetch('/api/integrations', {
        method: 'POST',
        body: JSON.stringify({
          source_name: row.source_name,
          base_url: baseUrl,
          api_key_or_token: token || undefined,
          is_enabled: enabled,
          sync_window_days: Number(windowDays) || 90,
        }),
      });
      setToken('');
      toast.success('Saved');
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const r = (await apiFetch('/api/integrations/test', {
        method: 'POST',
        body: JSON.stringify({ source_name: row.source_name }),
      })) as { ok: boolean; message: string };
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy('sync');
    setSyncProgress('Starting…');
    try {
      const started = (await apiFetch('/api/integrations/sync', {
        method: 'POST',
        body: JSON.stringify({ source_name: row.source_name }),
      })) as { runs: Array<{ runId: string }> };
      const runId = started.runs?.[0]?.runId;
      if (!runId) throw new Error('No sync run was created');
      const final = await driveRun(runId, (r) =>
        setSyncProgress(`${stageLabel(r.stage)} — ${r.received} received, ${r.created} new, ${r.updated} updated`),
      );
      if (final.status === 'error') toast.error(`Sync failed: ${final.message}`);
      else toast.success(`Sync ${final.status} — received ${final.received}, created ${final.created}, updated ${final.updated}`);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setSyncProgress('');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{LABELS[row.source_name]}</CardTitle>
            <CardDescription>Source: <code>{row.source_name}</code></CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={row.status === 'ok' ? 'default' : row.status === 'error' ? 'destructive' : 'secondary'}>
              {row.status ?? 'unconfigured'}
            </Badge>
            {row.has_token && <Badge variant="outline">token saved</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Base URL</Label>
          <Input
            placeholder="https://yoursite.teamwork.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>API Token {row.has_token && <span className="text-muted-foreground text-xs">(leave blank to keep existing)</span>}</Label>
          <Input
            type="password"
            placeholder={row.has_token ? '••••••••' : 'Paste token'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`window-${row.source_name}`}>Sync window (days)</Label>
            <Input
              id={`window-${row.source_name}`}
              type="number"
              min={1}
              max={3650}
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">Routine syncs only fetch tickets updated in the last N days.</p>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch checked={enabled} onCheckedChange={setEnabled} id={`enabled-${row.source_name}`} />
            <Label htmlFor={`enabled-${row.source_name}`}>Enabled</Label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>
          <Button variant="outline" onClick={test} disabled={!!busy}>{busy === 'test' ? 'Testing…' : 'Test connection'}</Button>
          <Button variant="secondary" onClick={sync} disabled={!!busy || !row.is_enabled}>{busy === 'sync' ? 'Syncing…' : 'Run sync'}</Button>
          <Button variant="outline" onClick={() => setHistoryOpen(true)} disabled={!!busy || !row.is_enabled}>Import history…</Button>
          <Button variant="outline" onClick={() => setPurgeOpen(true)} disabled={!!busy} className="text-destructive hover:text-destructive">Purge old tickets…</Button>
        </div>
        {syncProgress && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div>{syncProgress}</div>
            <p className="mt-1 text-xs text-muted-foreground">Keep this tab open until the sync finishes.</p>
          </div>
        )}
        <div className="text-xs text-muted-foreground space-y-1 pt-2">
          <div>Last tested: {row.last_tested_at ?? '—'}</div>
          <div>Last sync: {row.last_sync_at ?? '—'}</div>
          <div>History imported back to: {row.history_imported_through ? row.history_imported_through.slice(0, 10) : '—'}</div>
          {row.notes && <div className="text-destructive">Note: {row.notes}</div>}
        </div>
      </CardContent>
      <ImportHistoryDialog source={row.source_name} open={historyOpen} onOpenChange={setHistoryOpen} onDone={onChange} />
      <PurgeDialog source={row.source_name} defaultDays={row.sync_window_days ?? 90} open={purgeOpen} onOpenChange={setPurgeOpen} onDone={onChange} />
    </Card>
  );
}

function IntegrationsPage() {
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = (await apiFetch('/api/integrations')) as IntegrationRow[];
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <Toaster />
      <div>
        <h2 className="text-2xl font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">Configure source systems, set the rolling sync window, import history, or purge old tickets.</p>
      </div>
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <IntegrationCard key={r.id} row={r} onChange={load} />
          ))}
        </div>
      )}
    </div>
  );
}
