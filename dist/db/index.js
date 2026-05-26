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
exports.getDb = getDb;
exports.closeDb = closeDb;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Database } = require('node-sqlite3-wasm');
let db;
function getDb() {
    if (!db) {
        const dbPath = path.resolve(config_1.config.DATABASE_PATH);
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Очищення lock-директорії яка залишається після падіння процесу
        const lockPath = dbPath + '.lock';
        if (fs.existsSync(lockPath)) {
            fs.rmSync(lockPath, { recursive: true, force: true });
            logger_1.logger.warn({ lockPath }, 'Removed stale database lock directory');
        }
        db = new Database(dbPath);
        db.exec('PRAGMA busy_timeout = 10000');
        db.exec('PRAGMA foreign_keys = ON');
        logger_1.logger.info({ dbPath }, 'Database connected');
    }
    return db;
}
function closeDb() {
    if (db) {
        db.close();
        logger_1.logger.info('Database connection closed');
    }
}
//# sourceMappingURL=index.js.map