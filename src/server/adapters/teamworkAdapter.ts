import {
  type SourceAdapter,
  type ConnectionConfig,
  type RawCompany,
  type RawTicket,
  basicAuthHeader,
  trimBaseUrl,
} from './types';

async function tw(cfg: ConnectionConfig, path: string): Promise<unknown> {
  const url = `${trimBaseUrl(cfg.baseUrl)}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: basicAuthHeader(cfg.token),
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Teamwork ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return res.json();
}

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

  async fetchTickets(cfg) {
    // Teamwork v3 tasks endpoint with tags + assignees included
    const out: RawTicket[] = [];
    let page = 1;
    while (page < 100) {
      const data = (await tw(
        cfg,
        `/projects/api/v3/tasks.json?page=${page}&pageSize=250&include=tags,users,projects,companies&includeCompletedTasks=true`,
      )) as {
        tasks?: Array<Record<string, unknown>>;
        included?: Record<string, Record<string, Record<string, unknown>>>;
      };
      const list = data.tasks ?? [];
      if (list.length === 0) break;
      for (const t of list) {
        out.push({
          externalId: String(t.id),
          raw: { ...t, _included: data.included ?? {} },
        });
      }
      if (list.length < 250) break;
      page++;
    }
    return out;
  },
};
