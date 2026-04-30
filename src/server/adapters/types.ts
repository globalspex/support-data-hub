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

export interface SourceAdapter {
  sourceName: SourceName;
  testConnection(cfg: ConnectionConfig): Promise<{ ok: boolean; message: string }>;
  fetchCompanies(cfg: ConnectionConfig): Promise<RawCompany[]>;
  fetchTickets(cfg: ConnectionConfig, opts?: { since?: Date }): Promise<RawTicket[]>;
  /** Optional: returns Map of taskId -> total logged hours (decimal). */
  fetchTimeEntriesByTaskId?(cfg: ConnectionConfig): Promise<Map<string, number>>;
}

export function basicAuthHeader(token: string): string {
  // Teamwork pattern: base64(token + ':X')
  const b64 = Buffer.from(`${token}:X`).toString('base64');
  return `Basic ${b64}`;
}

export function trimBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}
