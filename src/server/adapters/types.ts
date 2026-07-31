export type SourceName = 'teamwork' | 'teamwork_desk';

export interface ConnectionConfig {
  baseUrl: string;
  token: string;
  authType?: string;
}

export interface RawTicket {
  externalId: string;
  raw: Record<string, unknown>;
}

export interface RawCompany {
  externalId: string;
  name: string;
  active?: boolean;
  raw: Record<string, unknown>;
}

export interface TimeLogEntry {
  entryId: string;
  ticketId: string;
  hours: number;
  loggedAt: string | null;
}

/**
 * Compact reference maps built during the "reference" stages of a sync run and
 * persisted on sync_runs.cursor so a run can resume across HTTP calls.
 * Values are plain strings (names / ids) to keep the JSON small.
 */
export interface SyncRefs {
  /** company id -> company name (both sources) */
  companyNames?: Record<string, string>;
  /** teamwork: project id -> company id */
  companyIdByProject?: Record<string, string>;
  /** teamwork: tasklist id -> project id */
  projectByTasklist?: Record<string, string>;
  /** user/agent id -> display name */
  userNames?: Record<string, string>;
  /** tag id -> tag name */
  tagNames?: Record<string, string>;
  /** inbox id -> inbox name */
  inboxNames?: Record<string, string>;
  /** ticket type id -> type name */
  typeNames?: Record<string, string>;
  /** ticket status id -> status name */
  statusNames?: Record<string, string>;
  /** desk: customer id -> company id */
  companyIdByCustomer?: Record<string, string>;
  /** desk: customer id -> customer display name */
  customerNames?: Record<string, string>;
}

export interface RefPageResult {
  hasMore: boolean;
  /** Companies discovered on this page, to be upserted into the companies table. */
  companies?: RawCompany[];
}

export interface SourceAdapter {
  sourceName: SourceName;
  testConnection(cfg: ConnectionConfig): Promise<{ ok: boolean; message: string }>;
  /** Ordered list of reference stages fetched (one page per step) before tickets. */
  refStages: string[];
  /** Fetch one page of a reference stage, mutating `refs` in place. */
  fetchRefPage(
    cfg: ConnectionConfig,
    stage: string,
    page: number,
    refs: SyncRefs,
  ): Promise<RefPageResult>;
  /** Fetch one page of tickets. */
  fetchTicketPage(
    cfg: ConnectionConfig,
    page: number,
    opts: { since?: Date },
  ): Promise<{ tickets: RawTicket[]; hasMore: boolean }>;
  /** Fetch one page of time log entries. */
  fetchTimeLogPage(
    cfg: ConnectionConfig,
    page: number,
    opts: { since?: Date },
  ): Promise<{ entries: TimeLogEntry[]; hasMore: boolean }>;
}

export function basicAuthHeader(token: string): string {
  // Teamwork pattern: base64(token + ':X')
  const b64 = Buffer.from(`${token}:X`).toString('base64');
  return `Basic ${b64}`;
}

export function trimBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function fullName(first: unknown, last: unknown): string | null {
  const name = `${first ?? ''} ${last ?? ''}`.replace(/\s+/g, ' ').trim();
  return name || null;
}
