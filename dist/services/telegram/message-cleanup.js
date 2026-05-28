"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMessageCleanup = startMessageCleanup;
const node_cron_1 = __importDefault(require("node-cron"));
const bot_service_1 = require("./bot.service");
const db_1 = require("../../db");
const config_1 = require("../../config");
const logger_1 = require("../../utils/logger");
async function deleteOldMessages() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - config_1.config.MESSAGE_DELETE_AFTER_DAYS);
    const cutoffStr = cutoff.toISOString();
    const rows = (0, db_1.dbAll)(`
    SELECT id, chat_id, telegram_message_ids
    FROM message_sends
    WHERE telegram_message_ids IS NOT NULL
      AND sent_at < ?
  `, [cutoffStr]);
    if (rows.length === 0) {
        logger_1.logger.info({ cutoffDays: config_1.config.MESSAGE_DELETE_AFTER_DAYS }, 'Message cleanup: nothing to delete');
        return;
    }
    const bot = (0, bot_service_1.getBot)();
    let deleted = 0;
    let skipped = 0;
    for (const row of rows) {
        let messageIds = [];
        try {
            messageIds = JSON.parse(row.telegram_message_ids);
        }
        catch {
            messageIds = [];
        }
        for (const msgId of messageIds) {
            try {
                await bot.api.deleteMessage(row.chat_id, msgId);
                deleted++;
            }
            catch (err) {
                // Повідомлення вже видалено або не знайдено — нормальна ситуація
                skipped++;
            }
        }
        // Прибираємо message_ids щоб не намагатись видалити повторно
        (0, db_1.dbRun)('UPDATE message_sends SET telegram_message_ids = NULL WHERE id = ?', [row.id]);
    }
    logger_1.logger.info({ deleted, skipped, total: rows.length, cutoffDays: config_1.config.MESSAGE_DELETE_AFTER_DAYS }, 'Message cleanup completed');
}
function startMessageCleanup() {
    if (config_1.config.MESSAGE_DELETE_AFTER_DAYS <= 0) {
        logger_1.logger.info('Message auto-delete disabled (MESSAGE_DELETE_AFTER_DAYS=0)');
        return;
    }
    // Запускати щодня о 03:00
    node_cron_1.default.schedule('0 3 * * *', async () => {
        logger_1.logger.info('Running scheduled message cleanup...');
        await deleteOldMessages().catch((err) => logger_1.logger.error(err, 'Message cleanup error'));
    });
    logger_1.logger.info({ deleteAfterDays: config_1.config.MESSAGE_DELETE_AFTER_DAYS }, 'Message cleanup scheduled (daily at 03:00)');
}
//# sourceMappingURL=message-cleanup.js.map