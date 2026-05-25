"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImapService = void 0;
const imapflow_1 = require("imapflow");
const config_1 = require("../../config");
const logger_1 = require("../../utils/logger");
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
                const processedUids = [];
                for await (const msg of client.fetch({ seen: false }, { uid: true, source: true })) {
                    if (!msg.source)
                        continue;
                    try {
                        const parsed = await (0, parser_service_1.parseRawEmail)(msg.source);
                        logger_1.logger.info({ uid: msg.uid, subject: parsed.subject, from: parsed.from, attachments: parsed.attachments.length }, 'New email received');
                        await this.onNewMail(parsed);
                        processedUids.push(msg.uid);
                    }
                    catch (err) {
                        logger_1.logger.error({ err, uid: msg.uid }, 'Failed to process email');
                    }
                }
                if (processedUids.length > 0) {
                    await client.messageFlagsAdd(processedUids, ['\\Seen'], { uid: true });
                    logger_1.logger.info({ count: processedUids.length }, 'Emails marked as seen');
                }
                else {
                    logger_1.logger.debug('No new emails');
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