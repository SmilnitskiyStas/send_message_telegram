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
    isPolling = false;
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
        const db = (0, db_1.getDb)();
        const row = db.prepare('SELECT uid FROM processed_emails WHERE uid = ?').get([uid]);
        return !!row;
    }
    markProcessed(uid, subject) {
        const db = (0, db_1.getDb)();
        db.prepare('INSERT OR IGNORE INTO processed_emails (uid, mail_subject) VALUES (?, ?)').run([uid, subject]);
    }
    async pollOnce() {
        if (this.isPolling) {
            logger_1.logger.debug('Previous poll still running, skipping');
            return;
        }
        this.isPolling = true;
        const client = this.createClient();
        try {
            await client.connect();
            const lock = await client.getMailboxLock('INBOX');
            try {
                // Шукаємо листи за останні 2 дні — незалежно від прапора \Seen
                // Це захищає від ситуації коли інша програма вже позначила листи як прочитані
                const since = new Date();
                since.setDate(since.getDate() - 2);
                let found = 0;
                let skipped = 0;
                let processed = 0;
                for await (const msg of client.fetch({ since }, { uid: true, source: true })) {
                    if (!msg.source)
                        continue;
                    found++;
                    // Пропускаємо вже оброблені (по UID в нашій БД)
                    if (this.isProcessed(msg.uid)) {
                        skipped++;
                        continue;
                    }
                    try {
                        const parsed = await (0, parser_service_1.parseRawEmail)(msg.source);
                        logger_1.logger.info({ uid: msg.uid, subject: parsed.subject, from: parsed.from, attachments: parsed.attachments.length }, 'New email received');
                        await this.onNewMail(parsed);
                        // Зберігаємо UID в нашій БД — більше не обробляємо цей лист
                        this.markProcessed(msg.uid, parsed.subject);
                        processed++;
                        // Позначаємо лист як прочитаний у поштовій скриньці
                        try {
                            await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
                            logger_1.logger.debug({ uid: msg.uid }, 'Email marked as read');
                        }
                        catch (flagErr) {
                            logger_1.logger.warn({ flagErr, uid: msg.uid }, 'Could not mark email as read');
                        }
                    }
                    catch (err) {
                        logger_1.logger.error({ err, uid: msg.uid }, 'Failed to process email');
                    }
                }
                if (processed > 0) {
                    logger_1.logger.info({ found, skipped, processed }, 'Poll completed');
                }
                else {
                    logger_1.logger.debug({ found, skipped }, 'No new emails');
                }
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
            catch {
                // ignore logout errors
            }
        }
        finally {
            this.isPolling = false;
        }
    }
}
exports.ImapService = ImapService;
//# sourceMappingURL=imap.service.js.map