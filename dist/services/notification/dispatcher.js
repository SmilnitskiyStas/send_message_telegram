"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchNotification = dispatchNotification;
const crypto_1 = require("crypto");
const db_1 = require("../../db");
const logger_1 = require("../../utils/logger");
const bot_service_1 = require("../telegram/bot.service");
const store_detector_1 = require("../mail/store-detector");
const parser_service_1 = require("../mail/parser.service");
const templates_1 = require("../telegram/templates");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Затримка між відправками щоб не перевищити ліміт Telegram (30 msg/sec глобально)
const SEND_DELAY_MS = 300;
async function sendToUser(user, text, images) {
    try {
        const messageIds = await (0, bot_service_1.sendNotification)(user.telegram_chat_id, text, images);
        logger_1.logger.info({ userId: user.id, chatId: user.telegram_chat_id, role: user.role,
            name: `${user.last_name} ${user.first_name}`, receiveAll: !!user.receive_all }, 'Notification sent');
        return { ok: true, messageIds };
    }
    catch (err) {
        const errMsg = err?.message ?? String(err);
        // Користувач заблокував бота — очищаємо chat_id, генеруємо новий токен реєстрації
        if (errMsg.includes('USER_IS_BLOCKED') || errMsg.includes('bot was blocked by the user')) {
            try {
                const newToken = (0, crypto_1.randomBytes)(24).toString('hex');
                (0, db_1.dbRun)(`UPDATE users SET telegram_chat_id = NULL, telegram_username = NULL,
           registration_token = ?, updated_at = datetime('now') WHERE id = ?`, [newToken, user.id]);
                logger_1.logger.warn({ userId: user.id, chatId: user.telegram_chat_id, name: `${user.last_name} ${user.first_name}` }, 'User blocked the bot — chat_id cleared, new registration token generated');
            }
            catch (dbErr) {
                logger_1.logger.error({ dbErr, userId: user.id }, 'Failed to clear chat_id after USER_IS_BLOCKED');
            }
        }
        logger_1.logger.error({ err, userId: user.id, chatId: user.telegram_chat_id,
            name: `${user.last_name} ${user.first_name}` }, 'Failed to send notification');
        return { ok: false, error: errMsg };
    }
}
function logSends(logId, records, storeName) {
    const sql = `
    INSERT INTO message_sends
      (log_id, user_id, user_full_name, chat_id, role, store_name, status, error_message, telegram_message_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
    for (const r of records) {
        const fullName = `${r.user.last_name} ${r.user.first_name}${r.user.middle_name ? ' ' + r.user.middle_name : ''}`;
        (0, db_1.dbRun)(sql, [
            logId, r.user.id, fullName, r.user.telegram_chat_id,
            r.role, storeName, r.ok ? 'sent' : 'failed',
            r.error ?? null, r.messageIds ? JSON.stringify(r.messageIds) : null,
        ]);
    }
}
async function dispatchNotification(email) {
    const plainText = (0, parser_service_1.extractPlainText)(email);
    const store = (0, store_detector_1.detectStore)(email.subject, plainText);
    const storeName = store?.name ?? null;
    const storeId = store?.id ?? null;
    // Витягуємо поля через regex і будуємо текст
    const eventFields = (0, templates_1.extractEventDetails)(plainText);
    const notificationText = (0, templates_1.buildNotificationText)(eventFields, storeName);
    const images = email.attachments.filter(a => a.isImage);
    // 1. Охорона конкретного магазину
    const storeSecurityUsers = storeId
        ? (0, db_1.dbAll)(`SELECT * FROM users
             WHERE store_id = ? AND role = 'security' AND is_active = 1 AND telegram_chat_id IS NOT NULL`, [storeId])
        : [];
    // 2. Охорона з receive_all=1 (всі магазини), яких ще немає в списку вище
    const storeSecurityIds = new Set(storeSecurityUsers.map(u => u.id));
    const globalSecurityUsers = ((0, db_1.dbAll)(`
    SELECT * FROM users
    WHERE role = 'security' AND receive_all = 1 AND is_active = 1 AND telegram_chat_id IS NOT NULL
  `)).filter(u => !storeSecurityIds.has(u.id));
    // 3. Інші співробітники магазину (employee)
    const employeeUsers = storeId
        ? (0, db_1.dbAll)(`SELECT * FROM users
             WHERE store_id = ? AND role = 'employee' AND is_active = 1 AND telegram_chat_id IS NOT NULL`, [storeId])
        : [];
    logger_1.logger.info({
        storeId, storeName,
        cameraLabel: eventFields.cameraLabel,
        personName: eventFields.personName,
        storeSecurity: storeSecurityUsers.length,
        globalSecurity: globalSecurityUsers.length,
        employees: employeeUsers.length,
    }, 'Dispatching notification');
    const records = [];
    // Порядок: охорона магазину → глобальна охорона → співробітники магазину
    for (const user of storeSecurityUsers) {
        const res = await sendToUser(user, notificationText, images);
        records.push({ user, role: 'security', ok: res.ok, messageIds: res.messageIds, error: res.error });
        await sleep(SEND_DELAY_MS);
    }
    for (const user of globalSecurityUsers) {
        const res = await sendToUser(user, notificationText, images);
        records.push({ user, role: 'security_global', ok: res.ok, messageIds: res.messageIds, error: res.error });
        await sleep(SEND_DELAY_MS);
    }
    for (const user of employeeUsers) {
        const res = await sendToUser(user, notificationText, images);
        records.push({ user, role: 'employee', ok: res.ok, messageIds: res.messageIds, error: res.error });
        await sleep(SEND_DELAY_MS);
    }
    const notifiedIds = records.filter(r => r.ok).map(r => r.user.id);
    const failedCount = records.filter(r => !r.ok).length;
    const total = storeSecurityUsers.length + globalSecurityUsers.length + employeeUsers.length;
    const status = total === 0 ? 'no_recipients' :
        notifiedIds.length === 0 ? 'failed' : 'sent';
    const logResult = (0, db_1.dbRun)(`
    INSERT INTO notification_log
      (mail_subject, mail_from, mail_received_at, store_id, users_notified, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
        email.subject, email.from, email.date.toISOString(),
        storeId, JSON.stringify(notifiedIds), status,
    ]);
    const logId = Number(logResult.lastInsertRowid);
    if (records.length > 0)
        logSends(logId, records, storeName);
    logger_1.logger.info({ logId, notified: notifiedIds.length, failed: failedCount, status, storeName }, 'Dispatch completed');
}
//# sourceMappingURL=dispatcher.js.map