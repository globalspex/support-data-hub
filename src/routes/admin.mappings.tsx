import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
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

function MappingsPage() {
  const [data, setData] = useState<MappingResp>({ mapped: [], unmapped: [] });
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, tm] = await Promise.all([
        apiFetch('/api/assigned-mappings?include_unmapped=1'),
        apiFetch('/api/team-members'),
      ]);
      setData(m as MappingResp);
      setMembers((tm as Member[]).map((x) => ({ id: x.id, name: x.name })));
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

  const createMapping = async (u: Unmapped, team_member_id: string) => {
    const key = `${u.source_name}::${u.raw_assigned_id ?? u.raw_assigned_name}`;
    setBusyKey(key);
    try {
      await apiFetch('/api/assigned-mappings', {
        method: 'POST',
        body: JSON.stringify({
          source_name: u.source_name,
          raw_assigned_name: u.raw_assigned_name,
          raw_assigned_id: u.raw_assigned_id,
          team_member_id,
        }),
      });
      toast.success('Mapped & recalculated');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusyKey(null); }
  };

  return (
    <div className="space-y-6">
      <Toaster />
      <div>
        <h2 className="text-2xl font-semibold">Assigned Name Mappings</h2>
        <p className="text-sm text-muted-foreground">Map raw assignee names from each source to internal team members. Multiple raw names may map to one member.</p>
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
            <Table>
              <TableHeader><TableRow>
                <TableHead>Source</TableHead><TableHead>Raw name</TableHead><TableHead>Raw ID</TableHead>
                <TableHead className="text-right">Tickets</TableHead><TableHead>Map to</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.unmapped.map((u) => {
                  const key = `${u.source_name}::${u.raw_assigned_id ?? u.raw_assigned_name}`;
                  return (
                    <TableRow key={key}>
                      <TableCell><Badge variant="outline">{u.source_name}</Badge></TableCell>
                      <TableCell>{u.raw_assigned_name ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{u.raw_assigned_id ?? '—'}</TableCell>
                      <TableCell className="text-right">{u.ticket_count}</TableCell>
                      <TableCell>
                        <select
                          className="h-9 px-2 border rounded-md bg-background text-sm"
                          disabled={busyKey === key || members.length === 0}
                          defaultValue=""
                          onChange={(e) => { if (e.target.value) createMapping(u, e.target.value); }}
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
