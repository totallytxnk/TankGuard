import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

/**
 * Quarantine / timeout service using native Discord timeouts.
 * Designed for single-roundtrip execution and defensive permission checks.
 *
 * @module services/quarantineService
 */

/** Default timeout duration: 10 minutes (in ms) */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** Audit reason required by the task */
const AUDIT_REASON = '[TankGuard Automated Security] High-volume spam/raid behavior detected';

/**
 * Result of a quarantine attempt.
 * @typedef {Object} QuarantineResult
 * @property {boolean} success
 * @property {string}  [reason]   - Human-readable outcome or failure cause
 * @property {Error}   [error]    - Original error if the API call failed
 */

/**
 * Attempts to apply a native Discord timeout to a guild member.
 * Performs all safety checks before the single API call.
 *
 * @param {import('discord.js').GuildMember} member - Target member
 * @param {number} [durationMs=DEFAULT_TIMEOUT_MS] - Timeout length in milliseconds
 * @returns {Promise<QuarantineResult>}
 */
export async function quarantineMember(member, durationMs = DEFAULT_TIMEOUT_MS) {
  if (!member || !member.guild) {
    return { success: false, reason: 'Invalid member object' };
  }

  const guild = member.guild;
  const me = guild.members.me;

  // ── Permission & hierarchy checks (fail fast, no API call) ──────────────
  if (!me) {
    return { success: false, reason: 'Bot member object unavailable' };
  }

  if (!me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    logger.warn('Missing MODERATE_MEMBERS permission – cannot timeout', {
      guildId: guild.id,
      targetId: member.id,
    });
    return { success: false, reason: 'Bot lacks MODERATE_MEMBERS permission' };
  }

  // Cannot timeout the guild owner
  if (member.id === guild.ownerId) {
    return { success: false, reason: 'Cannot timeout guild owner' };
  }

  // Hierarchy: bot must be higher than the target
  if (member.roles.highest.position >= me.roles.highest.position) {
    logger.warn('Target has equal or higher role hierarchy – skipping timeout', {
      guildId: guild.id,
      targetId: member.id,
    });
    return { success: false, reason: 'Insufficient role hierarchy' };
  }

  // Already timed out? (optional short-circuit)
  if (member.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now()) {
    return { success: false, reason: 'Member is already timed out' };
  }

  // ── Single-roundtrip native timeout ─────────────────────────────────────
  try {
    await member.timeout(durationMs, AUDIT_REASON);

    logger.info('Member quarantined (timeout applied)', {
      guildId: guild.id,
      targetId: member.id,
      durationMs,
      reason: AUDIT_REASON,
    });

    return { success: true, reason: 'Timeout applied successfully' };
  } catch (err) {
    // Never let Discord API failures crash the process
    logger.error('Failed to apply timeout', {
      guildId: guild.id,
      targetId: member.id,
      message: err.message,
      code: err.code,
    });

    return {
      success: false,
      reason: `API error: ${err.message}`,
      error: err,
    };
  }
}

/**
 * Convenience wrapper that resolves a member from a message and quarantines.
 * Safe to call even when the member is uncached (will fetch once).
 *
 * @param {import('discord.js').Message} message
 * @param {number} [durationMs]
 * @returns {Promise<QuarantineResult>}
 */
export async function quarantineFromMessage(message, durationMs = DEFAULT_TIMEOUT_MS) {
  if (!message.guild || !message.author) {
    return { success: false, reason: 'Message lacks guild or author' };
  }

  try {
    // Prefer cached member; fall back to a single fetch
    let member = message.member;
    if (!member) {
      member = await message.guild.members.fetch(message.author.id).catch(() => null);
    }

    if (!member) {
      return { success: false, reason: 'Could not resolve guild member' };
    }

    return quarantineMember(member, durationMs);
  } catch (err) {
    logger.error('quarantineFromMessage unexpected error', {
      message: err.message,
      userId: message.author?.id,
    });
    return { success: false, reason: err.message, error: err };
  }
}
