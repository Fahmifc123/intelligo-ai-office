import { describe, expect, it } from 'vitest';
import { createJobFailureTracker } from '../../src/lib/alert';
import { createHealthState } from '../../src/lib/health';
import { createLogger } from '../../src/lib/log';

function setup(webhookUrl?: string) {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const health = createHealthState();
  const tracker = createJobFailureTracker({
    health,
    log: createLogger('silent'),
    webhookUrl,
    post: (url, body) => {
      posts.push({ url, body });
      return Promise.resolve();
    },
  });
  return { posts, health, tracker };
}

describe('createJobFailureTracker', () => {
  it('alerts once when a job fails more than 3 times in a row, then once on recovery', async () => {
    const { posts, health, tracker } = setup('https://hooks.example.test/alert');
    for (let i = 0; i < 3; i += 1) await tracker.failed('run-task', `job-${i}`, new Error('boom'));
    expect(posts).toHaveLength(0);

    await tracker.failed('run-task', 'job-3', new Error('boom'));
    await tracker.failed('run-task', 'job-4', new Error('boom'));
    expect(posts).toHaveLength(1);
    expect(posts[0]?.url).toBe('https://hooks.example.test/alert');
    expect(String(posts[0]?.body.text)).toContain('run-task gagal 4 kali berturut-turut');
    expect(health.consecutiveFailures.get('run-task')).toBe(5);

    await tracker.succeeded('run-task');
    expect(health.consecutiveFailures.get('run-task')).toBe(0);
    expect(posts).toHaveLength(2);
    expect(String(posts[1]?.body.text)).toContain('kembali berhasil');
  });

  it('counts each queue separately and masks phone numbers in the alert', async () => {
    const { posts, tracker } = setup('https://hooks.example.test/alert');
    for (let i = 0; i < 4; i += 1) {
      await tracker.failed('execute-action', `a-${i}`, new Error('gagal kirim ke 081234567890'));
    }
    await tracker.failed('review-task', 'r-0', new Error('x'));
    expect(posts).toHaveLength(1);
    expect(String(posts[0]?.body.text)).not.toContain('081234567890');
  });

  it('only logs when no webhook is configured', async () => {
    const { posts, tracker } = setup(undefined);
    for (let i = 0; i < 5; i += 1) await tracker.failed('route-task', `j-${i}`, 'err');
    expect(posts).toHaveLength(0);
  });
});
