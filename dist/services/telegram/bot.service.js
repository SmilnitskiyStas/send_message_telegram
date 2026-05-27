"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
        bot = new grammy_1.Bot(config_1.config.TELEGRAM_BOT_TOKEN, {
            client: { timeoutSeconds: 30 }, // Зменшено з 500с (стандарт) до 30с
        });
        registerHandlers(bot);
    }
    return bot;
}
// Нормалізація телефону — тільки цифри
function normalizePhone(phone) {
    return phone.replace(/\D/g, '');
}
function registerHandlers(b) {
    // ─── /start без токена — просимо поділитися номером ───────────────────────
    b.command('start', async (ctx) => {
        const token = ctx.match?.trim();
        if (!token) {
            await ctx.reply('👋 Привіт!\n\nЦей бот надсилає сповіщення служби безпеки магазинів.\n\n' +
                '📱 Щоб отримати посилання для реєстрації, натисніть кнопку нижче та поділіться своїм номером телефону:', {
                reply_markup: {
                    keyboard: [[{ text: '📱 Поділитися номером телефону', request_contact: true }]],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            });
            return;
        }
        // ─── /start з токеном — стандартна реєстрація ─────────────────────────
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
        await ctx.reply((0, templates_1.buildRegistrationSuccessText)(user.first_name, user.last_name, store?.name ?? null, user.role), { parse_mode: 'HTML' });
        logger_1.logger.info({ userId: user.id, chatId: ctx.chat.id, username: ctx.from?.username }, 'User registered via Telegram');
    });
    // ─── Користувач поділився номером телефону ────────────────────────────────
    b.on('message:contact', async (ctx) => {
        const contact = ctx.message.contact;
        if (!contact?.phone_number)
            return;
        // Перевіряємо що користувач поділився СВОЇМ номером (не чужим)
        if (contact.user_id && contact.user_id !== ctx.from?.id) {
            await ctx.reply('⚠️ Будь ласка, поділіться своїм власним номером телефону.', { reply_markup: { remove_keyboard: true } });
            return;
        }
        const db = (0, db_1.getDb)();
        const normalizedIncoming = normalizePhone(contact.phone_number);
        // Шукаємо користувача за номером телефону
        const allUsers = db.prepare('SELECT * FROM users WHERE is_active = 1 AND telegram_chat_id IS NULL').all();
        const matched = allUsers.find((u) => normalizePhone(u.phone) === normalizedIncoming ||
            // Підтримка формату без коду країни (380XXXXXXXX vs 0XXXXXXXX)
            normalizePhone(u.phone).endsWith(normalizedIncoming.slice(-9)) ||
            normalizedIncoming.endsWith(normalizePhone(u.phone).slice(-9)));
        if (!matched) {
            await ctx.reply('❌ Ваш номер телефону не знайдено в системі або акаунт вже зареєстровано.\n\n' +
                'Зверніться до адміністратора.', { reply_markup: { remove_keyboard: true } });
            logger_1.logger.info({ phone: normalizedIncoming, chatId: ctx.chat.id }, 'Phone not found in users for registration');
            return;
        }
        if (!matched.registration_token) {
            // Генеруємо новий токен якщо його нема
            const { randomBytes } = await Promise.resolve().then(() => __importStar(require('crypto')));
            const newToken = randomBytes(24).toString('hex');
            db.prepare(`UPDATE users SET registration_token = ? WHERE id = ?`).run([newToken, matched.id]);
            matched.registration_token = newToken;
        }
        const botName = config_1.config.TELEGRAM_BOT_NAME;
        const link = `https://t.me/${botName}?start=${matched.registration_token}`;
        await ctx.reply(`✅ Знайшли ваш акаунт!\n\n` +
            `👤 <b>${matched.last_name} ${matched.first_name}</b>\n\n` +
            `Для завершення реєстрації натисніть кнопку нижче:`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                        { text: '✅ Зареєструватися', url: link },
                    ]],
                remove_keyboard: true,
            },
        });
        logger_1.logger.info({ userId: matched.id, phone: normalizedIncoming, chatId: ctx.chat.id }, 'Registration link sent via phone lookup');
    });
    // ─── Будь-яке інше повідомлення ───────────────────────────────────────────
    b.on('message', async (ctx) => {
        await ctx.reply('👋 Використовуйте посилання від адміністратора або натисніть /start для реєстрації.');
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
// ── Утиліти ───────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// Retry з затримкою при 429 Too Many Requests
async function withRetry(fn, maxAttempts = 4) {
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            const retryAfter = err?.parameters?.retry_after ?? err?.retry_after ?? 10;
            if (err?.error_code === 429 || String(err?.message).includes('429')) {
                const waitMs = (retryAfter + 1) * 1000;
                logger_1.logger.warn({ attempt, waitMs, retryAfter }, 'Telegram rate limit (429), waiting before retry');
                await sleep(waitMs);
            }
            else {
                throw err;
            }
        }
    }
    throw lastErr;
}
// ── Надсилання сповіщень ──────────────────────────────────────────────────────
// Повертає масив message_id надісланих повідомлень (для подальшого видалення)
async function sendNotification(chatId, text, images) {
    const b = getBot();
    if (images.length === 0) {
        const msg = await withRetry(() => b.api.sendMessage(chatId, text, { parse_mode: 'HTML' }));
        return [msg.message_id];
    }
    if (images.length === 1) {
        const msg = await withRetry(() => b.api.sendPhoto(chatId, new grammy_1.InputFile(images[0].content, images[0].filename), {
            caption: text,
            parse_mode: 'HTML',
        }));
        return [msg.message_id];
    }
    // Кілька зображень — надсилаємо як media group
    const media = images.map((img, i) => grammy_1.InputMediaBuilder.photo(new grammy_1.InputFile(img.content, img.filename), {
        caption: i === 0 ? text : undefined,
        parse_mode: i === 0 ? 'HTML' : undefined,
    }));
    const msgs = await withRetry(() => b.api.sendMediaGroup(chatId, media));
    return msgs.map((m) => m.message_id);
}
async function sendTextMessage(chatId, text) {
    const b = getBot();
    await b.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
}
//# sourceMappingURL=bot.service.js.map