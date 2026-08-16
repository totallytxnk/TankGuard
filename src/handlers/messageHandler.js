import { rateLimitMiddleware } from '../services/rateLimiter.js';
import { quarantineFromMessage } from '../services/quarantineService.js';
import { scanLinks } from '../utils/linkFilter.js';
import { logModerationActionAsync } from '../services/loggerService.js';
import { logger } from '../utils/logger.js';

/**
 * Full message processing pipeline for TankGuard.
 *
 * Flow:
 *  1. Rate-limit gate (Redis token-bucket)
 *  2. Link / invite scan (regex, zero network)
 *  3. On violation → quarantine (native timeout) + optional message delete
 *  4. Async Discord embed log (non-blocking)
 *  5. All errors are caught so the bot process never crashes
 *
 * @module handlers/messageHandler
 */

/**
 * Processes an incoming messageCreate event.
 * Intended to be the primary handler registered on the Discord client.
 *
 * @param {import('discord.js').Message} message
 * @returns {Promise<void>}
 */
export async function handleMessage(message) {
  // Early exits – keep the hot path as thin as possible
  if (!message.guild || message.author.bot || message.system) {
    return;
  }

  try {
    // ── 1. Rate-limit check (already deletes on exceed inside middleware) ──
    const allowedByRate = await rateLimitMiddleware(message);

    // ── 2. Link filter (runs even if rate limit passed, for pure link spam) ─
    const linkResult = scanLinks(message.content);
    const linkSpam = linkResult.hasLinks;

    // Decision matrix – rate-limit exceed OR link/invite spam both trigger quarantine
    const shouldQuarantine = !allowedByRate || linkSpam;

    if (shouldQuarantine) {
      const rules = [];
      if (!allowedByRate) rules.push('rate_limit');
      if (linkSpam) rules.push('link_filter');

      logger.warn('Automated moderation triggered', {
        userId: message.author.id,
        guildId: message.guild.id,
        channelId: message.channel.id,
        rateLimited: !allowedByRate,
        linkSpam,
        matchedLinks: linkResult.matches.slice(0, 5),
      });

      // ── Async structured log (non-blocking) ─────────────────────────────
      logModerationActionAsync({
        action: !allowedByRate ? 'SPAM_INTERCEPTED' : 'LINK_SPAM',
        message,
        ruleMatched: rules.join(' + '),
        extra: linkSpam
          ? `Matched: ${linkResult.matches.slice(0, 3).join(', ')}`
          : `Burst exceeded ${rules.includes('rate_limit') ? 'token-bucket window' : 'threshold'}`,
        success: true,
      });

      // Single-roundtrip native timeout
      const quarantineResult = await quarantineFromMessage(message);

      if (quarantineResult.success) {
        logModerationActionAsync({
          action: 'TIMEOUT_ISSUED',
          message,
          ruleMatched: rules.join(' + '),
          extra: 'Native Discord timeout applied (10 min default)',
          success: true,
        });
      } else {
        logModerationActionAsync({
          action: 'QUARANTINE_FAILED',
          message,
          ruleMatched: rules.join(' + '),
          extra: quarantineResult.reason ?? 'Unknown failure',
          success: false,
        });

        logger.debug('Quarantine skipped or failed', {
          userId: message.author.id,
          reason: quarantineResult.reason,
        });
      }

      // Extra cleanup if the rate-limit middleware did not already delete
      if (message.deletable && linkSpam) {
        await message.delete().catch(() => {
          /* swallow – already logged upstream if needed */
        });
      }

      return; // Do not continue to normal processing
    }

    // Message passed all defensive gates
    logger.debug('Message cleared by TankGuard', {
      userId: message.author.id,
      guildId: message.guild.id,
    });

    // ── Future extension point ────────────────────────────────────────────
    // Additional non-blocking checks (phishing domain lists, AI classifiers,
    // slow-mode enforcement, etc.) can be added here.
  } catch (err) {
    // Absolute last-resort guard – never let an unhandled rejection kill the process
    logger.error('Unhandled error inside messageHandler', {
      userId: message.author?.id,
      guildId: message.guild?.id,
      message: err.message,
      stack: err.stack,
    });
  }
}

// Re-export for convenience / backwards compatibility
export { handleMessage as handleMessageCreate };