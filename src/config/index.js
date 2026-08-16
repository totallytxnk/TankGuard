import 'dotenv/config';

/**
 * Central application configuration.
 * All values are sourced from environment variables with safe defaults
 * where appropriate. Critical secrets are validated at startup.
 *
 * @typedef {Object} RateLimitConfig
 * @property {number} max        - Maximum messages allowed in the window
 * @property {number} windowMs   - Window duration in milliseconds
 *
 * @typedef {Object} AppConfig
 * @property {string} discordToken
 * @property {string} redisUrl
 * @property {string} logChannelId
 * @property {RateLimitConfig} rateLimit
 */

/** @type {AppConfig} */
export const config = {
  discordToken: process.env.DISCORD_TOKEN ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  logChannelId: process.env.LOG_CHANNEL_ID ?? '',
  rateLimit: {
    max: Number.parseInt(process.env.RATE_LIMIT_MAX ?? '5', 10),
    windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '3000', 10),
  },
};

/**
 * Validates that all required configuration values are present.
 * Throws early so the process fails fast on misconfiguration.
 * @throws {Error}
 */
export function validateConfig() {
  if (!config.discordToken) {
    throw new Error('DISCORD_TOKEN is required. See .env.example');
  }
  if (!config.redisUrl) {
    throw new Error('REDIS_URL is required. See .env.example');
  }
  if (Number.isNaN(config.rateLimit.max) || config.rateLimit.max < 1) {
    throw new Error('RATE_LIMIT_MAX must be a positive integer');
  }
  if (Number.isNaN(config.rateLimit.windowMs) || config.rateLimit.windowMs < 100) {
    throw new Error('RATE_LIMIT_WINDOW_MS must be >= 100');
  }
}
