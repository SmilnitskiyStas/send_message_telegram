"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEncodingDevice = parseEncodingDevice;
exports.detectStore = detectStore;
const db_1 = require("../../db");
const logger_1 = require("../../utils/logger");
// Підтримувані формати поля "Encoding Device":
//   "9-254 M-32 FR 01"       → store=32,  camera="FR 01"   (M-NN)
//   "RC ovoshy M-6 FR 13"    → store=6,   camera="FR 13"   (M-NN)
//   "9-253 M9-1 FR"          → store=9,   camera="FR"      (MNN-суфікс)
//   "7-254 24 FR_7-254"      → store=24,  camera="FR_7-254" (число без M)
function parseEncodingDevice(body) {
    // Формат 1/2: M-NN  →  "M-32 FR 01", "M-6 FR 13"
    const mDashMatch = body.match(/Encoding Device\s*:[^\n\r]*?\bM-(\d+)\s+([\w][^\n\r,]*)/i);
    if (mDashMatch) {
        return { storeNumber: mDashMatch[1].trim(), cameraLabel: mDashMatch[2].trim() };
    }
    // Формат 4: MNN-суфікс  →  "M9-1 FR", "M12-3 CAM"
    const mNumMatch = body.match(/Encoding Device\s*:[^\n\r]*?\bM(\d+)-\d+\s+([\w][^\n\r,]*)/i);
    if (mNumMatch) {
        return { storeNumber: mNumMatch[1].trim(), cameraLabel: mNumMatch[2].trim() };
    }
    // Формат 3: NVR-ID потім число магазину  →  "7-254 24 FR_7-254"
    const nvrMatch = body.match(/Encoding Device\s*:\s*\d+-\d+\s+(\d+)\s+([\w][^\n\r,]*)/i);
    if (nvrMatch) {
        return { storeNumber: nvrMatch[1].trim(), cameraLabel: nvrMatch[2].trim() };
    }
    return { storeNumber: null, cameraLabel: null };
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