import {
  type SourceAdapter,
  type ConnectionConfig,
  type RawCompany,
  type RawTicket,
  trimBaseUrl,
} from "./types";

async function desk(cfg: ConnectionConfig, path: string, attempt = 0): Promise<unknown> {
  const url = `${trimBaseUrl(cfg.baseUrl)}/desk/api/v2${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/json",
    },
  });
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return desk(cfg, path, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Teamwork Desk ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return res.json();
}

const iso = (d: Date) => d.toISOString();

/** Page through a Desk endpoint that returns { <listKey>: [...] } and collect all rows. */
async function fetchAllPaged(
  cfg: ConnectionConfig,
  pathBase: string,
  listKeys: string[],
  pageSize = 100,
  maxPages = 200,
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let page = 1;
  while (page < maxPages) {
    const sep = pathBase.includes("?") ? "&" : "?";
    const data = (await desk(
      cfg,
      `${pathBase}${sep}page=${page}&pageSize=${pageSize}`,
    )) as Record<string, unknown>;
    let list: Array<Record<string, unknown>> | undefined;
    for (const key of listKeys) {
      const v = data[key];
      if (Array.isArray(v)) {
        list = v as Array<Record<string, unknown>>;
        break;
      }
    }
    if (!list || list.length === 0) break;
    out.push(...list);
    if (list.length < pageSize) break;
    page++;
  }
  return out;
}

function indexById(rows: Array<Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  for (const r of rows) {
    if (r.id !== undefined && r.id !== null) map[String(r.id)] = r;
  }
  return map;
}

export const teamworkDeskAdapter: SourceAdapter = {
  sourceName: "teamwork_desk",

  async testConnection(cfg) {
    try {
      await desk(cfg, "/me.json");
      return { ok: true, message: "Connected to Teamwork Desk" };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },

  async fetchCompanies(cfg) {
    const rows = await fetchAllPaged(cfg, "/customers/companies.json", ["companies"]);
    return rows.map((c) => ({
      externalId: String(c.id),
      name: String(c.name ?? c.companyName ?? ""),
      active: true,
      raw: c,
    }));
  },

  async fetchTickets(cfg, opts) {
    const out: RawTicket[] = [];

    // Pre-fetch reference data so we can resolve {id,type:"..."} references on tickets.
    // Teamwork Desk v2 returns related resources as top-level arrays (users, tags, inboxes, etc.),
    // not nested under `included`, so we resolve them via these maps.
    const [usersList, tagsList, inboxesList, typesList, statusesList] = await Promise.all([
      fetchAllPaged(cfg, "/users.json", ["users"]).catch(() => []),
      fetchAllPaged(cfg, "/tags.json", ["tags"]).catch(() => []),
      fetchAllPaged(cfg, "/inboxes.json", ["inboxes"]).catch(() => []),
      fetchAllPaged(cfg, "/tickettypes.json", ["ticketTypes", "tickettypes"]).catch(() => []),
      fetchAllPaged(cfg, "/ticketstatuses.json", ["ticketStatuses", "ticketstatuses"]).catch(
        () => [],
      ),
    ]);

    const refMaps = {
      users: indexById(usersList),
      tags: indexById(tagsList),
      inboxes: indexById(inboxesList),
      tickettypes: indexById(typesList),
      ticketstatuses: indexById(statusesList),
    };

    let page = 1;
    const since = opts?.since;
    const sinceTime = since ? since.getTime() : 0;
    const sinceParam = since ? `&updatedAfter=${encodeURIComponent(iso(since))}` : "";
    while (page < 500) {
      const data = (await desk(
        cfg,
        `/tickets.json?page=${page}&pageSize=100&include=customer,inbox,tags,agent,status,type${sinceParam}`,
      )) as {
        tickets?: Array<Record<string, unknown>>;
        included?: Record<string, Record<string, Record<string, unknown>>>;
        users?: Array<Record<string, unknown>>;
        tags?: Array<Record<string, unknown>>;
        inboxes?: Array<Record<string, unknown>>;
        customers?: Array<Record<string, unknown>>;
        companies?: Array<Record<string, unknown>>;
      };
      const list = data.tickets ?? [];
      if (list.length === 0) break;

      // Merge per-page sideloaded resources (top-level arrays) into our maps.
      const pageIncluded: Record<string, Record<string, Record<string, unknown>>> = {
        ...(data.included ?? {}),
      };
      const sideloadKeys: Array<keyof typeof data> = [
        "users",
        "tags",
        "inboxes",
        "customers",
        "companies",
      ];
      for (const key of sideloadKeys) {
        const arr = data[key];
        if (Array.isArray(arr)) {
          pageIncluded[key as string] = {
            ...(pageIncluded[key as string] ?? {}),
            ...indexById(arr as Array<Record<string, unknown>>),
          };
        }
      }
      // Merge globally fetched ref maps as fallback.
      for (const [k, m] of Object.entries(refMaps)) {
        pageIncluded[k] = { ...(m as Record<string, Record<string, unknown>>), ...(pageIncluded[k] ?? {}) };
      }

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
          raw: { ...t, _included: pageIncluded, _ticketTypesById: refMaps.tickettypes },
        });
      }
      if (stopAfterPage) break;
      if (list.length < 100) break;
      page++;
    }
    return out;
  },

  /**
   * Sum logged hours per ticket from /timelogs.json. Returns Map<ticketId, hours>.
   * Teamwork Desk timelogs return `time` (typically minutes) on each entry. We
   * convert to hours.
   */
  async fetchTimeEntriesByTaskId(cfg, opts) {
    const totals = new Map<string, number>();
    const since = opts?.since;
    const sinceParam = since ? `&updatedAfter=${encodeURIComponent(iso(since))}` : "";
    let page = 1;
    while (page < 1000) {
      let data: Record<string, unknown>;
      try {
        data = (await desk(
          cfg,
          `/timelogs.json?page=${page}&pageSize=100${sinceParam}`,
        )) as Record<string, unknown>;
      } catch {
        break;
      }
      const list =
        (data.timelogs as Array<Record<string, unknown>> | undefined) ??
        (data.timeLogs as Array<Record<string, unknown>> | undefined) ??
        [];
      if (list.length === 0) break;
      for (const tl of list) {
        const ticketRef = tl.ticket as { id?: unknown } | undefined;
        const ticketId = (tl.ticketId ?? ticketRef?.id) as string | number | undefined;
        if (ticketId === undefined || ticketId === null) continue;
        // Possible field names for duration. Prefer minutes if present.
        const minutes =
          (typeof tl.minutes === "number" ? (tl.minutes as number) : undefined) ??
          (typeof tl.time === "number" ? (tl.time as number) : undefined) ??
          (typeof tl.timeSpent === "number" ? (tl.timeSpent as number) : undefined);
        if (minutes === undefined || !Number.isFinite(minutes)) continue;
        const hours = minutes / 60;
        const key = String(ticketId);
        totals.set(key, (totals.get(key) ?? 0) + hours);
      }
      if (list.length < 100) break;
      page++;
    }
    return totals;
  },
};
