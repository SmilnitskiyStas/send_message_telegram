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
const pendingReg = new Map(); // chatId → стан реєстрації
// Очистка протермінованих сесій (> 10 хвилин)
setInterval(() => {
    const now = Date.now();
    for (const [id, s] of pendingReg) {
        if (now - s.startedAt > 10 * 60_000)
            pendingReg.delete(id);
    }
}, 5 * 60_000);
function chunkArr(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n)
        out.push(arr.slice(i, i + n));
    return out;
}
function getStoreButtons() {
    const stores = (0, db_1.getDb)()
        .prepare('SELECT id, name, code FROM stores ORDER BY CAST(code AS INTEGER)')
        .all();
    const rows = chunkArr(stores, 6).map(row => row.map(s => ({ text: s.name, callback_data: `reg_store_${s.id}` })));
    rows.push([{ text: '❌ Скасувати', callback_data: 'reg_cancel' }]);
    return rows;
}
// ── Ініціалізація бота ────────────────────────────────────────────────────────
function getBot() {
    if (!bot) {
        if (!config_1.config.TELEGRAM_BOT_TOKEN)
            throw new Error('TELEGRAM_BOT_TOKEN is not set');
        bot = new grammy_1.Bot(config_1.config.TELEGRAM_BOT_TOKEN, {
            client: { timeoutSeconds: 30 },
        });
        registerHandlers(bot);
    }
    return bot;
}
function normalizePhone(phone) {
    return phone.replace(/\D/g, '');
}
function registerHandlers(b) {
    // ─── /start ───────────────────────────────────────────────────────────────
    b.command('start', async (ctx) => {
        // Скасовуємо будь-яку незавершену реєстрацію
        pendingReg.delete(ctx.chat.id);
        const token = ctx.match?.trim();
        if (!token) {
            await ctx.reply('👋 Привіт!\n\nЦей бот надсилає сповіщення служби безпеки магазинів.\n\n' +
                '📱 Щоб зареєструватися, натисніть кнопку нижче та поділіться своїм номером телефону:', {
                reply_markup: {
                    keyboard: [[{ text: '📱 Поділитися номером телефону', request_contact: true }]],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            });
            return;
        }
        // /start з токеном — реєстрація через посилання від адміна
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
        logger_1.logger.info({ userId: user.id, chatId: ctx.chat.id, username: ctx.from?.username }, 'User registered via Telegram token');
    });
    // ─── /cancel — скасування реєстрації ─────────────────────────────────────
    b.command('cancel', async (ctx) => {
        if (pendingReg.delete(ctx.chat.id)) {
            await ctx.reply('❌ Реєстрацію скасовано.', { reply_markup: { remove_keyboard: true } });
        }
        else {
            await ctx.reply('Немає активної реєстрації.', { reply_markup: { remove_keyboard: true } });
        }
    });
    // ─── Користувач поділився номером телефону ────────────────────────────────
    b.on('message:contact', async (ctx) => {
        const contact = ctx.message.contact;
        if (!contact?.phone_number)
            return;
        if (contact.user_id && contact.user_id !== ctx.from?.id) {
            await ctx.reply('⚠️ Будь ласка, поділіться своїм власним номером телефону.', { reply_markup: { remove_keyboard: true } });
            return;
        }
        const db = (0, db_1.getDb)();
        const normalizedIncoming = normalizePhone(contact.phone_number);
        const allUsers = db.prepare('SELECT * FROM users WHERE is_active = 1').all();
        const phoneMatch = (u) => {
            const dbPhone = normalizePhone(u.phone);
            return dbPhone === normalizedIncoming ||
                dbPhone.endsWith(normalizedIncoming.slice(-9)) ||
                normalizedIncoming.endsWith(dbPhone.slice(-9));
        };
        const matched = allUsers.find(phoneMatch);
        if (!matched) {
            // Телефон не знайдено — починаємо самостійну реєстрацію
            pendingReg.set(ctx.chat.id, {
                step: 'last_name',
                phone: contact.phone_number,
                startedAt: Date.now(),
            });
            await ctx.reply('📝 Ваш номер не знайдено в системі.\n\n' +
                'Давайте зареєструємось! Введіть ваше <b>прізвище</b>:\n\n' +
                '<i>Для скасування: /cancel</i>', { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
            logger_1.logger.info({ phone: normalizedIncoming, chatId: ctx.chat.id }, 'Starting self-registration');
            return;
        }
        // Вже зареєстрований в ЦЬОМУ чаті
        if (matched.telegram_chat_id === ctx.chat.id) {
            await ctx.reply(`✅ <b>${matched.last_name} ${matched.first_name}</b>, ваш акаунт вже зареєстровано!\n\nВи будете отримувати сповіщення автоматично.`, { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
            return;
        }
        // Вже зареєстрований з іншим chat_id
        if (matched.telegram_chat_id && matched.telegram_chat_id !== ctx.chat.id) {
            await ctx.reply(`ℹ️ Акаунт <b>${matched.last_name} ${matched.first_name}</b> вже зареєстровано в іншому Telegram-акаунті.\n\n` +
                `Якщо потрібно переприв'язати — зверніться до адміністратора.`, { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
            return;
        }
        // Знайдено, але ще не зареєстрований — надсилаємо посилання
        if (!matched.registration_token) {
            const { randomBytes } = await Promise.resolve().then(() => __importStar(require('crypto')));
            const newToken = randomBytes(24).toString('hex');
            db.prepare(`UPDATE users SET registration_token = ? WHERE id = ?`).run([newToken, matched.id]);
            matched.registration_token = newToken;
        }
        const link = `https://t.me/${config_1.config.TELEGRAM_BOT_NAME}?start=${matched.registration_token}`;
        await ctx.reply(`✅ Знайшли ваш акаунт!\n\n` +
            `👤 <b>${matched.last_name} ${matched.first_name}</b>\n\n` +
            `Для завершення реєстрації натисніть кнопку нижче:`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '✅ Зареєструватися', url: link }]],
            },
        });
        logger_1.logger.info({ userId: matched.id, phone: normalizedIncoming, chatId: ctx.chat.id }, 'Registration link sent via phone lookup');
    });
    // ─── Callback queries (вибір магазину, підтвердження тощо) ───────────────
    b.on('callback_query:data', async (ctx) => {
        const data = ctx.callbackQuery.data;
        const chatId = ctx.from.id;
        // Вибір магазину
        if (data.startsWith('reg_store_')) {
            const storeId = parseInt(data.slice('reg_store_'.length));
            const state = pendingReg.get(chatId);
            if (!state || state.step !== 'store') {
                await ctx.answerCallbackQuery('⏰ Сесія реєстрації закінчилась. Натисніть /start');
                return;
            }
            const store = (0, db_1.getDb)().prepare('SELECT * FROM stores WHERE id = ?').get([storeId]);
            await ctx.editMessageText(`📋 <b>Перевірте ваші дані:</b>\n\n` +
                `👤 ${state.last_name} ${state.first_name}${state.middle_name ? ' ' + state.middle_name : ''}\n` +
                `📞 ${state.phone}\n` +
                `🏪 ${store?.name ?? 'Магазин ' + storeId}\n` +
                `👷 Співробітник\n\n` +
                `Все вірно?`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                            { text: '✅ Підтвердити', callback_data: `reg_confirm_${storeId}` },
                            { text: '◀️ Змінити магазин', callback_data: 'reg_back_store' },
                        ]],
                },
            });
            await ctx.answerCallbackQuery();
            return;
        }
        // Підтвердження реєстрації
        if (data.startsWith('reg_confirm_')) {
            const storeId = parseInt(data.slice('reg_confirm_'.length));
            const state = pendingReg.get(chatId);
            if (!state) {
                await ctx.answerCallbackQuery('⏰ Сесія реєстрації закінчилась. Натисніть /start');
                return;
            }
            try {
                const db = (0, db_1.getDb)();
                const store = db.prepare('SELECT * FROM stores WHERE id = ?').get([storeId]);
                db.prepare(`
          INSERT INTO users
            (last_name, first_name, middle_name, phone, position, store_id, role,
             telegram_chat_id, telegram_username, is_active)
          VALUES (?, ?, ?, ?, 'Співробітник', ?, 'employee', ?, ?, 1)
        `).run([
                    state.last_name, state.first_name, state.middle_name || '',
                    state.phone, storeId, chatId, ctx.from?.username ?? null,
                ]);
                pendingReg.delete(chatId);
                await ctx.editMessageText(`✅ <b>Реєстрацію завершено!</b>\n\n` +
                    `👤 ${state.last_name} ${state.first_name}${state.middle_name ? ' ' + state.middle_name : ''}\n` +
                    `🏪 ${store?.name ?? ''}\n` +
                    `👷 Співробітник\n\n` +
                    `Ви будете отримувати сповіщення автоматично.`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } });
                await ctx.answerCallbackQuery('✅ Зареєстровано!');
                logger_1.logger.info({ chatId, phone: state.phone, store: store?.name }, 'User self-registered');
            }
            catch (err) {
                pendingReg.delete(chatId);
                logger_1.logger.error({ err, chatId }, 'Self-registration DB error');
                await ctx.editMessageText('❌ Помилка реєстрації. Зверніться до адміністратора.', { reply_markup: { inline_keyboard: [] } });
                await ctx.answerCallbackQuery('❌ Помилка');
            }
            return;
        }
        // Пропустити по батькові
        if (data === 'reg_skip_middle') {
            const state = pendingReg.get(chatId);
            if (!state || state.step !== 'middle_name') {
                await ctx.answerCallbackQuery('⏰ Сесія реєстрації закінчилась. Натисніть /start');
                return;
            }
            state.middle_name = '';
            state.step = 'store';
            await ctx.editMessageText('🏪 Оберіть ваш <b>магазин</b>:', {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: getStoreButtons() },
            });
            await ctx.answerCallbackQuery();
            return;
        }
        // Повернутись до вибору магазину
        if (data === 'reg_back_store') {
            const state = pendingReg.get(chatId);
            if (!state) {
                await ctx.answerCallbackQuery('⏰ Сесія реєстрації закінчилась. Натисніть /start');
                return;
            }
            state.step = 'store';
            await ctx.editMessageText('🏪 Оберіть ваш <b>магазин</b>:', {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: getStoreButtons() },
            });
            await ctx.answerCallbackQuery();
            return;
        }
        // Скасувати реєстрацію
        if (data === 'reg_cancel') {
            pendingReg.delete(chatId);
            await ctx.editMessageText('❌ Реєстрацію скасовано.', { reply_markup: { inline_keyboard: [] } });
            await ctx.answerCallbackQuery();
            return;
        }
        await ctx.answerCallbackQuery();
    });
    // ─── Текстові повідомлення — кроки реєстрації або дефолт ─────────────────
    b.on('message', async (ctx) => {
        const chatId = ctx.chat.id;
        const state = pendingReg.get(chatId);
        const text = 'text' in ctx.message ? (ctx.message.text ?? '').trim() : '';
        if (!state) {
            await ctx.reply('👋 Використовуйте посилання від адміністратора або натисніть /start для реєстрації.');
            return;
        }
        if (!text) {
            await ctx.reply('Будь ласка, введіть текстову відповідь.');
            return;
        }
        switch (state.step) {
            case 'last_name': {
                if (text.length < 2) {
                    await ctx.reply('⚠️ Прізвище занадто коротке. Спробуйте ще раз:');
                    return;
                }
                state.last_name = text;
                state.step = 'first_name';
                await ctx.reply("Введіть ваше <b>ім'я</b>:", { parse_mode: 'HTML' });
                break;
            }
            case 'first_name': {
                if (text.length < 2) {
                    await ctx.reply("⚠️ Ім'я занадто коротке. Спробуйте ще раз:");
                    return;
                }
                state.first_name = text;
                state.step = 'middle_name';
                await ctx.reply('Введіть ваше <b>по батькові</b>:', {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: '➡️ Пропустити', callback_data: 'reg_skip_middle' }]],
                    },
                });
                break;
            }
            case 'middle_name': {
                state.middle_name = text;
                state.step = 'store';
                await ctx.reply('🏪 Оберіть ваш <b>магазин</b>:', {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: getStoreButtons() },
                });
                break;
            }
            case 'store': {
                await ctx.reply('🏪 Будь ласка, оберіть магазин зі списку вище (або ❌ Скасувати).');
                break;
            }
        }
    });
    b.catch((err) => {
        logger_1.logger.error({ err: err.error, ctx: err.ctx?.update }, 'Telegram bot error');
    });
}
async function startBot() {
    const b = getBot();
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