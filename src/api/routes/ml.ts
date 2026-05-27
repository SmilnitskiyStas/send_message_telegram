import { Router } from 'express';
import { config } from '../../config';
import { isOllamaReady, startOllama, stopOllama, parseWithOllama } from '../../services/ml/ollama.service';
import { parseEventDetails } from '../../services/telegram/templates';

const router = Router();

// Статус Ollama + список моделей
router.get('/status', async (_req, res) => {
  const configured = !!config.OLLAMA_BINARY;
  const ready = isOllamaReady();

  let models: string[] = [];
  if (ready) {
    try {
      const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const data = await r.json() as { models?: { name: string }[] };
        models = (data.models ?? []).map((m) => m.name);
      }
    } catch { /* Ollama не відповідає */ }
  }

  res.json({
    configured,
    ready,
    binary: config.OLLAMA_BINARY || null,
    model: config.OLLAMA_MODEL,
    models,
  });
});

// Тест парсингу: надсилаємо текст листа, отримуємо розпізнані поля
router.post('/test', async (req, res) => {
  const text: string = req.body.text ?? '';
  if (!text.trim()) return res.status(400).json({ error: 'text is required' });

  const regexFields = parseEventDetails(text);

  if (!isOllamaReady()) {
    return res.json({ method: 'regex', fields: regexFields });
  }

  const aiFields = await parseWithOllama(text);
  if (!aiFields) {
    return res.json({ method: 'regex', fields: regexFields });
  }

  // Зливаємо (такий самий merge як у extractEventDetails)
  const merge = <T>(ai: T | undefined, rx: T): T =>
    (ai !== null && ai !== undefined && ai !== '') ? ai : rx;

  const merged = {
    eventTime:   merge(aiFields.eventTime,   regexFields.eventTime),
    storeNumber: merge(aiFields.storeNumber, regexFields.storeNumber),
    cameraLabel: merge(aiFields.cameraLabel, regexFields.cameraLabel),
    targetId:    merge(aiFields.targetId,    regexFields.targetId),
    personName:  merge(aiFields.personName,  regexFields.personName),
    similarity:  merge(aiFields.similarity,  regexFields.similarity),
    ageGroup:    merge(aiFields.ageGroup,    regexFields.ageGroup),
    gender:      merge(aiFields.gender,      regexFields.gender),
  };

  res.json({ method: 'ollama', aiRaw: aiFields, regexRaw: regexFields, fields: merged });
});

// Перезапустити Ollama
router.post('/restart', async (_req, res) => {
  if (!config.OLLAMA_BINARY) {
    return res.status(400).json({ error: 'OLLAMA_BINARY not configured' });
  }
  stopOllama();
  await startOllama();
  res.json({ ok: true, ready: isOllamaReady() });
});

export default router;
