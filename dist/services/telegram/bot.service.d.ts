import { Bot } from 'grammy';
import { ParsedEmail } from '../../types';
export declare function getBot(): Bot;
export declare function startBot(): Promise<void>;
export declare function stopBot(): Promise<void>;
export declare function sendNotification(chatId: number, email: ParsedEmail, storeName: string | null): Promise<number[]>;
export declare function sendTextMessage(chatId: number, text: string): Promise<void>;
//# sourceMappingURL=bot.service.d.ts.map