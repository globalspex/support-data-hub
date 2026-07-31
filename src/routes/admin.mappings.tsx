import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

export const Route = createFileRoute('/admin/mappings')({
  component: MappingsPage,
});

interface Member { id: string; name: string; }
interface Mapped {
  id: string;
  source_name: string;
  raw_assigned_name: string | null;
  raw_assigned_id: string | null;
  team_member_id: string | null;
  team_member_name: string | null;
  notes: string | null;
}
interface Unmapped {
  source_name: string;
  raw_assigned_name: string | null;
  raw_assigned_id: string | null;
  ticket_count: number;
}
interface MappingResp {
  mapped: Mapped[];
  unmapped: Unmapped[];
}

const rowKey = (u: Unmapped) =>
  `${u.source_name}::${u.raw_assigned_id ?? ''}::${u.raw_assigned_name ?? ''}`;

function MappingsPage() {
  const [data, setData] = useState<MappingResp>({ mapped: [], unmapped: [] });
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [bulkSelections, setBulkSelections] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, tm] = await Promise.all([
        apiFetch('/api/assigned-mappings?include_unmapped=1'),
        apiFetch('/api/team-members'),
      ]);
      setData(m as MappingResp);
      setMembers((tm as Member[]).map((x) => ({ id: x.id, name: x.name })));
      setBulkSelections({});
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateExisting = async (id: string, team_member_id: string | null) => {
    setBusyKey(id);
    try {
      await apiFetch(`/api/assigned-mappings/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ team_member_id }),
      });
      toast.success('Mapping updated & recalculated');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusyKey(null); }
  };

  const runAutoMap = async () => {
    setAutoBusy(true);
    try {
      const r = await apiFetch('/api/assigned-mappings/auto-map', { method: 'POST' }) as {
        created: number; ambiguous: number; noMatch: number; skippedExisting: number;
      };
      toast.success(`Auto-mapped ${r.created}. ${r.ambiguous} ambiguous, ${r.noMatch} no match.`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setAutoBusy(false); }
  };

  const stagedCount = useMemo(
    () => Object.values(bulkSelections).filter(Boolean).length,
    [bulkSelections],
  );

  const runBootstrap = async () => {
    setBootstrapBusy(true);
    try {
      const r = await apiFetch('/api/team-members/bootstrap', { method: 'POST' }) as {
        members_created: number; mappings_created: number; unmapped: number;
      };
      toast.success(`Created ${r.members_created} team member${r.members_created === 1 ? '' : 's'} and ${r.mappings_created} mapping${r.mappings_created === 1 ? '' : 's'}. Set their rates on the Team Members page.`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBootstrapBusy(false); }
  };

  const saveBulk = async () => {
    const items = data.unmapped
      .map((u) => ({ u, tm: bulkSelections[rowKey(u)] }))
      .filter((x) => !!x.tm)
      .map(({ u, tm }) => ({
        source_name: u.source_name,
        raw_assigned_name: u.raw_assigned_name,
        raw_assigned_id: u.raw_assigned_id,
        team_member_id: tm,
      }));
    if (items.length === 0) return;
    setBulkBusy(true);
    try {
      const r = await apiFetch('/api/assigned-mappings/bulk', {
        method: 'POST',
        body: JSON.stringify({ items }),
      }) as { created: number };
      toast.success(`Saved ${r.created} mapping${r.created === 1 ? '' : 's'} & recalculated.`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBulkBusy(false); }
  };

  return (
    <div className="space-y-6">
      <Toaster />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold">Assigned Name Mappings</h2>
          <p className="text-sm text-muted-foreground">Map raw assignee names from each source to internal team members. Auto-map runs on every sync; use the buttons below to trigger it now or to bulk-map leftovers.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runBootstrap} disabled={autoBusy || bulkBusy || bootstrapBusy}>
            {bootstrapBusy ? 'Creating…' : 'Create team members from assignees'}
          </Button>
          <Button variant="outline" onClick={runAutoMap} disabled={autoBusy || bulkBusy || bootstrapBusy}>
            {autoBusy ? 'Auto-mapping…' : 'Auto-map by name'}
          </Button>
          <Button onClick={saveBulk} disabled={bulkBusy || autoBusy || bootstrapBusy || stagedCount === 0}>
            {bulkBusy ? 'Saving…' : `Save bulk mappings${stagedCount ? ` (${stagedCount})` : ''}`}
          </Button>
        </div>
      </div>

      {members.length === 0 && (
        <Card><CardContent className="py-4 text-sm text-muted-foreground">Add team members first to enable mapping.</CardContent></Card>
      )}

      <Card>
        <CardHeader><CardTitle>Unmapped assignees ({data.unmapped.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-muted-foreground">Loading…</p> : data.unmapped.length === 0 ? (
            <p className="text-sm text-muted-foreground">All assignees are mapped.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">Pick a team member for one or more rows, then click <strong>Save bulk mappings</strong> at the top. Recalculation runs once at the end.</p>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Source</TableHead><TableHead>Raw name</TableHead><TableHead>Raw ID</TableHead>
                  <TableHead className="text-right">Tickets</TableHead><TableHead>Map to</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.unmapped.map((u) => {
                    const key = rowKey(u);
                    return (
                      <TableRow key={key}>
                        <TableCell><Badge variant="outline">{u.source_name}</Badge></TableCell>
                        <TableCell>{u.raw_assigned_name ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{u.raw_assigned_id ?? '—'}</TableCell>
                        <TableCell className="text-right">{u.ticket_count}</TableCell>
                        <TableCell>
                          <select
                            className="h-9 px-2 border rounded-md bg-background text-sm"
                            disabled={members.length === 0 || bulkBusy || autoBusy}
                            value={bulkSelections[key] ?? ''}
                            onChange={(e) => setBulkSelections((prev) => {
                              const next = { ...prev };
                              if (e.target.value) next[key] = e.target.value;
                              else delete next[key];
                              return next;
                            })}
                          >
                            <option value="">Select team member…</option>
                            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mapped ({data.mapped.length})</CardTitle></CardHeader>
        <CardContent>
          {data.mapped.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mappings yet.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Source</TableHead><TableHead>Raw name</TableHead><TableHead>Raw ID</TableHead>
                <TableHead>Mapped to</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.mapped.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell><Badge variant="outline">{m.source_name}</Badge></TableCell>
                    <TableCell>{m.raw_assigned_name ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{m.raw_assigned_id ?? '—'}</TableCell>
                    <TableCell>
                      <select
                        className="h-9 px-2 border rounded-md bg-background text-sm"
                        value={m.team_member_id ?? ''}
                        disabled={busyKey === m.id}
                        onChange={(e) => updateExisting(m.id, e.target.value || null)}
                      >
                        <option value="">— Unmapped —</option>
                        {members.map((mem) => <option key={mem.id} value={mem.id}>{mem.name}</option>)}
                      </select>
                    </TableCell>
                    <TableCell>
                      {!m.team_member_id && <Button size="sm" variant="ghost" onClick={() => updateExisting(m.id, null)}>Clear</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
