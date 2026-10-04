import pino from 'pino';

export type Logger = pino.Logger;

/** Structured JSON logs; pipe through pino-pretty in development. */
export function createLogger(level = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino({
    level,
    base: { service: 'intelligo-worker' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['*.ANTHROPIC_API_KEY', '*.N8N_WEBHOOK_SECRET', '*.DATABASE_URL', '*.password'],
      censor: '****',
    },
  });
}

/** Silent logger for tests. */
export function createTestLogger(): Logger {
  return pino({ level: 'silent' });
}
