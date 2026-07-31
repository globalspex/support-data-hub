import { createFileRoute } from '@tanstack/react-router';
import { getIntegration } from '@/server/services/syncService';
import { basicAuthHeader, trimBaseUrl } from '@/server/adapters/types';
import { jsonResponse } from '@/server/services/apiAuth';

// TEMPORARY debug route used to inspect upstream API shapes. Safe to delete.
export const Route = createFileRoute('/api/internal/probe')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const source = (url.searchParams.get('source') ?? 'teamwork') as 'teamwork' | 'teamwork_desk';
        const path = url.searchParams.get('path') ?? '/projects/api/v3/tasks.json?pageSize=2&include=projects,companies,users,tags';
        const row = await getIntegration(source);
        if (!row?.base_url || !row.api_key_or_token) return jsonResponse({ error: 'not configured' }, { status: 400 });
        const target = `${trimBaseUrl(row.base_url)}${path}`;
        const res = await fetch(target, {
          headers: {
            Authorization:
              source === 'teamwork'
                ? basicAuthHeader(row.api_key_or_token)
                : `Bearer ${row.api_key_or_token}`,
            Accept: 'application/json',
          },
        });
        const text = await res.text();
        return jsonResponse({ status: res.status, body: text.slice(0, 6000) });
      },
    },
  },
});
