import type { RawTicket, SyncRefs } from '../adapters/types';
import { fullName } from '../adapters/types';

export interface NormalizedTicket {
  source_system: 'teamwork' | 'teamwork_desk';
  external_ticket_id: string;
  external_company_id: string | null;
  company_name: string | null;
  ticket_title: string | null;
  status: string | null;
  type: string | null;
  assigned_name_raw: string | null;
  assigned_external_id: string | null;
  customer_name: string | null;
  inbox: string | null;
  tags: string[];
  ticket_url: string | null;
  created_at_source: string | null;
  updated_at_source: string | null;
  closed_at_source: string | null;
  raw_payload: Record<string, unknown>;
}

const s = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

const id = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

export const normalizeDeskType = (name: string | null): string | null => {
  if (!name) return null;
  const value = name.trim().toLowerCase();
  if (value.includes('marketing')) return 'marketing';
  if (value.includes('problem')) return 'problem';
  if (value.includes('request')) return 'request';
  if (value.includes('question')) return 'question';
  if (
    value.includes('incident') ||
    value.includes('alert') ||
    value.includes('warning') ||
    value.includes('wp remote') ||
    value.includes('wordfence')
  )
    return 'incident';
  return value;
};

/** Resolve a Teamwork Projects task's company via tasklist -> project -> company. */
export function resolveTeamworkCompany(
  t: Record<string, unknown>,
  refs: SyncRefs,
): { companyId: string | null; companyName: string | null } {
  const inlineTasklists = (t._tasklists ?? {}) as Record<string, Record<string, unknown>>;
  const tasklistId = id(t.tasklistId ?? (t.tasklist as { id?: unknown } | undefined)?.id);
  let projectId = id(t.projectId ?? (t.project as { id?: unknown } | undefined)?.id);
  if (!projectId && tasklistId) {
    const inline = inlineTasklists[tasklistId];
    projectId =
      id(inline?.projectId ?? (inline?.project as { id?: unknown } | undefined)?.id) ??
      refs.projectByTasklist?.[tasklistId] ??
      null;
  }
  const companyId = projectId ? (refs.companyIdByProject?.[projectId] ?? null) : null;
  const companyName = companyId ? (refs.companyNames?.[companyId] ?? null) : null;
  return { companyId, companyName };
}

export function normalizeTeamworkTask(
  raw: RawTicket,
  baseUrl: string,
  refs: SyncRefs,
): NormalizedTicket {
  const t = raw.raw as Record<string, unknown>;
  const inlineUsers = (t._users ?? {}) as Record<string, Record<string, unknown>>;
  const inlineTags = (t._tags ?? {}) as Record<string, Record<string, unknown>>;

  const { companyId, companyName } = resolveTeamworkCompany(t, refs);

  const assigneeIds = (t.assigneeUserIds as Array<string | number> | null | undefined) ?? [];
  const firstAssignee = assigneeIds.length > 0 ? String(assigneeIds[0]) : null;
  const inlineUser = firstAssignee ? inlineUsers[firstAssignee] : undefined;
  const assigneeName = firstAssignee
    ? (fullName(inlineUser?.firstName, inlineUser?.lastName) ??
      refs.userNames?.[firstAssignee] ??
      null)
    : null;

  const tagIds = (t.tagIds as Array<string | number> | null | undefined) ?? [];
  const tags = tagIds
    .map((tid) => {
      const key = String(tid);
      const inline = inlineTags[key]?.name;
      return typeof inline === 'string' ? inline : refs.tagNames?.[key];
    })
    .filter((x): x is string => typeof x === 'string' && x.length > 0);

  const base = baseUrl.replace(/\/+$/, '');

  // Do not persist the huge sideload maps on the ticket payload.
  const { _tasklists, _users, _tags, ...payload } = t as Record<string, unknown>;
  void _tasklists;
  void _users;
  void _tags;

  return {
    source_system: 'teamwork',
    external_ticket_id: raw.externalId,
    external_company_id: companyId,
    company_name: companyName,
    ticket_title: s(t.name),
    status: s(t.status),
    type: s(t.type ?? 'task'),
    assigned_name_raw: assigneeName,
    assigned_external_id: firstAssignee,
    customer_name: null,
    inbox: null,
    tags,
    ticket_url: `${base}/#/tasks/${raw.externalId}`,
    created_at_source: s(t.createdAt ?? t.dateAdded),
    updated_at_source: s(t.updatedAt ?? t.lastChangedOn),
    closed_at_source: s(t.completedOn ?? t.completedAt),
    raw_payload: payload,
  };
}

export function normalizeDeskTicket(
  raw: RawTicket,
  baseUrl: string,
  refs: SyncRefs,
): NormalizedTicket {
  const t = raw.raw as Record<string, unknown>;

  const customerId = id(t.customerId ?? (t.customer as { id?: unknown } | undefined)?.id);
  const companyId = customerId ? (refs.companyIdByCustomer?.[customerId] ?? null) : null;
  const companyName = companyId ? (refs.companyNames?.[companyId] ?? null) : null;
  const customerName = customerId ? (refs.customerNames?.[customerId] ?? null) : null;

  const inboxId = id(t.inboxId ?? (t.inbox as { id?: unknown } | undefined)?.id);
  const agentId = id(t.agentId ?? (t.agent as { id?: unknown } | undefined)?.id);
  const statusId = id((t.status as { id?: unknown } | undefined)?.id);
  const typeId = id((t.type as { id?: unknown } | undefined)?.id);

  const tagsField = t.tags as Array<{ id?: unknown; name?: unknown } | string> | undefined;
  const tags = (tagsField ?? [])
    .map((tag) => {
      if (typeof tag === 'string') return tag;
      if (typeof tag.name === 'string') return tag.name;
      const tid = id(tag.id);
      return tid ? refs.tagNames?.[tid] : undefined;
    })
    .filter((x): x is string => typeof x === 'string' && x.length > 0);

  const statusName =
    (typeof (t.status as { name?: unknown } | undefined)?.name === 'string'
      ? ((t.status as { name: string }).name)
      : undefined) ??
    (statusId ? refs.statusNames?.[statusId] : undefined) ??
    (typeof t.state === 'string' ? t.state : undefined) ??
    null;

  const typeName =
    (typeof (t.type as { name?: unknown } | undefined)?.name === 'string'
      ? ((t.type as { name: string }).name)
      : undefined) ??
    (typeId ? refs.typeNames?.[typeId] : undefined) ??
    null;

  const base = baseUrl.replace(/\/+$/, '');

  return {
    source_system: 'teamwork_desk',
    external_ticket_id: raw.externalId,
    external_company_id: companyId,
    company_name: companyName,
    ticket_title: s(t.subject),
    status: s(statusName),
    type: normalizeDeskType(s(typeName)),
    assigned_name_raw: agentId ? (refs.userNames?.[agentId] ?? null) : null,
    assigned_external_id: agentId,
    customer_name: customerName,
    inbox: inboxId ? (refs.inboxNames?.[inboxId] ?? null) : null,
    tags,
    ticket_url: `${base}/desk/tickets/${raw.externalId}`,
    created_at_source: s(t.createdAt),
    updated_at_source: s(t.updatedAt),
    closed_at_source: s(t.resolvedAt ?? t.closedAt),
    raw_payload: t,
  };
}
