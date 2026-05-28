import cron from 'node-cron';
import { getBot } from './bot.service';
import { dbAll, dbRun } from '../../db';
import { config } from '../../config';
import { logger } from '../../utils/logger';

async function deleteOldMessages(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.MESSAGE_DELETE_AFTER_DAYS);
  const cutoffStr = cutoff.toISOString();

  const rows: any[] = dbAll(`
    SELECT id, chat_id, telegram_message_ids
    FROM message_sends
    WHERE telegram_message_ids IS NOT NULL
      AND sent_at < ?
  `, [cutoffStr]);

  if (rows.length === 0) {
    logger.info({ cutoffDays: config.MESSAGE_DELETE_AFTER_DAYS }, 'Message cleanup: nothing to delete');
    return;
  }

  const bot = getBot();
  let deleted = 0;
  let skipped = 0;

  for (const row of rows) {
    let messageIds: number[] = [];
    try {
      messageIds = JSON.parse(row.telegram_message_ids);
    } catch {
      messageIds = [];
    }

    for (const msgId of messageIds) {
      try {
        await bot.api.deleteMessage(row.chat_id, msgId);
        deleted++;
      } catch (err: any) {
        // Повідомлення вже видалено або не знайдено — нормальна ситуація
        skipped++;
      }
    }

    // Прибираємо message_ids щоб не намагатись видалити повторно
    dbRun('UPDATE message_sends SET telegram_message_ids = NULL WHERE id = ?', [row.id]);
  }

  logger.info(
    { deleted, skipped, total: rows.length, cutoffDays: config.MESSAGE_DELETE_AFTER_DAYS },
    'Message cleanup completed',
  );
}

export function startMessageCleanup(): void {
  if (config.MESSAGE_DELETE_AFTER_DAYS <= 0) {
    logger.info('Message auto-delete disabled (MESSAGE_DELETE_AFTER_DAYS=0)');
    return;
  }

  // Запускати щодня о 03:00
  cron.schedule('0 3 * * *', async () => {
    logger.info('Running scheduled message cleanup...');
    await deleteOldMessages().catch((err) =>
      logger.error(err, 'Message cleanup error'),
    );
  });

  logger.info(
    { deleteAfterDays: config.MESSAGE_DELETE_AFTER_DAYS },
    'Message cleanup scheduled (daily at 03:00)',
  );
}
