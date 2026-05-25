import { simpleParser } from 'mailparser';
import { ParsedEmail, EmailAttachment } from '../../types';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
const VIDEO_TYPES = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/avi', 'video/webm'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
const VIDEO_EXTENSIONS = ['.mp4', '.mpeg', '.mov', '.avi', '.webm'];

function isImageFile(contentType: string, filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return IMAGE_TYPES.includes(contentType) || IMAGE_EXTENSIONS.includes(ext);
}

function isVideoFile(contentType: string, filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return VIDEO_TYPES.includes(contentType) || VIDEO_EXTENSIONS.includes(ext);
}

export async function parseRawEmail(source: Buffer): Promise<ParsedEmail> {
  const parsed = await simpleParser(source);

  const attachments: EmailAttachment[] = parsed.attachments.map((att) => {
    const filename = att.filename || 'unknown';
    return {
      filename,
      contentType: att.contentType,
      size: att.size,
      content: att.content,
      isImage: isImageFile(att.contentType, filename),
      isVideo: isVideoFile(att.contentType, filename),
    };
  });

  return {
    subject: parsed.subject || '(без теми)',
    from: parsed.from?.text || '',
    date: parsed.date || new Date(),
    textBody: parsed.text || '',
    htmlBody: typeof parsed.html === 'string' ? parsed.html : '',
    attachments,
  };
}

export function extractPlainText(email: ParsedEmail): string {
  if (email.textBody) return email.textBody;

  // Якщо є тільки HTML — видаляємо теги
  return email.htmlBody
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
