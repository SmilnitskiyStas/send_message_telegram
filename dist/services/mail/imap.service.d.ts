import { ParsedEmail } from '../../types';
export type NewMailHandler = (email: ParsedEmail) => Promise<void>;
export declare class ImapService {
    private readonly onNewMail;
    private pollTimer;
    private isPolling;
    constructor(onNewMail: NewMailHandler);
    start(): void;
    stop(): void;
    private createClient;
    private isProcessed;
    private markProcessed;
    private pollOnce;
}
//# sourceMappingURL=imap.service.d.ts.map