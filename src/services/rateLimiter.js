import redis from './redis.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Token-bucket style rate limiter backed by Redis.
 *
 * Implementation notes
 * --------------------
 * We use a fixed-window counter (INCR + PEXPIRE) which behaves like a
 * token bucket that is fully refilled every `windowMs` milliseconds.
 * For a 3-second defensive window this is:
 *   - Extremely cheap (single round-trip with MULTI)
 *   - Atomic enough for high-throughput messageCreate traffic
 *   - Perfectly suited to intercepting rapid link spam, raid bursts
 *     and token-bot floods before any heavier gateway logic runs.
 *
 * Key format (as required):
 *   tankguard:user:<userId>:msg_count
 *
 * @module services/rateLimiter
 */

/**
 * Result returned by the rate-limit check.
 * @typedef {Object} RateLimitResult
 * @property {boolean} allowed   - Whether the action is permitted
 * @property {number}  remaining - Tokens left in the current window
 * @property {number}  resetIn   - Milliseconds until the window resets
 * @property {number}  current   - Current message count in the window
 */

/**
 * Evaluates the rate limit for a given Discord user ID.
 *
 * @param {string} userId - Discord snowflake of the message author
 * @returns {Promise<RateLimitResult>}
 */
export async function checkRateLimit(userId) {
  const key = `tankguard:user:${userId}:msg_count`;
  const { max, windowMs } = config.rateLimit;

  // Atomic increment + TTL inspection
  const results = await redis
    .multi()
    .incr(key)
    .pttl(key)
    .exec();

  // ioredis multi returns [[err, result], ...]
  const count = /** @type {number} */ (results[0][1]);
  let ttl = /** @type {number} */ (results[1][1]);

  // First hit (or key somehow lost its TTL) → set the window
  if (count === 1 || ttl < 0) {
    await redis.pexpire(key, windowMs);
    ttl = windowMs;
  }

  const allowed = count <= max;
  const remaining = Math.max(0, max - count);

  return {
    allowed,
    remaining,
    resetIn: ttl > 0 ? ttl : windowMs,
    current: count,
  };
}

/**
 * Reusable middleware for `messageCreate` events.
 *
 * - Skips bots (configurable behaviour)
 * - Runs the Redis-backed rate-limit check
 * - On violation: logs, optionally deletes the message, and returns `false`
 *   so the caller can short-circuit any further processing.
 *
 * This is deliberately placed *before* any heavy gateway / moderation logic
 * so that raid & token-bot traffic is rejected as early as possible.
 *
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} `true` if the message may proceed, `false` if blocked
 */
export async function rateLimitMiddleware(message) {
  // Ignore other bots to avoid feedback loops. Change if you need to police bots too.
  if (message.author.bot) {
    return true;
  }

  // DMs and system messages are out of scope for this defensive layer
  if (!message.guild || message.system) {
    return true;
  }

  try {
    const result = await checkRateLimit(message.author.id);

    if (!result.allowed) {
      logger.warn('Rate limit exceeded – blocking message', {
        userId: message.author.id,
        guildId: message.guild.id,
        channelId: message.channel.id,
        current: result.current,
        remaining: result.remaining,
        resetInMs: result.resetIn,
      });

      // Best-effort cleanup: remove the offending message when possible
      if (message.deletable) {
        await message.delete().catch((err) => {
          logger.debug('Could not delete rate-limited message', {
            message: err.message,
          });
        });
      }

      return false;
    }

    return true;
  } catch (err) {
    // Fail-open on Redis errors so a temporary Redis outage does not
    // take the whole bot offline. Log loudly for operators.
    logger.error('Rate limiter Redis failure – allowing message (fail-open)', {
      userId: message.author.id,
      message: err.message,
    });
    return true;
  }
}
