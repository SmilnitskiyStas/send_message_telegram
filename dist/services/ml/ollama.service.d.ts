import { EventDetails } from '../telegram/templates';
export declare function startOllama(): Promise<void>;
export declare function stopOllama(): void;
export declare function parseWithOllama(body: string): Promise<Partial<EventDetails> | null>;
export declare function isOllamaReady(): boolean;
//# sourceMappingURL=ollama.service.d.ts.map