import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { runSync, runSyncAllEnabled, testIntegration } from '../services/syncService';
import type { SourceName } from '../adapters/types';

async function ensureAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Forbidden: admin role required');
}

const SourceSchema = z.enum(['teamwork', 'teamwork_desk']);

const SaveSchema = z.object({
  source_name: SourceSchema,
  base_url: z.string().url().max(500),
  api_key_or_token: z.string().min(1).max(2000).optional(),
  is_enabled: z.boolean(),
  notes: z.string().max(1000).optional().nullable(),
});

export const listIntegrationsFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from('integration_connections')
      .select('id,source_name,is_enabled,base_url,auth_type,last_tested_at,last_sync_at,status,notes,api_key_or_token,created_at,updated_at')
      .order('source_name');
    if (error) throw new Error(error.message);
    // Redact token: only return whether it's set
    return (data ?? []).map((r) => ({
      ...r,
      has_token: !!r.api_key_or_token,
      api_key_or_token: undefined,
    }));
  });

export const saveIntegrationFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const update: Record<string, unknown> = {
      base_url: data.base_url,
      is_enabled: data.is_enabled,
      notes: data.notes ?? null,
    };
    if (data.api_key_or_token && data.api_key_or_token.trim().length > 0) {
      update.api_key_or_token = data.api_key_or_token.trim();
    }
    const { error } = await supabaseAdmin
      .from('integration_connections')
      .update(update as never)
      .eq('source_name', data.source_name);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testIntegrationFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ source_name: SourceSchema }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    return await testIntegration(data.source_name as SourceName);
  });

export const triggerSyncFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ source_name: SourceSchema.optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    if (data.source_name) {
      const r = await runSync(data.source_name as SourceName);
      return { ok: true, results: [{ source: data.source_name, ...r }] };
    }
    const results = await runSyncAllEnabled();
    return { ok: true, results };
  });

const TicketsFilterSchema = z.object({
  source_system: SourceSchema.optional(),
  company_name: z.string().max(255).optional(),
  assigned_name_raw: z.string().max(255).optional(),
  status: z.string().max(100).optional(),
  type: z.string().max(100).optional(),
  inbox: z.string().max(255).optional(),
  tag: z.string().max(100).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.number().min(1).max(500).optional(),
});

export const listTicketsFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TicketsFilterSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    let q = supabaseAdmin
      .from('tickets')
      .select(
        'id,source_system,external_ticket_id,company_name,ticket_title,status,type,assigned_name_raw,customer_name,inbox,tags,ticket_url,created_at_source,updated_at_source,closed_at_source,actual_logged_time',
      )
      .order('created_at_source', { ascending: false, nullsFirst: false })
      .limit(data.limit ?? 200);

    if (data.source_system) q = q.eq('source_system', data.source_system);
    if (data.company_name) q = q.ilike('company_name', `%${data.company_name}%`);
    if (data.assigned_name_raw) q = q.ilike('assigned_name_raw', `%${data.assigned_name_raw}%`);
    if (data.status) q = q.eq('status', data.status);
    if (data.type) q = q.eq('type', data.type);
    if (data.inbox) q = q.eq('inbox', data.inbox);
    if (data.tag) q = q.contains('tags', [data.tag]);
    if (data.date_from) q = q.gte('created_at_source', data.date_from);
    if (data.date_to) q = q.lte('created_at_source', data.date_to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getTicketFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .eq('id', data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const listCompaniesFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from('companies')
      .select('*')
      .order('company_name');
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listSyncRunsFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from('sync_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const meFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', context.userId);
    return {
      userId: context.userId,
      roles: (data ?? []).map((r) => r.role),
      isAdmin: (data ?? []).some((r) => r.role === 'admin'),
    };
  });
