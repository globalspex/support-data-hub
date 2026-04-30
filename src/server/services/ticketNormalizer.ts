import type { RawTicket } from "../adapters/types";

export interface NormalizedTicket {
  source_system: "teamwork" | "teamwork_desk";
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
  actual_logged_time: number | null;
  raw_payload: Record<string, unknown>;
}

const s = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

const normalizeDeskType = (name: string | null): string | null => {
  if (!name) return null;
  const value = name.trim().toLowerCase();
  if (value.includes("marketing")) return "marketing";
  if (value.includes("problem")) return "problem";
  if (value.includes("request")) return "request";
  if (value.includes("question")) return "question";
  if (
    value.includes("incident") ||
    value.includes("alert") ||
    value.includes("warning") ||
    value.includes("wp remote") ||
    value.includes("wordfence")
  )
    return "incident";
  return value;
};

const lookupIncluded = (
  included: Record<string, Record<string, Record<string, unknown>>> | undefined,
  type: string,
  id: string | number | undefined,
): Record<string, unknown> | undefined => {
  if (!included || id === undefined || id === null) return undefined;
  const bucket = included[type];
  if (!bucket) return undefined;
  return bucket[String(id)];
};

export function normalizeTeamworkTask(
  raw: RawTicket,
  baseUrl: string,
  loggedHoursByTaskId?: Map<string, number>,
): NormalizedTicket {
  const t = raw.raw as Record<string, unknown>;
  const included = t._included as
    | Record<string, Record<string, Record<string, unknown>>>
    | undefined;

  const projectId = (t.projectId ?? (t.project as { id?: unknown })?.id) as
    | string
    | number
    | undefined;
  const project = lookupIncluded(included, "projects", projectId);
  const companyId = project?.companyId as string | number | undefined;
  const company = lookupIncluded(included, "companies", companyId);

  const assigneeIds = (t.assigneeUserIds as Array<string | number> | undefined) ?? [];
  const firstAssignee = assigneeIds[0];
  const user = lookupIncluded(included, "users", firstAssignee);
  const assigneeName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null
    : null;

  const tagIds = (t.tagIds as Array<string | number> | undefined) ?? [];
  const tags = tagIds
    .map((id) => lookupIncluded(included, "tags", id)?.name)
    .filter((x): x is string => typeof x === "string");

  const base = baseUrl.replace(/\/+$/, "");

  const logged = loggedHoursByTaskId?.get(raw.externalId);

  return {
    source_system: "teamwork",
    external_ticket_id: raw.externalId,
    external_company_id: companyId !== undefined ? String(companyId) : null,
    company_name: s(company?.name),
    ticket_title: s(t.name),
    status: s(t.status),
    type: s(t.type ?? "task"),
    assigned_name_raw: assigneeName,
    assigned_external_id: firstAssignee !== undefined ? String(firstAssignee) : null,
    customer_name: null,
    inbox: null,
    tags,
    ticket_url: `${base}/#/tasks/${raw.externalId}`,
    created_at_source: s(t.createdAt ?? t.dateAdded),
    updated_at_source: s(t.updatedAt ?? t.lastChangedOn),
    closed_at_source: s(t.completedOn ?? t.completedAt),
    actual_logged_time: logged !== undefined ? logged : null,
    raw_payload: t,
  };
}

export function normalizeDeskTicket(raw: RawTicket, baseUrl: string): NormalizedTicket {
  const t = raw.raw as Record<string, unknown>;
  const included = t._included as
    | Record<string, Record<string, Record<string, unknown>>>
    | undefined;

  // Customer can be embedded or a {id,type:"customers"} reference.
  const customerRef = t.customer as { id?: unknown; firstName?: unknown; lastName?: unknown } | undefined;
  const customerId = (t.customerId ?? customerRef?.id) as string | number | undefined;
  const customerFromInc = lookupIncluded(included, "customers", customerId);
  const customer = customerFromInc ?? (customerRef as Record<string, unknown> | undefined);
  const companyId = (customer?.companyId ?? (t.company as { id?: unknown })?.id) as
    | string
    | number
    | undefined;
  const company = lookupIncluded(included, "companies", companyId);

  const inboxRef = t.inbox as { id?: unknown; name?: unknown } | undefined;
  const inboxId = (t.inboxId ?? inboxRef?.id) as string | number | undefined;
  const inbox = lookupIncluded(included, "inboxes", inboxId) ?? (inboxRef as Record<string, unknown> | undefined);

  const agentRef = t.agent as { id?: unknown; firstName?: unknown; lastName?: unknown } | undefined;
  const agentId = (t.agentId ?? agentRef?.id) as string | number | undefined;
  const agent = lookupIncluded(included, "users", agentId) ?? (agentRef as Record<string, unknown> | undefined);
  const assigneeName = agent
    ? `${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim() || null
    : null;

  const customerName = customer
    ? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || null
    : null;

  // Tags: in Desk v2 these are typically references {id,type:"tags"}. Resolve via _included.
  const tagsField = t.tags as Array<{ id?: unknown; name?: unknown } | string> | undefined;
  const tags = (tagsField ?? [])
    .map((tag) => {
      if (typeof tag === "string") return tag;
      if (typeof tag.name === "string") return tag.name;
      const resolved = lookupIncluded(included, "tags", tag.id as string | number | undefined);
      return typeof resolved?.name === "string" ? (resolved.name as string) : undefined;
    })
    .filter((x): x is string => typeof x === "string" && x.length > 0);

  // Status is usually a {id,type:"ticketstatuses"} reference. Resolve via _included.
  const statusRef = t.status as { id?: unknown; name?: unknown } | undefined;
  const statusFromInc = lookupIncluded(
    included,
    "ticketstatuses",
    statusRef?.id as string | number | undefined,
  );
  const statusName =
    (typeof statusRef?.name === "string" ? (statusRef.name as string) : undefined) ??
    (statusFromInc?.name as string | undefined) ??
    (t.state as string | undefined);

  const typeRef = t.type as { id?: unknown; name?: string } | undefined;
  const typeId = typeRef?.id;
  const typeMap = t._ticketTypesById as Record<string, Record<string, unknown>> | undefined;
  const typeIncluded = lookupIncluded(
    included,
    "tickettypes",
    typeId as string | number | undefined,
  );
  const typeFromMap =
    typeId !== undefined && typeId !== null ? typeMap?.[String(typeId)] : undefined;
  const typeName =
    typeRef?.name ??
    (typeIncluded?.name as string | undefined) ??
    (typeFromMap?.name as string | undefined);

  const base = baseUrl.replace(/\/+$/, "");

  return {
    source_system: "teamwork_desk",
    external_ticket_id: raw.externalId,
    external_company_id: companyId !== undefined ? String(companyId) : null,
    company_name: s(company?.name ?? company?.companyName),
    ticket_title: s(t.subject),
    status: s(statusName),
    type: normalizeDeskType(s(typeName)),
    assigned_name_raw: assigneeName,
    assigned_external_id: agentId !== undefined ? String(agentId) : null,
    customer_name: customerName,
    inbox: s(inbox?.name),
    tags,
    ticket_url: `${base}/desk/tickets/${raw.externalId}`,
    created_at_source: s(t.createdAt),
    updated_at_source: s(t.updatedAt),
    closed_at_source: s(t.resolvedAt ?? t.closedAt),
    actual_logged_time: typeof t.timeSpent === "number" ? (t.timeSpent as number) : null,
    raw_payload: t,
  };
}
