import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/sync-runs/verification')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const source = url.searchParams.get('source') ?? 'teamwork';

        // Counts
        const [{ count: total }, { count: withTime }, { count: zeroTime }] = await Promise.all([
          supabaseAdmin
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('source_system', source),
          supabaseAdmin
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('source_system', source)
            .not('actual_logged_time', 'is', null)
            .gt('actual_logged_time', 0),
          supabaseAdmin
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('source_system', source)
            .or('actual_logged_time.is.null,actual_logged_time.eq.0'),
        ]);

        // Sum of logged hours
        const { data: sumRow } = await supabaseAdmin
          .from('tickets')
          .select('actual_logged_time')
          .eq('source_system', source)
          .not('actual_logged_time', 'is', null);
        const totalHours = (sumRow ?? []).reduce(
          (a, r) => a + Number((r as { actual_logged_time: number | null }).actual_logged_time ?? 0),
          0,
        );

        // Sample of mapped taskId -> hours (highest first), useful for spot-checking against Teamwork
        const { data: sample } = await supabaseAdmin
          .from('tickets')
          .select('external_ticket_id,ticket_title,actual_logged_time,ticket_url')
          .eq('source_system', source)
          .not('actual_logged_time', 'is', null)
          .gt('actual_logged_time', 0)
          .order('actual_logged_time', { ascending: false })
          .limit(20);

        return Response.json({
          source,
          totals: {
            total: total ?? 0,
            withLoggedTime: withTime ?? 0,
            zeroOrNull: zeroTime ?? 0,
            totalLoggedHours: Number(totalHours.toFixed(2)),
          },
          sample: sample ?? [],
        });
      },
    },
  },
});
