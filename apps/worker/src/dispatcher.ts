import type pg from 'pg';
import { z } from 'zod';
import type { Db } from './lib/db';
import type { Logger } from './lib/log';

export const DISPATCH_CHANNEL = 'intelligo_dispatch';

const Notification = z.object({
  kind: z.enum(['task', 'task_cancelled', 'action', 'office']),
  id: z.string(),
});
export type DispatchNotification = z.infer<typeof Notification>;

export interface DispatchHandlers {
  onNotification(notification: DispatchNotification): Promise<void>;
  /** Periodic catch-up for anything a missed notification left behind. */
  sweep(): Promise<void>;
}

/**
 * Listens to Postgres NOTIFY from the web app's writes (new tasks, approvals, office modes)
 * and sweeps on an interval, so work is never lost if the worker was offline.
 */
export class Dispatcher {
  private client: pg.PoolClient | undefined;
  private sweepTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private stopped = false;
  private sweeping = false;

  constructor(
    private readonly db: Db,
    private readonly log: Logger,
    private readonly handlers: DispatchHandlers,
    private readonly sweepIntervalMs = 15_000,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.listen();
    await this.runSweep();
    this.sweepTimer = setInterval(() => void this.runSweep(), this.sweepIntervalMs);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const client = this.client;
    this.client = undefined;
    if (client) {
      await client.query(`unlisten ${DISPATCH_CHANNEL}`).catch(() => undefined);
      client.release();
    }
  }

  private async listen(): Promise<void> {
    const client = await this.db.connect();
    this.client = client;
    client.on('notification', (message) => {
      if (message.channel !== DISPATCH_CHANNEL || !message.payload) return;
      void this.handle(message.payload);
    });
    client.on('error', (error) => {
      this.log.warn({ err: error.message }, 'koneksi LISTEN terputus, menyambung ulang');
      this.scheduleReconnect(client);
    });
    await client.query(`listen ${DISPATCH_CHANNEL}`);
  }

  private scheduleReconnect(broken: pg.PoolClient): void {
    if (this.stopped || this.reconnectTimer) return;
    if (this.client === broken) this.client = undefined;
    broken.release(true);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.listen()
        .then(() => this.runSweep())
        .catch((error: unknown) => {
          this.log.error({ err: String(error) }, 'gagal menyambung ulang LISTEN');
          if (this.client) this.scheduleReconnect(this.client);
          else this.reconnectTimer = setTimeout(() => void this.listen(), 5_000);
        });
    }, 2_000);
  }

  private async handle(raw: string): Promise<void> {
    let parsed: DispatchNotification;
    try {
      parsed = Notification.parse(JSON.parse(raw));
    } catch {
      this.log.warn({ payload: raw }, 'notifikasi dispatch tidak dikenal');
      return;
    }
    try {
      await this.handlers.onNotification(parsed);
    } catch (error) {
      this.log.error(
        { err: error instanceof Error ? error.message : String(error), notification: parsed },
        'dispatch gagal',
      );
    }
  }

  private async runSweep(): Promise<void> {
    if (this.sweeping || this.stopped) return;
    this.sweeping = true;
    try {
      await this.handlers.sweep();
    } catch (error) {
      this.log.error(
        { err: error instanceof Error ? error.message : String(error) },
        'sweep gagal',
      );
    } finally {
      this.sweeping = false;
    }
  }
}
