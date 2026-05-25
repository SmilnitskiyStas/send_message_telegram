import { ParsedEmail } from '../../types';

export interface EventDetails {
  eventTime: string;
  storeNumber: string | null;   // "12" з "12-252 M-12 FR 02"
  cameraNumber: string | null;  // "252" з "12-252 M-12 FR 02"
  cameraLabel: string | null;   // "M-12 FR 02"
  targetId: string | null;
  personName: string | null;
  similarity: number | null;
  ageGroup: string | null;
  gender: string | null;
}

export function parseEventDetails(body: string): EventDetails {
  const get = (pattern: RegExp) => body.match(pattern)?.[1]?.trim() ?? null;

  // "Encoding Device: 12-252 M-12 FR 02" → store=12, camera=252, label=M-12 FR 02
  const deviceMatch = body.match(/Encoding Device\s*:\s*(\d+)-(\d+)\s+([\w-]+(?:\s+[\w-]+)*)/i);

  const simMatch = body.match(/Similarity:\s*(\d+)%/);

  return {
    eventTime:    get(/Event Time:\s*([^\n]+)/) ?? '',
    storeNumber:  deviceMatch?.[1] ?? null,
    cameraNumber: deviceMatch?.[2] ?? null,
    cameraLabel:  deviceMatch?.[3]?.trim() ?? null,
    targetId:     get(/Target ID:\s*(\d+)/),
    personName:   get(/Person Name:\s*([^,\n]+)/),
    similarity:   simMatch ? parseInt(simMatch[1]) : null,
    ageGroup:     get(/Age Group:\s*([^,\n]+)/),
    gender:       get(/Gender:\s*([^,\n]+)/),
  };
}

export function buildNotificationText(
  email: ParsedEmail,
  storeName: string | null,
): string {
  const ev = parseEventDetails(email.textBody);

  const lines: string[] = [];

  lines.push('🚨 <b>Matched Face</b>');
  lines.push('');

  if (ev.eventTime) lines.push(`⏰ <b>Час:</b> ${ev.eventTime}`);

  if (storeName) {
    lines.push(`🏪 <b>Магазин:</b> ${storeName}`);
  } else if (ev.storeNumber) {
    lines.push(`🏪 <b>Магазин №:</b> ${ev.storeNumber}`);
  }

  if (ev.cameraNumber) lines.push(`🎥 <b>Камера №:</b> ${ev.cameraNumber}`);
  if (ev.cameraLabel)  lines.push(`📷 <b>Назва камери:</b> ${ev.cameraLabel}`);

  lines.push('');

  if (ev.personName) {
    lines.push(`👤 <b>Особа:</b> ${ev.personName}`);
  } else {
    lines.push('👤 <b>Особа:</b> невідома');
  }

  if (ev.similarity !== null) lines.push(`📊 <b>Схожість:</b> ${ev.similarity}%`);
  if (ev.targetId)             lines.push(`🆔 <b>ID в базі:</b> ${ev.targetId}`);
  if (ev.ageGroup)             lines.push(`🎂 <b>Вік:</b> ${ev.ageGroup}`);
  if (ev.gender)               lines.push(`⚥ <b>Стать:</b> ${ev.gender}`);

  return lines.join('\n');
}

export function buildRegistrationSuccessText(
  firstName: string,
  lastName: string,
  storeName: string | null,
  role: string,
): string {
  const roleLabel = role === 'security' ? '🛡 Служба безпеки' : '👷 Співробітник';
  return (
    `✅ <b>Реєстрацію завершено!</b>\n\n` +
    `👤 ${lastName} ${firstName}\n` +
    `${roleLabel}\n` +
    (storeName ? `🏪 ${storeName}\n` : '') +
    `\nВи будете отримувати сповіщення автоматично.`
  );
}
