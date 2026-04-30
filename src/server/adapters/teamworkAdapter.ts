import {
  type SourceAdapter,
  type ConnectionConfig,
  type RawCompany,
  type RawTicket,
  basicAuthHeader,
  trimBaseUrl,
} from './types';

async function tw(cfg: ConnectionConfig, path: string, attempt = 0): Promise<unknown> {
  const url = `${trimBaseUrl(cfg.baseUrl)}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: basicAuthHeader(cfg.token),
      Accept: 'application/json',
    },
  });
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return tw(cfg, path, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Teamwork ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return res.json();
}

const iso = (d: Date) => d.toISOString();

const ticketUpdatedAt = (t: Record<string, unknown>): string | null => {
  const u = (t.updatedAt ?? t.lastChangedOn ?? t.dateUpdated ?? null) as string | null;
  return u;
};

export const teamworkAdapter: SourceAdapter = {
  sourceName: 'teamwork',

  async testConnection(cfg) {
    try {
      await tw(cfg, '/me.json');
      return { ok: true, message: 'Connected to Teamwork' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },

  async fetchCompanies(cfg) {
    const out: RawCompany[] = [];
    let page = 1;
    while (page < 50) {
      const data = (await tw(cfg, `/companies.json?page=${page}&pageSize=250`)) as {
        companies?: Array<Record<string, unknown>>;
      };
      const list = data.companies ?? [];
      if (list.length === 0) break;
      for (const c of list) {
        out.push({
          externalId: String(c.id),
          name: String(c.name ?? ''),
          active: c.isActive !== false,
          raw: c,
        });
      }
      if (list.length < 250) break;
      page++;
    }
    return out;
  },

  async fetchTickets(cfg, opts) {
    const out: RawTicket[] = [];
    let page = 1;
    const since = opts?.since;
    const sinceTime = since ? since.getTime() : 0;
    const sinceParam = since ? `&updatedAfter=${encodeURIComponent(iso(since))}&orderBy=updatedAt&orderMode=desc` : '';
    while (page < 100) {
      const data = (await tw(
        cfg,
        `/projects/api/v3/tasks.json?page=${page}&pageSize=250&include=tags,users,projects,companies&includeCompletedTasks=true${sinceParam}`,
      )) as {
        tasks?: Array<Record<string, unknown>>;
        included?: Record<string, Record<string, Record<string, unknown>>>;
      };
      const list = data.tasks ?? [];
      if (list.length === 0) break;
      let stopAfterPage = false;
      for (const t of list) {
        if (since) {
          const u = ticketUpdatedAt(t);
          if (u) {
            const ts = Date.parse(u);
            if (Number.isFinite(ts) && ts < sinceTime) {
              stopAfterPage = true;
              continue;
            }
          }
        }
        out.push({
          externalId: String(t.id),
          raw: { ...t, _included: data.included ?? {} },
        });
      }
      if (stopAfterPage) break;
      if (list.length < 250) break;
      page++;
    }
    return out;
  },

  async fetchTimeEntriesByTaskId(cfg, opts) {
    // Sum hours+minutes per task. Dedupe by entry id across pages.
    const totals = new Map<string, number>();
    const seenEntryIds = new Set<string>();
    let duplicateCount = 0;
    let page = 1;
    const since = opts?.since;
    const sinceParam = since ? `&updatedAfter=${encodeURIComponent(iso(since))}` : '';
    while (page < 500) {
      const data = (await tw(
        cfg,
        `/projects/api/v3/time.json?page=${page}&pageSize=500${sinceParam}`,
      )) as {
        timelogs?: Array<Record<string, unknown>>;
        timeEntries?: Array<Record<string, unknown>>;
      };
      const list = data.timelogs ?? data.timeEntries ?? [];
      if (list.length === 0) break;
      for (const entry of list) {
        const entryId = entry.id as string | number | undefined;
        if (entryId !== undefined && entryId !== null) {
          const idKey = String(entryId);
          if (seenEntryIds.has(idKey)) {
            duplicateCount++;
            continue;
          }
          seenEntryIds.add(idKey);
        }
        const taskId =
          (entry.taskId as string | number | undefined) ??
          ((entry.task as { id?: string | number } | undefined)?.id);
        if (taskId === undefined || taskId === null) continue;
        const hours = Number(entry.hours ?? 0);
        const minutes = Number(entry.minutes ?? 0);
        const decimalHours = hours + minutes / 60;
        if (!Number.isFinite(decimalHours) || decimalHours <= 0) continue;
        const key = String(taskId);
        totals.set(key, (totals.get(key) ?? 0) + decimalHours);
      }
      if (list.length < 500) break;
      page++;
    }
    if (duplicateCount > 0) {
      console.log(
        `[teamworkAdapter] Skipped ${duplicateCount} duplicate time entries during pagination`,
      );
    }
    return totals;
  },
};
