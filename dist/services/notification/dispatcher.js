"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchNotification = dispatchNotification;
const db_1 = require("../../db");
const logger_1 = require("../../utils/logger");
const bot_service_1 = require("../telegram/bot.service");
const store_detector_1 = require("../mail/store-detector");
const parser_service_1 = require("../mail/parser.service");
async function sendToUser(user, email, storeName) {
    try {
        await (0, bot_service_1.sendNotification)(user.telegram_chat_id, email, storeName);
        logger_1.logger.info({ userId: user.id, chatId: user.telegram_chat_id, role: user.role,
            name: `${user.last_name} ${user.first_name}`, receiveAll: !!user.receive_all }, 'Notification sent');
        return { ok: true };
    }
    catch (err) {
        const errMsg = err?.message ?? String(err);
        logger_1.logger.error({ err, userId: user.id, chatId: user.telegram_chat_id,
            name: `${user.last_name} ${user.first_name}` }, 'Failed to send notification');
        return { ok: false, error: errMsg };
    }
}
function logSends(logId, records, storeName) {
    const db = (0, db_1.getDb)();
    const stmt = db.prepare(`
    INSERT INTO message_sends
      (log_id, user_id, user_full_name, chat_id, role, store_name, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
    for (const r of records) {
        const fullName = `${r.user.last_name} ${r.user.first_name}${r.user.middle_name ? ' ' + r.user.middle_name : ''}`;
        stmt.run([
            logId,
            r.user.id,
            fullName,
            r.user.telegram_chat_id,
            r.role,
            storeName,
            r.ok ? 'sent' : 'failed',
            r.error ?? null,
        ]);
    }
}
async function dispatchNotification(email) {
    const db = (0, db_1.getDb)();
    const plainText = (0, parser_service_1.extractPlainText)(email);
    const { cameraNumber } = (0, store_detector_1.parseEncodingDevice)(plainText);
    const store = (0, store_detector_1.detectStore)(email.subject, plainText);
    const storeName = store?.name ?? null;
    const storeId = store?.id ?? null;
    // 1. Охорона конкретного магазину
    const storeSecurityUsers = storeId
        ? db.prepare(`
        SELECT * FROM users
        WHERE store_id = ? AND role = 'security' AND is_active = 1 AND telegram_chat_id IS NOT NULL
      `).all([storeId])
        : [];
    // 2. Охорона з receive_all=1 (всі магазини), яких ще немає в списку вище
    const storeSecurityIds = new Set(storeSecurityUsers.map(u => u.id));
    const globalSecurityUsers = db.prepare(`
    SELECT * FROM users
    WHERE role = 'security' AND receive_all = 1 AND is_active = 1 AND telegram_chat_id IS NOT NULL
  `).all([]).filter(u => !storeSecurityIds.has(u.id));
    // 3. Інші співробітники магазину (employee)
    const employeeUsers = storeId
        ? db.prepare(`
        SELECT * FROM users
        WHERE store_id = ? AND role = 'employee' AND is_active = 1 AND telegram_chat_id IS NOT NULL
      `).all([storeId])
        : [];
    logger_1.logger.info({
        storeId, storeName, cameraNumber,
        storeSecurity: storeSecurityUsers.length,
        globalSecurity: globalSecurityUsers.length,
        employees: employeeUsers.length,
    }, 'Dispatching notification');
    const records = [];
    // Порядок: охорона магазину → глобальна охорона → співробітники магазину
    for (const user of storeSecurityUsers) {
        const res = await sendToUser(user, email, storeName);
        records.push({ user, role: 'security', ...res });
    }
    for (const user of globalSecurityUsers) {
        const res = await sendToUser(user, email, storeName);
        records.push({ user, role: 'security_global', ...res });
    }
    for (const user of employeeUsers) {
        const res = await sendToUser(user, email, storeName);
        records.push({ user, role: 'employee', ...res });
    }
    const notifiedIds = records.filter(r => r.ok).map(r => r.user.id);
    const failedCount = records.filter(r => !r.ok).length;
    const total = storeSecurityUsers.length + globalSecurityUsers.length + employeeUsers.length;
    const status = total === 0 ? 'no_recipients' :
        notifiedIds.length === 0 ? 'failed' : 'sent';
    const logResult = db.prepare(`
    INSERT INTO notification_log
      (mail_subject, mail_from, mail_received_at, store_id, users_notified, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run([
        email.subject, email.from, email.date.toISOString(),
        storeId, JSON.stringify(notifiedIds), status,
    ]);
    const logId = Number(logResult.lastInsertRowid);
    if (records.length > 0)
        logSends(logId, records, storeName);
    logger_1.logger.info({ logId, notified: notifiedIds.length, failed: failedCount, status, storeName, cameraNumber }, 'Dispatch completed');
}
//# sourceMappingURL=dispatcher.js.map