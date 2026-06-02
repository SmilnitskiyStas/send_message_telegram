import { dbAll } from '../../db';
import { logger } from '../../utils/logger';
import { Store } from '../../types';

// Підтримувані формати поля "Encoding Device":
//   "9-254 M-32 FR 01"       → store=32,  camera="FR 01"
//   "RC ovoshy M-6 FR 13"    → store=6,   camera="FR 13"
//   "7-254 24 FR_7-254"      → store=24,  camera="FR_7-254"
export function parseEncodingDevice(body: string): { storeNumber: string | null; cameraLabel: string | null } {
  // Формат 1/2: є M-NN (будь-який префікс перед M-)
  const mMatch = body.match(/Encoding Device\s*:[^\n\r]*?M-(\d+)\s+([\w][^\n\r,]*)/i);
  if (mMatch) {
    return { storeNumber: mMatch[1].trim(), cameraLabel: mMatch[2].trim() };
  }

  // Формат 3: NVR-ID (цифри-цифри) потім номер магазину потім камера
  // "Encoding Device:7-254 24 FR_7-254"
  const nvrMatch = body.match(/Encoding Device\s*:\s*\d+-\d+\s+(\d+)\s+([\w][^\n\r,]*)/i);
  if (nvrMatch) {
    return { storeNumber: nvrMatch[1].trim(), cameraLabel: nvrMatch[2].trim() };
  }

  return { storeNumber: null, cameraLabel: null };
}

export function detectStore(subject: string, textBody: string): Store | null {
  const stores: Store[] = dbAll('SELECT id, name, code, address FROM stores');

  if (stores.length === 0) {
    logger.warn('No stores in database — cannot detect store from email');
    return null;
  }

  // Основний спосіб: числовий код з поля "Encoding Device: ... M-NN ..."
  const { storeNumber } = parseEncodingDevice(textBody);
  if (storeNumber) {
    const byNumber = stores.find((s) => s.code === storeNumber);
    if (byNumber) {
      logger.info(
        { storeId: byNumber.id, storeName: byNumber.name, storeNumber },
        'Store detected by encoding device number',
      );
      return byNumber;
    }
  }

  // Fallback: шукаємо назву магазину у тексті листа (тільки назву, не код —
  // щоб не спрацьовував "1" у Target ID:11432 тощо)
  const lowerText = `${subject} ${textBody}`.toLowerCase();
  for (const store of stores) {
    if (lowerText.includes(store.name.toLowerCase())) {
      logger.info(
        { storeId: store.id, storeName: store.name },
        'Store detected by name in email text',
      );
      return store;
    }
  }

  logger.warn({ subject, storeNumber }, 'Could not detect store from email');
  return null;
}
