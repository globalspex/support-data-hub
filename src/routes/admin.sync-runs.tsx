import { createFileRoute } from '@tanstack/react-router';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

export const Route = createFileRoute('/admin/sync-runs')({
  component: SyncRunsPage,
});

interface Run {
  id: string;
  source_name: string;
  sync_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  records_received: number | null;
  records_created: number | null;
  records_updated: number | null;
  error_count: number | null;
  error_details: unknown;
}

function SyncRunsPage() {
  const [rows, setRows] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await apiFetch('/api/sync-runs')) as Run[];
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Sync Runs</h2>
          <p className="text-sm text-muted-foreground">History of sync attempts.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Finished</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Created</TableHead>
              <TableHead className="text-right">Updated</TableHead>
              <TableHead className="text-right">Errors</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <TableRow>
                  <TableCell><Badge variant="outline">{r.source_name}</Badge></TableCell>
                  <TableCell>{r.sync_type}</TableCell>
                  <TableCell className="text-xs">{r.started_at}</TableCell>
                  <TableCell className="text-xs">{r.finished_at ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'success' ? 'default' : r.status === 'error' ? 'destructive' : 'secondary'}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{r.records_received ?? 0}</TableCell>
                  <TableCell className="text-right">{r.records_created ?? 0}</TableCell>
                  <TableCell className="text-right">{r.records_updated ?? 0}</TableCell>
                  <TableCell className="text-right">{r.error_count ?? 0}</TableCell>
                  <TableCell>
                    {r.error_details ? (
                      <Button size="sm" variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>
                        {open === r.id ? 'Hide' : 'Show'}
                      </Button>
                    ) : '—'}
                  </TableCell>
                </TableRow>
                {open === r.id && r.error_details && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <pre className="text-xs bg-muted p-3 rounded-md max-h-64 overflow-auto">
                        {JSON.stringify(r.error_details, null, 2)}
                      </pre>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No sync runs yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
