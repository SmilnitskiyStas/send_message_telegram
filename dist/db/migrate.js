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
exports.runMigrations = runMigrations;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_1 = require("./index");
const logger_1 = require("../utils/logger");
function applyAlterMigrations(db) {
    // Додаємо нові колонки в існуючі таблиці (безпечно — ігноруємо якщо вже є)
    const alterations = [
        "ALTER TABLE users ADD COLUMN receive_all INTEGER DEFAULT 0",
        "ALTER TABLE message_sends ADD COLUMN telegram_message_ids TEXT",
    ];
    // Очищення processed_emails старших 7 днів (щоб не накопичувались)
    try {
        db.exec("DELETE FROM processed_emails WHERE processed_at < datetime('now', '-7 days')");
    }
    catch { /* таблиця може ще не існувати при першому запуску */ }
    for (const sql of alterations) {
        try {
            db.exec(sql);
        }
        catch { /* колонка вже існує */ }
    }
}
function runMigrations() {
    const db = (0, index_1.getDb)();
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(sql);
    applyAlterMigrations(db);
    logger_1.logger.info('Database migrations completed');
}
if (require.main === module) {
    runMigrations();
    logger_1.logger.info('Migration script finished');
    process.exit(0);
}
//# sourceMappingURL=migrate.js.map