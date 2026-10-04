import { createServer, type Server } from 'node:http';
import type { Queryable } from './db';

export interface HealthState {
  startedAt: Date;
  /** Consecutive failures per job name; reset on success. */
  consecutiveFailures: Map<string, number>;
  lastJobAt: Date | null;
}

export function createHealthState(): HealthState {
  return { startedAt: new Date(), consecutiveFailures: new Map(), lastJobAt: null };
}

/** GET /health: 200 when the database answers, 503 otherwise. */
export function startHealthServer(
  port: number,
  db: Queryable,
  state: HealthState,
): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || (req.url !== '/health' && req.url !== '/')) {
      res.writeHead(404).end();
      return;
    }
    db.query('select 1')
      .then(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            service: 'worker',
            uptimeSeconds: Math.round((Date.now() - state.startedAt.getTime()) / 1000),
            lastJobAt: state.lastJobAt?.toISOString() ?? null,
            failingJobs: Object.fromEntries(
              [...state.consecutiveFailures].filter(([, n]) => n > 0),
            ),
          }),
        );
      })
      .catch(() => {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', service: 'worker', reason: 'database' }));
      });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}
