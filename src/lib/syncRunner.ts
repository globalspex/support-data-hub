import { apiFetch } from '@/lib/api';

export interface StepResult {
  done: boolean;
  runId: string;
  stage: string;
  page: number;
  received: number;
  created: number;
  updated: number;
  errorCount: number;
  status: string;
  message: string;
}

/**
 * Drives a sync run to completion from the browser: each call does a small,
 * bounded amount of server work, so no single request can hit the gateway
 * timeout and progress stays visible.
 */
export async function driveRun(
  runId: string,
  onProgress: (r: StepResult) => void,
  opts: { steps?: number; maxCalls?: number } = {},
): Promise<StepResult> {
  const steps = opts.steps ?? 3;
  const maxCalls = opts.maxCalls ?? 5000;
  let last: StepResult | null = null;

  for (let i = 0; i < maxCalls; i++) {
    const r = (await apiFetch('/api/integrations/sync-step', {
      method: 'POST',
      body: JSON.stringify({ run_id: runId, steps }),
    })) as StepResult;
    last = r;
    onProgress(r);
    if (r.done) return r;
  }
  return last ?? { done: false, runId, stage: 'unknown', page: 0, received: 0, created: 0, updated: 0, errorCount: 0, status: 'running', message: 'Stopped after too many steps' };
}

export function stageLabel(stage: string): string {
  if (stage.startsWith('ref:')) return `Loading ${stage.slice(4).replace(/_/g, ' ')}`;
  if (stage === 'tickets') return 'Importing tickets';
  if (stage === 'timelogs') return 'Importing time logs';
  if (stage === 'finalize') return 'Applying time & rates';
  if (stage === 'done') return 'Finished';
  return stage;
}
