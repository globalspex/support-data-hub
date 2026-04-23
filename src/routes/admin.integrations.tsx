import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
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
}

const LABELS: Record<string, string> = {
  teamwork: 'Teamwork (Projects)',
  teamwork_desk: 'Teamwork Desk',
};

function IntegrationCard({ row, onChange }: { row: IntegrationRow; onChange: () => void }) {
  const [baseUrl, setBaseUrl] = useState(row.base_url ?? '');
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(row.is_enabled);
  const [busy, setBusy] = useState<string | null>(null);

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
    try {
      const r = (await apiFetch('/api/integrations/sync', {
        method: 'POST',
        body: JSON.stringify({ source_name: row.source_name }),
      })) as { ok: boolean; results: Array<{ received?: number; created?: number; updated?: number; errorCount?: number }> };
      const s = r.results[0];
      toast.success(`Sync done — received ${s?.received ?? 0}, created ${s?.created ?? 0}, updated ${s?.updated ?? 0}, errors ${s?.errorCount ?? 0}`);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
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
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} id={`enabled-${row.source_name}`} />
          <Label htmlFor={`enabled-${row.source_name}`}>Enabled</Label>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>
          <Button variant="outline" onClick={test} disabled={!!busy}>{busy === 'test' ? 'Testing…' : 'Test connection'}</Button>
          <Button variant="secondary" onClick={sync} disabled={!!busy || !row.is_enabled}>{busy === 'sync' ? 'Syncing…' : 'Run sync'}</Button>
        </div>
        <div className="text-xs text-muted-foreground space-y-1 pt-2">
          <div>Last tested: {row.last_tested_at ?? '—'}</div>
          <div>Last sync: {row.last_sync_at ?? '—'}</div>
          {row.notes && <div className="text-destructive">Note: {row.notes}</div>}
        </div>
      </CardContent>
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
        <p className="text-sm text-muted-foreground">Configure source systems, test connections, and trigger manual syncs.</p>
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
