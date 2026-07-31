import {
  type SourceAdapter,
  type ConnectionConfig,
  type RawCompany,
  type RawTicket,
  type RefPageResult,
  type TimeLogEntry,
  trimBaseUrl,
  fullName,
} from './types';

const PAGE_SIZE = 100;

async function desk(cfg: ConnectionConfig, path: string, attempt = 0): Promise<Record<string, unknown>> {
  const url = `${trimBaseUrl(cfg.baseUrl)}/desk/api/v2${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' },
  });
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return desk(cfg, path, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Teamwork Desk ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

const iso = (d: Date) => d.toISOString();

function pick(data: Record<string, unknown>, keys: string[]): Array<Record<string, unknown>> {
  for (const k of keys) {
    const v = data[k];
    if (Array.isArray(v)) return v as Array<Record<string, unknown>>;
  }
  return [];
}

function hasMoreFrom(data: Record<string, unknown>, rows: number, pageSize: number): boolean {
  const pag = data.pagination as { hasMorePages?: boolean } | undefined;
  if (pag && typeof pag.hasMorePages === 'boolean') return pag.hasMorePages;
  return rows >= pageSize;
}

export const teamworkDeskAdapter: SourceAdapter = {
  sourceName: 'teamwork_desk',
  refStages: ['companies', 'customers', 'users', 'tags', 'inboxes', 'tickettypes', 'ticketstatuses'],

  async testConnection(cfg) {
    try {
      await desk(cfg, '/me.json');
      return { ok: true, message: 'Connected to Teamwork Desk' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },

  async fetchRefPage(cfg, stage, page, refs): Promise<RefPageResult> {
    const p = `page=${page}&pageSize=${PAGE_SIZE}`;

    if (stage === 'companies') {
      const data = await desk(cfg, `/companies.json?${p}`);
      const rows = pick(data, ['companies']);
      refs.companyNames = refs.companyNames ?? {};
      const companies: RawCompany[] = [];
      for (const c of rows) {
        const id = String(c.id);
        const name = String(c.name ?? c.companyName ?? '');
        refs.companyNames[id] = name;
        companies.push({ externalId: id, name, active: c.state !== 'deleted', raw: c });
      }
      return { hasMore: hasMoreFrom(data, rows.length, PAGE_SIZE), companies };
    }

    if (stage === 'customers') {
      const data = await desk(cfg, `/customers.json?${p}`);
      const rows = pick(data, ['customers']);
      refs.companyIdByCustomer = refs.companyIdByCustomer ?? {};
      refs.customerNames = refs.customerNames ?? {};
      for (const c of rows) {
        const id = String(c.id);
        const companyId = (c.company as { id?: string | number } | undefined)?.id;
        if (companyId !== undefined && companyId !== null) {
          refs.companyIdByCustomer[id] = String(companyId);
        }
        const name = fullName(c.firstName, c.lastName) ?? (typeof c.organization === 'string' ? c.organization : null);
        if (name) refs.customerNames[id] = name;
      }
      return { hasMore: hasMoreFrom(data, rows.length, PAGE_SIZE) };
    }

    if (stage === 'users') {
      const data = await desk(cfg, `/users.json?${p}`);
      const rows = pick(data, ['users']);
      refs.userNames = refs.userNames ?? {};
      for (const u of rows) {
        const name = fullName(u.firstName, u.lastName);
        if (name) refs.userNames[String(u.id)] = name;
      }
      return { hasMore: hasMoreFrom(data, rows.length, PAGE_SIZE) };
    }

    if (stage === 'tags') {
      const data = await desk(cfg, `/tags.json?${p}`);
      const rows = pick(data, ['tags']);
      refs.tagNames = refs.tagNames ?? {};
      for (const t of rows) if (typeof t.name === 'string') refs.tagNames[String(t.id)] = t.name;
      return { hasMore: hasMoreFrom(data, rows.length, PAGE_SIZE) };
    }

    if (stage === 'inboxes') {
      const data = await desk(cfg, `/inboxes.json?${p}`);
      const rows = pick(data, ['inboxes']);
      refs.inboxNames = refs.inboxNames ?? {};
      for (const i of rows) if (typeof i.name === 'string') refs.inboxNames[String(i.id)] = i.name;
      return { hasMore: hasMoreFrom(data, rows.length, PAGE_SIZE) };
    }

    if (stage === 'tickettypes') {
      const data = await desk(cfg, `/tickettypes.json?${p}`);
      const rows = pick(data, ['ticketTypes', 'tickettypes']);
      refs.typeNames = refs.typeNames ?? {};
      for (const t of rows) if (typeof t.name === 'string') refs.typeNames[String(t.id)] = t.name;
      return { hasMore: hasMoreFrom(data, rows.length, PAGE_SIZE) };
    }

    if (stage === 'ticketstatuses') {
      const data = await desk(cfg, `/ticketstatuses.json?${p}`);
      const rows = pick(data, ['ticketStatuses', 'ticketstatuses']);
      refs.statusNames = refs.statusNames ?? {};
      for (const t of rows) if (typeof t.name === 'string') refs.statusNames[String(t.id)] = t.name;
      return { hasMore: hasMoreFrom(data, rows.length, PAGE_SIZE) };
    }

    return { hasMore: false };
  },

  async fetchTicketPage(cfg, page, opts) {
    const since = opts.since;
    const sinceParam = since ? `&updatedAfter=${encodeURIComponent(iso(since))}` : '';
    const data = await desk(
      cfg,
      `/tickets.json?page=${page}&pageSize=${PAGE_SIZE}&include=customer,inbox,tags,agent,status,type${sinceParam}`,
    );
    const rows = pick(data, ['tickets']);
    const tickets: RawTicket[] = rows.map((t) => ({ externalId: String(t.id), raw: t }));
    return { tickets, hasMore: hasMoreFrom(data, rows.length, PAGE_SIZE) };
  },

  /** Desk timelogs report `seconds` per entry and page oldest-first. */
  async fetchTimeLogPage(cfg, page) {
    const data = await desk(cfg, `/timelogs.json?page=${page}&pageSize=${PAGE_SIZE}`);
    const rows = pick(data, ['timelogs', 'timeLogs']);
    const entries: TimeLogEntry[] = [];
    for (const tl of rows) {
      const ticketId = (tl.ticketId ?? (tl.ticket as { id?: unknown } | undefined)?.id) as
        | string
        | number
        | undefined;
      if (ticketId === undefined || ticketId === null) continue;
      const seconds =
        (typeof tl.seconds === 'number' ? tl.seconds : undefined) ??
        (typeof tl.minutes === 'number' ? tl.minutes * 60 : undefined) ??
        (typeof tl.timeSpent === 'number' ? tl.timeSpent : undefined);
      if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) continue;
      const entryId = tl.id;
      if (entryId === undefined || entryId === null) continue;
      entries.push({
        entryId: String(entryId),
        ticketId: String(ticketId),
        hours: seconds / 3600,
        loggedAt: (tl.date ?? tl.createdAt ?? null) as string | null,
      });
    }
    return { entries, hasMore: hasMoreFrom(data, rows.length, PAGE_SIZE) };
  },
};
