import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { testIntegration } from '@/server/services/syncService';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

const Body = z.object({ source_name: z.enum(['teamwork', 'teamwork_desk']) });

export const Route = createFileRoute('/api/integrations/test')({
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
        const result = await testIntegration(parsed.data.source_name);
        return jsonResponse(result);
      },
    },
  },
});
