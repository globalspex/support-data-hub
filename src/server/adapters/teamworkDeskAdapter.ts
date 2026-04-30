import {
  type SourceAdapter,
  type ConnectionConfig,
  type RawCompany,
  type RawTicket,
  trimBaseUrl,
} from './types';

async function desk(cfg: ConnectionConfig, path: string, attempt = 0): Promise<unknown> {
  const url = `${trimBaseUrl(cfg.baseUrl)}/desk/api/v2${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return desk(cfg, path, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Teamwork Desk ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return res.json();
}

const iso = (d: Date) => d.toISOString();

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

  async fetchTickets(cfg, opts) {
    const out: RawTicket[] = [];
    let page = 1;
    const since = opts?.since;
    const sinceTime = since ? since.getTime() : 0;
    const sinceParam = since ? `&updatedAfter=${encodeURIComponent(iso(since))}` : '';
    while (page < 200) {
      const data = (await desk(
        cfg,
        `/tickets.json?page=${page}&pageSize=100&include=customer,inbox,tags,agent,status,type${sinceParam}`,
      )) as {
        tickets?: Array<Record<string, unknown>>;
        included?: Record<string, Record<string, Record<string, unknown>>>;
      };
      const list = data.tickets ?? [];
      if (list.length === 0) break;
      let stopAfterPage = false;
      for (const t of list) {
        if (since) {
          const u = (t.updatedAt as string | undefined) ?? null;
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
      if (list.length < 100) break;
      page++;
    }
    return out;
  },
};
