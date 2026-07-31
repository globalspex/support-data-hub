import {
  type SourceAdapter,
  type ConnectionConfig,
  type RawCompany,
  type RawTicket,
  type RefPageResult,
  type SyncRefs,
  type TimeLogEntry,
  basicAuthHeader,
  trimBaseUrl,
  fullName,
} from './types';

const PAGE_SIZE = 250;
const TIME_PAGE_SIZE = 500;

async function tw(cfg: ConnectionConfig, path: string, attempt = 0): Promise<Record<string, unknown>> {
  const url = `${trimBaseUrl(cfg.baseUrl)}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: basicAuthHeader(cfg.token), Accept: 'application/json' },
  });
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return tw(cfg, path, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Teamwork ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

const iso = (d: Date) => d.toISOString();
const list = (data: Record<string, unknown>, key: string): Array<Record<string, unknown>> => {
  const v = data[key];
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
};

export const teamworkAdapter: SourceAdapter = {
  sourceName: 'teamwork',
  refStages: ['companies', 'projects', 'tasklists', 'users', 'tags'],

  async testConnection(cfg) {
    try {
      await tw(cfg, '/me.json');
      return { ok: true, message: 'Connected to Teamwork' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },

  async fetchRefPage(cfg, stage, page, refs): Promise<RefPageResult> {
    if (stage === 'companies') {
      const data = await tw(cfg, `/companies.json?page=${page}&pageSize=${PAGE_SIZE}`);
      const rows = list(data, 'companies');
      const companies: RawCompany[] = [];
      refs.companyNames = refs.companyNames ?? {};
      for (const c of rows) {
        const id = String(c.id);
        const name = String(c.name ?? '');
        refs.companyNames[id] = name;
        companies.push({ externalId: id, name, active: c.isActive !== false, raw: c });
      }
      return { hasMore: rows.length >= PAGE_SIZE, companies };
    }

    if (stage === 'projects') {
      // v3 projects carry a company reference; tasks only carry a tasklist reference,
      // so we need project -> company and tasklist -> project to resolve a ticket's company.
      const data = await tw(cfg, `/projects/api/v3/projects.json?page=${page}&pageSize=${PAGE_SIZE}&include=companies`);
      const rows = list(data, 'projects');
      refs.companyIdByProject = refs.companyIdByProject ?? {};
      refs.companyNames = refs.companyNames ?? {};
      for (const p of rows) {
        const companyId =
          (p.companyId as string | number | undefined) ??
          ((p.company as { id?: string | number } | undefined)?.id);
        if (companyId !== undefined && companyId !== null) {
          refs.companyIdByProject[String(p.id)] = String(companyId);
        }
      }
      const included = (data.included ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
      for (const [id, c] of Object.entries(included.companies ?? {})) {
        if (typeof c?.name === 'string') refs.companyNames[id] = c.name;
      }
      return { hasMore: rows.length >= PAGE_SIZE };
    }

    if (stage === 'tasklists') {
      const data = await tw(cfg, `/projects/api/v3/tasklists.json?page=${page}&pageSize=${PAGE_SIZE}`);
      const rows = list(data, 'tasklists');
      refs.projectByTasklist = refs.projectByTasklist ?? {};
      for (const tl of rows) {
        const projectId =
          (tl.projectId as string | number | undefined) ??
          ((tl.project as { id?: string | number } | undefined)?.id);
        if (projectId !== undefined && projectId !== null) {
          refs.projectByTasklist[String(tl.id)] = String(projectId);
        }
      }
      return { hasMore: rows.length >= PAGE_SIZE };
    }

    if (stage === 'users') {
      const data = await tw(cfg, `/projects/api/v3/people.json?page=${page}&pageSize=${PAGE_SIZE}`);
      const rows = list(data, 'people');
      refs.userNames = refs.userNames ?? {};
      for (const u of rows) {
        const name = fullName(u.firstName, u.lastName);
        if (name) refs.userNames[String(u.id)] = name;
      }
      return { hasMore: rows.length >= PAGE_SIZE };
    }

    if (stage === 'tags') {
      const data = await tw(cfg, `/projects/api/v3/tags.json?page=${page}&pageSize=${PAGE_SIZE}`);
      const rows = list(data, 'tags');
      refs.tagNames = refs.tagNames ?? {};
      for (const t of rows) {
        if (typeof t.name === 'string') refs.tagNames[String(t.id)] = t.name;
      }
      return { hasMore: rows.length >= PAGE_SIZE };
    }

    return { hasMore: false };
  },

  async fetchTicketPage(cfg, page, opts) {
    const since = opts.since;
    const sinceParam = since
      ? `&updatedAfter=${encodeURIComponent(iso(since))}&orderBy=updatedAt&orderMode=desc`
      : '';
    const data = await tw(
      cfg,
      `/projects/api/v3/tasks.json?page=${page}&pageSize=${PAGE_SIZE}&include=tags,users,tasklists&includeCompletedTasks=true${sinceParam}`,
    );
    const rows = list(data, 'tasks');
    const included = (data.included ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
    const tickets: RawTicket[] = rows.map((t) => ({
      externalId: String(t.id),
      raw: { ...t, _tasklists: included.tasklists ?? {}, _users: included.users ?? {}, _tags: included.tags ?? {} },
    }));
    const meta = (data.meta as { page?: { hasMore?: boolean } } | undefined)?.page;
    const hasMore = meta?.hasMore ?? rows.length >= PAGE_SIZE;
    return { tickets, hasMore };
  },

  async fetchTimeLogPage(cfg, page, opts) {
    const since = opts.since;
    const sinceParam = since ? `&updatedAfter=${encodeURIComponent(iso(since))}` : '';
    const data = await tw(
      cfg,
      `/projects/api/v3/time.json?page=${page}&pageSize=${TIME_PAGE_SIZE}${sinceParam}`,
    );
    const rows = list(data, 'timelogs').length ? list(data, 'timelogs') : list(data, 'timeEntries');
    const entries: TimeLogEntry[] = [];
    for (const entry of rows) {
      const taskId =
        (entry.taskId as string | number | undefined) ??
        ((entry.task as { id?: string | number } | undefined)?.id);
      if (taskId === undefined || taskId === null) continue;
      const hours = Number(entry.hours ?? 0) + Number(entry.minutes ?? 0) / 60;
      if (!Number.isFinite(hours) || hours <= 0) continue;
      const entryId = entry.id;
      if (entryId === undefined || entryId === null) continue;
      entries.push({
        entryId: String(entryId),
        ticketId: String(taskId),
        hours,
        loggedAt: (entry.timeLogged ?? entry.date ?? entry.createdAt ?? null) as string | null,
      });
    }
    const meta = (data.meta as { page?: { hasMore?: boolean } } | undefined)?.page;
    const hasMore = meta?.hasMore ?? rows.length >= TIME_PAGE_SIZE;
    return { entries, hasMore };
  },
};
