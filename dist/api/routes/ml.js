"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const config_1 = require("../../config");
const ollama_service_1 = require("../../services/ml/ollama.service");
const templates_1 = require("../../services/telegram/templates");
const router = (0, express_1.Router)();
// Статус Ollama + список моделей
router.get('/status', async (_req, res) => {
    const configured = !!config_1.config.OLLAMA_BINARY;
    const ready = (0, ollama_service_1.isOllamaReady)();
    let models = [];
    if (ready) {
        try {
            const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
            if (r.ok) {
                const data = await r.json();
                models = (data.models ?? []).map((m) => m.name);
            }
        }
        catch { /* Ollama не відповідає */ }
    }
    res.json({
        configured,
        ready,
        binary: config_1.config.OLLAMA_BINARY || null,
        model: config_1.config.OLLAMA_MODEL,
        models,
    });
});
// Тест парсингу: надсилаємо текст листа, отримуємо розпізнані поля
router.post('/test', async (req, res) => {
    const text = req.body.text ?? '';
    if (!text.trim())
        return res.status(400).json({ error: 'text is required' });
    const regexFields = (0, templates_1.parseEventDetails)(text);
    if (!(0, ollama_service_1.isOllamaReady)()) {
        return res.json({ method: 'regex', fields: regexFields });
    }
    const aiFields = await (0, ollama_service_1.parseWithOllama)(text);
    if (!aiFields) {
        return res.json({ method: 'regex', fields: regexFields });
    }
    // Зливаємо (такий самий merge як у extractEventDetails)
    const merge = (ai, rx) => (ai !== null && ai !== undefined && ai !== '') ? ai : rx;
    const merged = {
        eventTime: merge(aiFields.eventTime, regexFields.eventTime),
        storeNumber: merge(aiFields.storeNumber, regexFields.storeNumber),
        cameraLabel: merge(aiFields.cameraLabel, regexFields.cameraLabel),
        targetId: merge(aiFields.targetId, regexFields.targetId),
        personName: merge(aiFields.personName, regexFields.personName),
        similarity: merge(aiFields.similarity, regexFields.similarity),
        ageGroup: merge(aiFields.ageGroup, regexFields.ageGroup),
        gender: merge(aiFields.gender, regexFields.gender),
    };
    res.json({ method: 'ollama', aiRaw: aiFields, regexRaw: regexFields, fields: merged });
});
// Перезапустити Ollama
router.post('/restart', async (_req, res) => {
    if (!config_1.config.OLLAMA_BINARY) {
        return res.status(400).json({ error: 'OLLAMA_BINARY not configured' });
    }
    (0, ollama_service_1.stopOllama)();
    await (0, ollama_service_1.startOllama)();
    res.json({ ok: true, ready: (0, ollama_service_1.isOllamaReady)() });
});
exports.default = router;
//# sourceMappingURL=ml.js.map