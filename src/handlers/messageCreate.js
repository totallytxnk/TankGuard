import { rateLimitMiddleware } from '../services/rateLimiter.js';
import { logger } from '../utils/logger.js';

/**
 * Primary `messageCreate` handler.
 *
 * The rate-limit middleware is invoked first so that rapid link spam,
 * raid bursts and token-bot floods are intercepted before any other
 * business logic executes.
 *
 * @param {import('discord.js').Message} message
 * @returns {Promise<void>}
 */
export async function handleMessageCreate(message) {
  // 1. Early defensive gate
  const allowed = await rateLimitMiddleware(message);
  if (!allowed) {
    return; // Short-circuit – do not run any further logic
  }

  // 2. Place additional security / moderation features below this line.
  //    Examples (not implemented here):
  //    - link / invite filtering
  //    - phishing URL checks
  //    - advanced anti-raid heuristics
  //    - logging of suspicious patterns

  logger.debug('Message passed rate-limit gate', {
    userId: message.author.id,
    guildId: message.guild?.id,
  });
}
