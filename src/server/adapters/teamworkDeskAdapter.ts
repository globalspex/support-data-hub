import {
  type SourceAdapter,
  type ConnectionConfig,
  type RawCompany,
  type RawTicket,
  trimBaseUrl,
} from './types';

async function desk(cfg: ConnectionConfig, path: string): Promise<unknown> {
  const url = `${trimBaseUrl(cfg.baseUrl)}/desk/api/v2${path}`;
  const res = await fetch(url, {
    headers: {
      // Teamwork Desk uses Bearer token auth (not Basic like Teamwork Projects)
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Teamwork Desk ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export const teamworkDeskAdapter: SourceAdapter = {
  sourceName: 'teamwork_desk',

  async testConnection(cfg) {
    try {
      await desk(cfg, '/me.json');
      return { ok: true, message: 'Connected to Teamwork Desk' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },

  async fetchCompanies(cfg) {
    const out: RawCompany[] = [];
    let page = 1;
    while (page < 50) {
      const data = (await desk(cfg, `/customers/companies.json?page=${page}&pageSize=100`)) as {
        companies?: Array<Record<string, unknown>>;
      };
      const list = data.companies ?? [];
      if (list.length === 0) break;
      for (const c of list) {
        out.push({
          externalId: String(c.id),
          name: String(c.name ?? c.companyName ?? ''),
          active: true,
          raw: c,
        });
      }
      if (list.length < 100) break;
      page++;
    }
    return out;
  },

  async fetchTickets(cfg) {
    const out: RawTicket[] = [];
    let page = 1;
    while (page < 200) {
      const data = (await desk(
        cfg,
        `/tickets.json?page=${page}&pageSize=100&include=customer,inbox,tags,agent,status,type,messages`,
      )) as {
        tickets?: Array<Record<string, unknown>>;
        included?: Record<string, Record<string, Record<string, unknown>>>;
      };
      const list = data.tickets ?? [];
      if (list.length === 0) break;
      for (const t of list) {
        out.push({
          externalId: String(t.id),
          raw: { ...t, _included: data.included ?? {} },
        });
      }
      if (list.length < 100) break;
      page++;
    }
    return out;
  },
};
