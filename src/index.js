import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';
import { config, validateConfig } from './config/index.js';
import redis, { closeRedis } from './services/redis.js';
import { handleMessageCreate } from './handlers/messageHandler.js';
import { logger } from './utils/logger.js';

/**
 * TankGuard – high-performance defensive Discord security bot.
 *
 * Bootstrap sequence:
 *  1. Validate configuration
 *  2. Connect to Redis
 *  3. Login the Discord client
 *  4. Register event handlers
 *  5. Install graceful shutdown hooks
 */

validateConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // required if you later inspect message content
    GatewayIntentBits.GuildMembers,   // useful for future anti-raid features
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (readyClient) => {
  logger.info(`Logged in as ${readyClient.user.tag}`, {
    id: readyClient.user.id,
    guilds: readyClient.guilds.cache.size,
  });
});

client.on(Events.MessageCreate, (message) => {
  // Fire-and-forget with error boundary so a single bad message
  // cannot crash the process.
  handleMessageCreate(message).catch((err) => {
    logger.error('Unhandled error in messageCreate handler', {
      message: err.message,
      stack: err.stack,
    });
  });
});

/**
 * Graceful shutdown – close Redis and destroy the Discord client.
 * @param {string} signal
 */
async function shutdown(signal) {
  logger.info(`Received ${signal} – shutting down gracefully`);
  try {
    client.destroy();
    await closeRedis();
  } catch (err) {
    logger.error('Error during shutdown', { message: err.message });
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

/**
 * Application entry point.
 */
async function bootstrap() {
  try {
    logger.info('Connecting to Redis…');
    await redis.connect();

    logger.info('Logging in to Discord…');
    await client.login(config.discordToken);
  } catch (err) {
    logger.error('Failed to start TankGuard', {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

bootstrap();