"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEncodingDevice = parseEncodingDevice;
exports.detectStore = detectStore;
const db_1 = require("../../db");
const logger_1 = require("../../utils/logger");
// Підтримувані формати:
//   "Encoding Device:9-254 M-32 FR 01"
//   "Encoding Device:RC ovoshy M-6 FR 13"
// → storeNumber="32"/"6" (з M-NN), cameraLabel="FR 01"/"FR 13"
function parseEncodingDevice(body) {
    const match = body.match(/Encoding Device\s*:[^\n\r]*?M-(\d+)\s+([\w][^\n\r,]*)/i);
    return {
        storeNumber: match?.[1]?.trim() ?? null,
        cameraLabel: match?.[2]?.trim() ?? null,
    };
}
function detectStore(subject, textBody) {
    const stores = (0, db_1.dbAll)('SELECT id, name, code, address FROM stores');
    if (stores.length === 0) {
        logger_1.logger.warn('No stores in database — cannot detect store from email');
        return null;
    }
    // Основний спосіб: числовий код з поля "Encoding Device: ... M-NN ..."
    const { storeNumber } = parseEncodingDevice(textBody);
    if (storeNumber) {
        const byNumber = stores.find((s) => s.code === storeNumber);
        if (byNumber) {
            logger_1.logger.info({ storeId: byNumber.id, storeName: byNumber.name, storeNumber }, 'Store detected by encoding device number');
            return byNumber;
        }
    }
    // Fallback: шукаємо назву магазину у тексті листа (тільки назву, не код —
    // щоб не спрацьовував "1" у Target ID:11432 тощо)
    const lowerText = `${subject} ${textBody}`.toLowerCase();
    for (const store of stores) {
        if (lowerText.includes(store.name.toLowerCase())) {
            logger_1.logger.info({ storeId: store.id, storeName: store.name }, 'Store detected by name in email text');
            return store;
        }
    }
    logger_1.logger.warn({ subject, storeNumber }, 'Could not detect store from email');
    return null;
}
//# sourceMappingURL=store-detector.js.map