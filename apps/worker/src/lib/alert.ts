import { maskPii } from '@intelligo/shared';
import type { HealthState } from './health';
import type { Logger } from './log';

/** SPEC Fase 8: alert when a job fails more than 3 times in a row. */
export const ALERT_AFTER_FAILURES = 3;
const ALERT_TIMEOUT_MS = 10_000;

export type PostJson = (url: string, body: Record<string, unknown>) => Promise<void>;

const postJson: PostJson = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`webhook alert membalas HTTP ${response.status}`);
};

export interface JobFailureTracker {
  succeeded(job: string): Promise<void>;
  failed(job: string, jobId: string, error: unknown): Promise<void>;
}

/**
 * Tracks consecutive failures per queue (shared with the health check). Crossing the threshold
 * logs an `alert: true` error and, when ALERT_WEBHOOK_URL is set, posts one message
 * (Slack `text` / Discord `content`); recovery posts once more. One alert per failure streak.
 */
export function createJobFailureTracker(options: {
  health: HealthState;
  log: Logger;
  webhookUrl?: string;
  post?: PostJson;
}): JobFailureTracker {
  const { health, log, webhookUrl } = options;
  const post = options.post ?? postJson;
  const alerted = new Set<string>();

  const notify = async (text: string): Promise<void> => {
    if (!webhookUrl) return;
    try {
      await post(webhookUrl, { text, content: text });
    } catch (error) {
      log.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'gagal mengirim alert',
      );
    }
  };

  return {
    async succeeded(job) {
      health.consecutiveFailures.set(job, 0);
      health.lastJobAt = new Date();
      if (alerted.delete(job)) {
        log.info({ job, alert: true }, 'job pulih');
        await notify(`[Intelligo AI Office] Job ${job} kembali berhasil.`);
      }
    },
    async failed(job, jobId, error) {
      const failures = (health.consecutiveFailures.get(job) ?? 0) + 1;
      health.consecutiveFailures.set(job, failures);
      const err = maskPii(error instanceof Error ? error.message : String(error));
      const overThreshold = failures > ALERT_AFTER_FAILURES;
      log[overThreshold ? 'error' : 'warn']({ job, jobId, failures, err }, 'job gagal');
      if (overThreshold && !alerted.has(job)) {
        alerted.add(job);
        log.error(
          { job, failures, err, alert: true },
          'ALERT: job gagal lebih dari 3 kali berturut-turut',
        );
        await notify(
          `[Intelligo AI Office] Job ${job} gagal ${failures} kali berturut-turut. Error terakhir: ${err}`,
        );
      }
    },
  };
}
