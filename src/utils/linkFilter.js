/**
 * Lightweight regex-based link / invite filter.
 * Designed for high-throughput message streams – pure string matching, no network I/O.
 *
 * @module utils/linkFilter
 */

/**
 * Common patterns that appear in spam / raid / token-bot messages.
 * Keep the list intentionally small and fast.
 */
const LINK_PATTERNS = [
  // Generic http(s) URLs
  /https?:\/\/[^\s<>"']+/gi,
  // Discord invite links (discord.gg / discord.com/invite)
  /(?:discord(?:app)?\.com\/invite|discord\.gg)\/[a-zA-Z0-9-]+/gi,
  // Common URL shorteners frequently abused in raids
  /(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|ow\.ly)\/[^\s]+/gi,
];

/**
 * Result of a link scan.
 * @typedef {Object} LinkFilterResult
 * @property {boolean} hasLinks      - Whether any matching links were found
 * @property {string[]} matches      - The actual matched substrings
 * @property {boolean} hasInvite     - Specifically contains a Discord invite
 */

/**
 * Scans message content for unauthorized links and invites.
 *
 * @param {string} content - Raw message content
 * @returns {LinkFilterResult}
 */
export function scanLinks(content) {
  if (!content || typeof content !== 'string') {
    return { hasLinks: false, matches: [], hasInvite: false };
  }

  const matches = [];
  let hasInvite = false;

  for (const pattern of LINK_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      matches.push(match[0]);
      if (/discord(?:app)?\.com\/invite|discord\.gg/i.test(match[0])) {
        hasInvite = true;
      }
    }
  }

  return {
    hasLinks: matches.length > 0,
    matches: [...new Set(matches)], // unique
    hasInvite,
  };
}

/**
 * Convenience helper – returns true when the message should be treated as
 * link-spam (has links or invites).
 *
 * @param {string} content
 * @returns {boolean}
 */
export function isLinkSpam(content) {
  const result = scanLinks(content);
  return result.hasLinks || result.hasInvite;
}
