"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEventDetails = parseEventDetails;
exports.extractEventDetails = extractEventDetails;
exports.buildNotificationText = buildNotificationText;
exports.buildRegistrationSuccessText = buildRegistrationSuccessText;
const ollama_service_1 = require("../ml/ollama.service");
const logger_1 = require("../../utils/logger");
// ─── Regex fallback ───────────────────────────────────────────────────────────
function parseEventDetails(body) {
    const get = (pattern) => body.match(pattern)?.[1]?.trim() ?? null;
    // "Encoding Device:9-254 M-32 FR 01" → store=32 (з M-32), camera=FR 01
    const deviceMatch = body.match(/Encoding Device\s*:\s*\d+-\d+\s+M-(\d+)\s+([\w][^\n\r,]*)/i);
    const simMatch = body.match(/Similarity:\s*(\d+)%/);
    return {
        eventTime: get(/Event Time:\s*([^\n]+)/) ?? '',
        storeNumber: deviceMatch?.[1]?.trim() ?? null,
        cameraLabel: deviceMatch?.[2]?.trim() ?? null,
        targetId: get(/Target ID:\s*(\d+)/),
        personName: get(/Person Name:\s*([^,\n]+)/),
        similarity: simMatch ? parseInt(simMatch[1]) : null,
        ageGroup: get(/Age Group:\s*([^,\n]+)/),
        gender: get(/Gender:\s*([^,\n]+)/),
    };
}
// ─── ML + fallback ────────────────────────────────────────────────────────────
// Спочатку пробуємо Ollama, при невдачі — regex.
// Поля з Ollama мають пріоритет, пропущені — доповнюємо regex.
async function extractEventDetails(body) {
    const regexResult = parseEventDetails(body);
    const aiResult = await (0, ollama_service_1.parseWithOllama)(body);
    if (!aiResult)
        return regexResult;
    // Зливаємо: AI-поле використовується якщо не null/порожній рядок
    const merge = (ai, rx) => (ai !== null && ai !== undefined && ai !== '') ? ai : rx;
    const merged = {
        eventTime: merge(aiResult.eventTime, regexResult.eventTime),
        storeNumber: merge(aiResult.storeNumber, regexResult.storeNumber),
        cameraLabel: merge(aiResult.cameraLabel, regexResult.cameraLabel),
        targetId: merge(aiResult.targetId, regexResult.targetId),
        personName: merge(aiResult.personName, regexResult.personName),
        similarity: merge(aiResult.similarity, regexResult.similarity),
        ageGroup: merge(aiResult.ageGroup, regexResult.ageGroup),
        gender: merge(aiResult.gender, regexResult.gender),
    };
    logger_1.logger.debug({ aiResult, regexResult, merged }, 'Event details extracted (AI+regex merge)');
    return merged;
}
// ─── Форматування повідомлення ────────────────────────────────────────────────
function buildNotificationText(ev, storeName) {
    const lines = [];
    lines.push('🚨 <b>Matched Face</b>');
    lines.push('');
    if (ev.eventTime)
        lines.push(`⏰ <b>Час:</b> ${ev.eventTime}`);
    if (storeName) {
        lines.push(`🏪 <b>Магазин:</b> ${storeName}`);
    }
    else if (ev.storeNumber) {
        lines.push(`🏪 <b>Магазин №:</b> ${ev.storeNumber}`);
    }
    if (ev.cameraLabel)
        lines.push(`🎥 <b>Камера:</b> ${ev.cameraLabel}`);
    lines.push('');
    lines.push(ev.personName
        ? `👤 <b>Особа:</b> ${ev.personName}`
        : '👤 <b>Особа:</b> невідома');
    if (ev.similarity !== null)
        lines.push(`📊 <b>Схожість:</b> ${ev.similarity}%`);
    if (ev.targetId)
        lines.push(`🆔 <b>ID в базі:</b> ${ev.targetId}`);
    if (ev.ageGroup)
        lines.push(`🎂 <b>Вік:</b> ${ev.ageGroup}`);
    if (ev.gender)
        lines.push(`⚥ <b>Стать:</b> ${ev.gender}`);
    return lines.join('\n');
}
function buildRegistrationSuccessText(firstName, lastName, storeName, role) {
    const roleLabel = role === 'security' ? '🛡 Служба безпеки' : '👷 Співробітник';
    return (`✅ <b>Реєстрацію завершено!</b>\n\n` +
        `👤 ${lastName} ${firstName}\n` +
        `${roleLabel}\n` +
        (storeName ? `🏪 ${storeName}\n` : '') +
        `\nВи будете отримувати сповіщення автоматично.`);
}
//# sourceMappingURL=templates.js.map