/**
 * Lightweight structured logger.
 * Keeps console output consistent and easy to replace later
 * (e.g. with pino / winston) without touching business logic.
 */

const PREFIX = '[TankGuard]';

/**
 * @param {string} level
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
function log(level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };
  // Structured JSON for production log aggregation; human-readable fallback
  if (process.env.NODE_ENV === 'production') {
    console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
  } else {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console[level === 'error' ? 'error' : 'log'](`${PREFIX} ${level.toUpperCase()} ${message}${metaStr}`);
  }
}

export const logger = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => {
    if (process.env.DEBUG) log('debug', msg, meta);
  },
};
