import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { stepRun } from '@/server/services/syncService';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

const Body = z.object({ run_id: z.string().uuid(), steps: z.number().int().min(1).max(10).optional() });

/**
 * Advances a sync run by a few bounded units of work. The browser calls this
 * repeatedly until `done` is true, which keeps every request short and gives
 * live progress instead of a request that times out at the gateway.
 */
export const Route = createFileRoute('/api/integrations/sync-step')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireAdminFromRequest(request);
        } catch (r) {
          return r as Response;
        }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body' }, { status: 400 });

        try {
          const steps = parsed.data.steps ?? 3;
          let result = await stepRun(parsed.data.run_id);
          for (let i = 1; i < steps && !result.done; i++) {
            result = await stepRun(parsed.data.run_id);
          }
          return jsonResponse(result);
        } catch (e) {
          return jsonResponse(
            { error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
