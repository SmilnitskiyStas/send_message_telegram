import { spawn, ChildProcess } from 'child_process';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { EventDetails } from '../telegram/templates';

const OLLAMA_URL = 'http://127.0.0.1:11434';
let ollamaProcess: ChildProcess | null = null;
let ready = false;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function isRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Старт / стоп ────────────────────────────────────────────────────────────

export async function startOllama(): Promise<void> {
  if (!config.OLLAMA_BINARY) {
    logger.info('OLLAMA_BINARY not set — ML parsing disabled, using regex');
    return;
  }

  if (await isRunning()) {
    ready = true;
    logger.info({ model: config.OLLAMA_MODEL }, 'Ollama already running — ML parsing enabled');
    return;
  }

  logger.info({ binary: config.OLLAMA_BINARY }, 'Starting Ollama process...');
  ollamaProcess = spawn(config.OLLAMA_BINARY, ['serve'], {
    stdio: 'ignore',
    detached: false,
    env: { ...process.env, HOME: process.env.HOME ?? '/root' },
  });

  ollamaProcess.on('error', (err) => {
    logger.error({ err }, 'Ollama process error');
    ready = false;
  });
  ollamaProcess.on('exit', (code) => {
    logger.warn({ code }, 'Ollama process exited');
    ready = false;
  });

  // Чекаємо до 45 секунд поки Ollama запуститься
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    if (await isRunning()) {
      ready = true;
      logger.info({ model: config.OLLAMA_MODEL }, 'Ollama started — ML parsing enabled');
      return;
    }
  }
  logger.warn('Ollama did not start in 45s — using regex fallback for all emails');
}

export function stopOllama(): void {
  if (ollamaProcess) {
    ollamaProcess.kill();
    ollamaProcess = null;
    ready = false;
    logger.info('Ollama stopped');
  }
}

// ─── Парсинг ─────────────────────────────────────────────────────────────────

const buildPrompt = (body: string) => `You are a data extraction tool. Extract fields from this security camera alert and return ONLY a valid JSON object. No explanation, no markdown, just JSON.

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

export async function parseWithOllama(body: string): Promise<Partial<EventDetails> | null> {
  if (!ready || !config.OLLAMA_MODEL) return null;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.OLLAMA_MODEL,
        prompt: buildPrompt(body),
        stream: false,
        options: { temperature: 0, num_predict: 200, top_p: 0.1 },
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'Ollama API error');
      return null;
    }

    const data = await res.json() as { response: string };
    const jsonMatch = data.response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      logger.warn({ response: data.response }, 'Ollama returned no JSON');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<EventDetails>;

    // Нормалізуємо similarity — може прийти як рядок
    if (parsed.similarity !== null && typeof parsed.similarity === 'string') {
      parsed.similarity = parseInt(parsed.similarity as unknown as string) || null;
    }

    logger.debug({ parsed }, 'Ollama parsed email fields');
    return parsed;
  } catch (err) {
    logger.warn({ err }, 'Ollama parsing failed — using regex fallback');
    return null;
  }
}

export function isOllamaReady(): boolean {
  return ready;
}
