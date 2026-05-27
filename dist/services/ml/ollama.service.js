"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOllama = startOllama;
exports.stopOllama = stopOllama;
exports.parseWithOllama = parseWithOllama;
exports.isOllamaReady = isOllamaReady;
const child_process_1 = require("child_process");
const config_1 = require("../../config");
const logger_1 = require("../../utils/logger");
const OLLAMA_URL = 'http://127.0.0.1:11434';
let ollamaProcess = null;
let ready = false;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function isRunning() {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, {
            signal: AbortSignal.timeout(2000),
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
// ─── Старт / стоп ────────────────────────────────────────────────────────────
async function startOllama() {
    if (!config_1.config.OLLAMA_BINARY) {
        logger_1.logger.info('OLLAMA_BINARY not set — ML parsing disabled, using regex');
        return;
    }
    if (await isRunning()) {
        ready = true;
        logger_1.logger.info({ model: config_1.config.OLLAMA_MODEL }, 'Ollama already running — ML parsing enabled');
        return;
    }
    logger_1.logger.info({ binary: config_1.config.OLLAMA_BINARY }, 'Starting Ollama process...');
    ollamaProcess = (0, child_process_1.spawn)(config_1.config.OLLAMA_BINARY, ['serve'], {
        stdio: 'ignore',
        detached: false,
        env: { ...process.env, HOME: process.env.HOME ?? '/root' },
    });
    ollamaProcess.on('error', (err) => {
        logger_1.logger.error({ err }, 'Ollama process error');
        ready = false;
    });
    ollamaProcess.on('exit', (code) => {
        logger_1.logger.warn({ code }, 'Ollama process exited');
        ready = false;
    });
    // Чекаємо до 45 секунд поки Ollama запуститься
    for (let i = 0; i < 45; i++) {
        await sleep(1000);
        if (await isRunning()) {
            ready = true;
            logger_1.logger.info({ model: config_1.config.OLLAMA_MODEL }, 'Ollama started — ML parsing enabled');
            return;
        }
    }
    logger_1.logger.warn('Ollama did not start in 45s — using regex fallback for all emails');
}
function stopOllama() {
    if (ollamaProcess) {
        ollamaProcess.kill();
        ollamaProcess = null;
        ready = false;
        logger_1.logger.info('Ollama stopped');
    }
}
// ─── Парсинг ─────────────────────────────────────────────────────────────────
const buildPrompt = (body) => `You are a data extraction tool. Extract fields from this security camera alert and return ONLY a valid JSON object. No explanation, no markdown, just JSON.

JSON format (use null for missing fields):
{"eventTime":"","storeNumber":"","cameraLabel":"","personName":"","similarity":null,"targetId":null}

Field rules:
- eventTime: text after "Event Time:" (e.g. "2026-05-27 13:58:55")
- storeNumber: the number N from the M-N pattern in Encoding Device (e.g. "M-32 FR 01" → "32")
- cameraLabel: the camera ID after M-N (e.g. "M-32 FR 01" → "FR 01")
- personName: text after "Person Name:" until comma or end of line
- similarity: integer from "Similarity:85%" → 85
- targetId: text after "Target ID:"

Text to parse:
${body}

JSON:`;
async function parseWithOllama(body) {
    if (!ready || !config_1.config.OLLAMA_MODEL)
        return null;
    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config_1.config.OLLAMA_MODEL,
                prompt: buildPrompt(body),
                stream: false,
                options: { temperature: 0, num_predict: 200, top_p: 0.1 },
            }),
            signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) {
            logger_1.logger.warn({ status: res.status }, 'Ollama API error');
            return null;
        }
        const data = await res.json();
        const jsonMatch = data.response.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) {
            logger_1.logger.warn({ response: data.response }, 'Ollama returned no JSON');
            return null;
        }
        const parsed = JSON.parse(jsonMatch[0]);
        // Нормалізуємо similarity — може прийти як рядок
        if (parsed.similarity !== null && typeof parsed.similarity === 'string') {
            parsed.similarity = parseInt(parsed.similarity) || null;
        }
        logger_1.logger.debug({ parsed }, 'Ollama parsed email fields');
        return parsed;
    }
    catch (err) {
        logger_1.logger.warn({ err }, 'Ollama parsing failed — using regex fallback');
        return null;
    }
}
function isOllamaReady() {
    return ready;
}
//# sourceMappingURL=ollama.service.js.map