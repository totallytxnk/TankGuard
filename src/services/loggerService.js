import { EmbedBuilder, Colors } from 'discord.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Discord embed logging service for TankGuard.
 *
 * Produces rich, structural embeds with a shield-themed presentation and
 * ships them asynchronously to the configured log channel so the main
 * messageCreate path is never blocked.
 *
 * @module services/loggerService
 */

/** Shield-themed accent colour (steel blue) */
const SHIELD_COLOR = 0x4a6fa5;

/** Fallback colour for critical actions */
const CRITICAL_COLOR = Colors.DarkRed;

/**
 * @typedef {'TIMEOUT_ISSUED' | 'SPAM_INTERCEPTED' | 'LINK_SPAM' | 'RATE_LIMIT' | 'QUARANTINE_FAILED'} LogAction
 */

/**
 * Human-readable labels for each action type.
 * @type {Record<LogAction, string>}
 */
const ACTION_LABELS = {
  TIMEOUT_ISSUED: 'Timeout Issued',
  SPAM_INTERCEPTED: 'Spam Intercepted',
  LINK_SPAM: 'Link / Invite Spam',
  RATE_LIMIT: 'Rate Limit Exceeded',
  QUARANTINE_FAILED: 'Quarantine Failed',
};

/**
 * Builds a rich TankGuard embed for a moderation action.
 *
 * @param {Object} opts
 * @param {LogAction} opts.action
 * @param {import('discord.js').Message} opts.message
 * @param {string} [opts.ruleMatched]
 * @param {string} [opts.extra]
 * @param {boolean} [opts.success=true]
 * @returns {EmbedBuilder}
 */
function buildEmbed({ action, message, ruleMatched = '—', extra = '', success = true }) {
  const author = message.author;
  const member = message.member;
  const createdAt = author.createdAt;
  const joinedAt = member?.joinedAt ?? null;

  const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const accountAgeStr = accountAgeDays < 1
    ? `${Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60))} hours`
    : `${accountAgeDays} day${accountAgeDays === 1 ? '' : 's'}`;

  const joinedStr = joinedAt
    ? `<t:${Math.floor(joinedAt.getTime() / 1000)}:R>`
    : 'Unknown';

  const snippet = (message.content || '[no content / embed-only]')
    .slice(0, 200)
    .replace(/`/g, "'");

  const embed = new EmbedBuilder()
    .setColor(success ? SHIELD_COLOR : CRITICAL_COLOR)
    .setAuthor({
      name: 'TankGuard  •  Automated Security',
      iconURL: message.client.user?.displayAvatarURL({ size: 64 }),
    })
    .setTitle(`🛡️  ${ACTION_LABELS[action] ?? action}`)
    .setDescription(
      [
        `**Rule matched:** \`${ruleMatched}\``,
        extra ? `**Detail:** ${extra}` : null,
      ].filter(Boolean).join('\n'),
    )
    .addFields(
      {
        name: 'Target',
        value: [
          `**User:** ${author} (\`${author.tag}\`)`,
          `**ID:** \`${author.id}\``,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Account Telemetry',
        value: [
          `**Created:** <t:${Math.floor(createdAt.getTime() / 1000)}:D>`,
          `**Age:** ${accountAgeStr}`,
          `**Joined:** ${joinedStr}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Context',
        value: [
          `**Guild:** ${message.guild?.name ?? 'Unknown'} (\`${message.guild?.id}\`)`,
          `**Channel:** ${message.channel}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Message Snippet',
        value: `\`\`\`\n${snippet || '—'}\n\`\`\``,
        inline: false,
      },
    )
    .setFooter({
      text: 'TankGuard Defensive Systems',
      iconURL: message.client.user?.displayAvatarURL({ size: 32 }),
    })
    .setTimestamp();

  return embed;
}

/**
 * Sends a moderation log embed to the configured log channel.
 * Fully asynchronous and non-blocking – failures are logged to console only.
 *
 * @param {Object} opts
 * @param {LogAction} opts.action
 * @param {import('discord.js').Message} opts.message
 * @param {string} [opts.ruleMatched]
 * @param {string} [opts.extra]
 * @param {boolean} [opts.success=true]
 * @returns {Promise<void>}
 */
export async function logModerationAction(opts) {
  const channelId = config.logChannelId;
  if (!channelId) {
    // Logging disabled – silent no-op
    return;
  }

  try {
    const client = opts.message.client;
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      logger.warn('Log channel not found or not text-based', { channelId });
      return;
    }

    const embed = buildEmbed(opts);
    await channel.send({ embeds: [embed] });
  } catch (err) {
    // Never let logging failures affect the main pipeline
    logger.error('Failed to send moderation log embed', {
      action: opts.action,
      message: err.message,
    });
  }
}

/**
 * Fire-and-forget helper so callers never await the log.
 *
 * @param {Parameters<typeof logModerationAction>[0]} opts
 */
export function logModerationActionAsync(opts) {
  // Explicitly discard the promise so the event loop is not blocked
  void logModerationAction(opts);
}
