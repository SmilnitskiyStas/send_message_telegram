"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImapService = void 0;
const imapflow_1 = require("imapflow");
const config_1 = require("../../config");
const logger_1 = require("../../utils/logger");
const db_1 = require("../../db");
const parser_service_1 = require("./parser.service");
class ImapService {
    onNewMail;
    pollTimer = null;
    isPolling = false; // блокує тільки IMAP-фазу
    isDispatching = false; // інформаційний прапор (не блокує новий poll)
    constructor(onNewMail) {
        this.onNewMail = onNewMail;
    }
    start() {
        logger_1.logger.info({ host: config_1.config.MAIL_HOST, user: config_1.config.MAIL_USER, intervalSec: config_1.config.MAIL_POLL_INTERVAL_SEC }, 'IMAP polling started');
        this.pollOnce();
        this.pollTimer = setInterval(() => this.pollOnce(), config_1.config.MAIL_POLL_INTERVAL_SEC * 1000);
    }
    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        logger_1.logger.info('IMAP polling stopped');
    }
    createClient() {
        return new imapflow_1.ImapFlow({
            host: config_1.config.MAIL_HOST,
            port: config_1.config.MAIL_PORT,
            secure: true,
            auth: {
                user: config_1.config.MAIL_USER,
                pass: config_1.config.MAIL_PASS,
            },
            logger: false,
            tls: {
                rejectUnauthorized: false,
            },
        });
    }
    isProcessed(uid) {
        return !!(0, db_1.dbGet)('SELECT uid FROM processed_emails WHERE uid = ?', [uid]);
    }
    markProcessed(uid, subject) {
        (0, db_1.dbRun)('INSERT OR IGNORE INTO processed_emails (uid, mail_subject) VALUES (?, ?)', [uid, subject]);
    }
    // ─── Фаза 1: IMAP ────────────────────────────────────────────────────────────
    // Підключається, парсить нові листи, мітить прочитаними, відключається.
    // isPolling = true ТІЛЬКИ протягом цієї фази (секунди).
    async fetchNewEmails() {
        const fetched = [];
        const client = this.createClient();
        try {
            await client.connect();
            const lock = await client.getMailboxLock('INBOX');
            try {
                const since = new Date();
                since.setDate(since.getDate() - 2);
                let found = 0, skipped = 0;
                for await (const msg of client.fetch({ since }, { uid: true, source: true })) {
                    if (!msg.source)
                        continue;
                    found++;
                    if (this.isProcessed(msg.uid)) {
                        skipped++;
                        continue;
                    }
                    try {
                        const parsed = await (0, parser_service_1.parseRawEmail)(msg.source);
                        fetched.push({ uid: msg.uid, parsed });
                        logger_1.logger.info({ uid: msg.uid, subject: parsed.subject, from: parsed.from, attachments: parsed.attachments.length }, 'New email fetched');
                    }
                    catch (err) {
                        logger_1.logger.error({ err, uid: msg.uid }, 'Failed to parse email');
                    }
                }
                // Одразу мітимо прочитаними всі нові листи (поки з'єднання відкрите)
                for (const { uid } of fetched) {
                    try {
                        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
                    }
                    catch (flagErr) {
                        logger_1.logger.warn({ flagErr, uid }, 'Could not mark email as read');
                    }
                }
                logger_1.logger.debug({ found, skipped, newEmails: fetched.length }, 'IMAP fetch completed');
            }
            finally {
                lock.release();
            }
            await client.logout();
        }
        catch (err) {
            logger_1.logger.error({ err }, 'IMAP poll error');
            try {
                await client.logout();
            }
            catch { /* ignore */ }
        }
        return fetched;
    }
    // ─── Фаза 2: Dispatch ────────────────────────────────────────────────────────
    // Відправляє в Telegram. Виконується ПІСЛЯ того як isPolling знятий,
    // тому наступний poll може стартувати не чекаючи завершення відправки.
    async dispatchEmails(emails) {
        this.isDispatching = true;
        let processed = 0;
        for (const { uid, parsed } of emails) {
            // Зберігаємо в БД одразу — щоб повторний poll не взяв той самий лист
            this.markProcessed(uid, parsed.subject);
            try {
                await this.onNewMail(parsed);
                processed++;
            }
            catch (err) {
                logger_1.logger.error({ err, uid }, 'Failed to dispatch notification');
            }
        }
        if (processed > 0) {
            logger_1.logger.info({ processed }, 'Dispatch completed');
        }
        this.isDispatching = false;
    }
    // ─── Основний цикл ───────────────────────────────────────────────────────────
    async pollOnce() {
        if (this.isPolling) {
            logger_1.logger.debug('Previous IMAP fetch still running, skipping');
            return;
        }
        this.isPolling = true;
        let emails = [];
        try {
            emails = await this.fetchNewEmails();
        }
        finally {
            // isPolling знімається ОДРАЗУ після IMAP — не чекаємо Telegram
            this.isPolling = false;
        }
        if (emails.length > 0) {
            // Dispatch запускається асинхронно, не блокуючи наступний poll
            this.dispatchEmails(emails).catch(err => logger_1.logger.error({ err }, 'Unexpected error in dispatchEmails'));
        }
    }
}
exports.ImapService = ImapService;
//# sourceMappingURL=imap.service.js.map