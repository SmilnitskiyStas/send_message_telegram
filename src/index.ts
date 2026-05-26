import { runMigrations } from './db/migrate';
import { seedStores, seedUsers } from './db/seeds';
import { logger } from './utils/logger';
import { ImapService } from './services/mail/imap.service';
import { startBot, stopBot } from './services/telegram/bot.service';
import { startMessageCleanup } from './services/telegram/message-cleanup';
import { dispatchNotification } from './services/notification/dispatcher';
import { createServer, startServer } from './api/server';
import { ParsedEmail } from './types';

async function handleNewMail(email: ParsedEmail): Promise<void> {
  await dispatchNotification(email);
}

async function main() {
  logger.info('Starting mail-telegram-bot...');

  runMigrations();
  seedStores();
  seedUsers();

  const app = createServer();
  await startServer(app);

  await startBot();
  startMessageCleanup();

  const imapService = new ImapService(handleNewMail);
  imapService.start();

  const shutdown = async () => {
    logger.info('Shutting down...');
    imapService.stop();
    await stopBot();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error(err, 'Fatal error during startup');
  process.exit(1);
});
