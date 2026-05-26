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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const path = __importStar(require("path"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const auth_1 = require("./middleware/auth");
const auth_2 = __importDefault(require("./routes/auth"));
const stores_1 = __importDefault(require("./routes/stores"));
const users_1 = __importDefault(require("./routes/users"));
const logs_1 = __importDefault(require("./routes/logs"));
const test_1 = __importDefault(require("./routes/test"));
function createServer() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: true }));
    app.use((0, express_session_1.default)({
        secret: config_1.config.ADMIN_PASSWORD + '_session_secret',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
    }));
    app.use('/api/auth', auth_2.default);
    app.use('/admin', express_1.default.static(path.join(__dirname, '../../src/web/admin')));
    app.use('/api', auth_1.requireAuth);
    app.use('/api/stores', stores_1.default);
    app.use('/api/users', users_1.default);
    app.use('/api/logs', logs_1.default);
    app.use('/api/test', test_1.default);
    app.get('/', (_req, res) => res.redirect('/admin/'));
    app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
    app.use((err, _req, res, _next) => {
        logger_1.logger.error(err, 'API error');
        res.status(500).json({ error: err.message });
    });
    return app;
}
function startServer(app) {
    let port = config_1.config.PORT;
    let host;
    for (const arg of process.argv.slice(2)) {
        const portMatch = arg.match(/^--port=(\d+)$/);
        if (portMatch) {
            port = parseInt(portMatch[1], 10);
        }
        const hostMatch = arg.match(/^--host=(.+)$/);
        if (hostMatch) {
            host = hostMatch[1];
        }
    }
    return new Promise((resolve, reject) => {
        const server = host ? app.listen(port, host) : app.listen(port);
        server.once('listening', () => {
            const address = server.address();
            const boundHost = typeof address === 'object' && address
                ? address.address
                : host ?? '0.0.0.0';
            const boundPort = typeof address === 'object' && address
                ? address.port
                : port;
            const addr = host ? `${host}:${boundPort}` : `${boundHost}:${boundPort}`;
            logger_1.logger.info({ port: boundPort, host: boundHost }, `Admin server started -> http://${addr}/admin/`);
            resolve();
        });
        server.once('error', (err) => {
            logger_1.logger.error({ err, port, host: host ?? '0.0.0.0' }, 'Failed to start admin server');
            reject(err);
        });
    });
}
//# sourceMappingURL=server.js.map