import { Bot } from 'grammy';
import { EmailAttachment } from '../../types';
export declare function getBot(): Bot;
export declare function startBot(): Promise<void>;
export declare function stopBot(): Promise<void>;
export declare function sendNotification(chatId: number, text: string, images: EmailAttachment[]): Promise<number[]>;
export declare function sendTextMessage(chatId: number, text: string): Promise<void>;
//# sourceMappingURL=bot.service.d.ts.map