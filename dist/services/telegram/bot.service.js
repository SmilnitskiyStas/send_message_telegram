"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBot = getBot;
exports.startBot = startBot;
exports.stopBot = stopBot;
exports.sendNotification = sendNotification;
exports.sendTextMessage = sendTextMessage;
const grammy_1 = require("grammy");
const config_1 = require("../../config");
const logger_1 = require("../../utils/logger");
const db_1 = require("../../db");
const templates_1 = require("./templates");
let bot;
function getBot() {
    if (!bot) {
        if (!config_1.config.TELEGRAM_BOT_TOKEN) {
            throw new Error('TELEGRAM_BOT_TOKEN is not set');
        }
        bot = new grammy_1.Bot(config_1.config.TELEGRAM_BOT_TOKEN);
        registerHandlers(bot);
    }
    return bot;
}
function registerHandlers(b) {
    b.command('start', async (ctx) => {
        const token = ctx.match?.trim();
        if (!token) {
            await ctx.reply('👋 Це бот сповіщень служби безпеки.\n\nДля реєстрації зверніться до адміністратора та отримайте персональне посилання.');
            return;
        }
        const db = (0, db_1.getDb)();
        const user = db
            .prepare('SELECT * FROM users WHERE registration_token = ? AND is_active = 1')
            .get([token]);
        if (!user) {
            await ctx.reply('❌ Невірний або застарілий токен реєстрації. Зверніться до адміністратора.');
            return;
        }
        if (user.telegram_chat_id) {
            await ctx.reply('ℹ️ Ваш акаунт вже зареєстровано.');
            return;
        }
        db.prepare(`UPDATE users
       SET telegram_chat_id = ?, telegram_username = ?, registration_token = NULL, updated_at = datetime('now')
       WHERE id = ?`).run([ctx.chat.id, ctx.from?.username ?? null, user.id]);
        const store = user.store_id
            ? db.prepare('SELECT * FROM stores WHERE id = ?').get([user.store_id])
            : undefined;
        const text = (0, templates_1.buildRegistrationSuccessText)(user.first_name, user.last_name, store?.name ?? null, user.role);
        await ctx.reply(text, { parse_mode: 'HTML' });
        logger_1.logger.info({ userId: user.id, chatId: ctx.chat.id, username: ctx.from?.username }, 'User registered via Telegram');
    });
    b.on('message', async (ctx) => {
        await ctx.reply('👋 Використовуйте посилання від адміністратора для реєстрації.');
    });
    b.catch((err) => {
        logger_1.logger.error({ err: err.error, ctx: err.ctx?.update }, 'Telegram bot error');
    });
}
async function startBot() {
    const b = getBot();
    // Запуск у фоні без await — bot.start() блокуючий
    b.start({
        onStart: (info) => logger_1.logger.info({ username: info.username }, 'Telegram bot started'),
    }).catch((err) => logger_1.logger.error(err, 'Telegram bot crashed'));
}
async function stopBot() {
    if (bot) {
        await bot.stop();
        logger_1.logger.info('Telegram bot stopped');
    }
}
// ── Надсилання сповіщень ──────────────────────────────────────────────────────
// Повертає масив message_id надісланих повідомлень (для подальшого видалення)
async function sendNotification(chatId, email, storeName) {
    const b = getBot();
    const text = (0, templates_1.buildNotificationText)(email, storeName);
    const images = email.attachments.filter((a) => a.isImage);
    if (images.length === 0) {
        const msg = await b.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
        return [msg.message_id];
    }
    if (images.length === 1) {
        const msg = await b.api.sendPhoto(chatId, new grammy_1.InputFile(images[0].content, images[0].filename), {
            caption: text,
            parse_mode: 'HTML',
        });
        return [msg.message_id];
    }
    // Кілька зображень — надсилаємо як media group
    const media = images.map((img, i) => grammy_1.InputMediaBuilder.photo(new grammy_1.InputFile(img.content, img.filename), {
        caption: i === 0 ? text : undefined,
        parse_mode: i === 0 ? 'HTML' : undefined,
    }));
    const msgs = await b.api.sendMediaGroup(chatId, media);
    return msgs.map((m) => m.message_id);
}
async function sendTextMessage(chatId, text) {
    const b = getBot();
    await b.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
}
//# sourceMappingURL=bot.service.js.map