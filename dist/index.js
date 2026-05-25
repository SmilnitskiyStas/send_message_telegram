"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const migrate_1 = require("./db/migrate");
const seeds_1 = require("./db/seeds");
const logger_1 = require("./utils/logger");
const imap_service_1 = require("./services/mail/imap.service");
const bot_service_1 = require("./services/telegram/bot.service");
const dispatcher_1 = require("./services/notification/dispatcher");
const server_1 = require("./api/server");
async function handleNewMail(email) {
    await (0, dispatcher_1.dispatchNotification)(email);
}
async function main() {
    logger_1.logger.info('Starting mail-telegram-bot...');
    (0, migrate_1.runMigrations)();
    (0, seeds_1.seedStores)();
    (0, seeds_1.seedUsers)();
    await (0, bot_service_1.startBot)();
    const app = (0, server_1.createServer)();
    (0, server_1.startServer)(app);
    const imapService = new imap_service_1.ImapService(handleNewMail);
    imapService.start();
    const shutdown = async () => {
        logger_1.logger.info('Shutting down...');
        imapService.stop();
        await (0, bot_service_1.stopBot)();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
main().catch((err) => {
    logger_1.logger.error(err, 'Fatal error during startup');
    process.exit(1);
});
//# sourceMappingURL=index.js.map