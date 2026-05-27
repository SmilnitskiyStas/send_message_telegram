"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEncodingDevice = parseEncodingDevice;
exports.detectStore = detectStore;
const db_1 = require("../../db");
const logger_1 = require("../../utils/logger");
// "Encoding Device:9-254 M-32 FR 01" → storeNumber="32" (з M-32), cameraNumber="FR 01"
function parseEncodingDevice(body) {
    const match = body.match(/Encoding Device\s*:\s*\d+-\d+\s+M-(\d+)\s+([\w][^\n\r,]*)/i);
    return {
        storeNumber: match?.[1]?.trim() ?? null,
        cameraNumber: match?.[2]?.trim() ?? null,
    };
}
function detectStore(subject, textBody) {
    const db = (0, db_1.getDb)();
    const stores = db.prepare('SELECT id, name, code, address FROM stores').all();
    if (stores.length === 0) {
        logger_1.logger.warn('No stores in database — cannot detect store from email');
        return null;
    }
    // Основний спосіб: числовий код магазину з поля "Encoding Device: 12-252 ..."
    const { storeNumber } = parseEncodingDevice(textBody);
    if (storeNumber) {
        const byNumber = stores.find((s) => s.code === storeNumber);
        if (byNumber) {
            logger_1.logger.info({ storeId: byNumber.id, storeName: byNumber.name, storeNumber }, 'Store detected by encoding device number');
            return byNumber;
        }
    }
    // Fallback: шукаємо назву або код у тексті листа
    const lowerText = `${subject} ${textBody}`.toLowerCase();
    for (const store of stores) {
        if (lowerText.includes(store.name.toLowerCase()) || lowerText.includes(store.code.toLowerCase())) {
            logger_1.logger.info({ storeId: store.id, storeName: store.name }, 'Store detected by name/code in email text');
            return store;
        }
    }
    logger_1.logger.warn({ subject, storeNumber }, 'Could not detect store from email');
    return null;
}
//# sourceMappingURL=store-detector.js.map