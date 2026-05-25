export interface ParsedEmail {
  subject: string;
  from: string;
  date: Date;
  textBody: string;
  htmlBody: string;
  attachments: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
  isImage: boolean;
  isVideo: boolean;
}

export interface Store {
  id: number;
  name: string;
  code: string;
  address: string | null;
}

export interface User {
  id: number;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  phone: string;
  position: string;
  store_id: number | null;
  telegram_chat_id: number | null;
  telegram_username: string | null;
  role: 'security' | 'employee' | 'admin';
  receive_all: number;   // 1 = отримує сповіщення з усіх магазинів
  is_active: number;
  registration_token: string | null;
}
