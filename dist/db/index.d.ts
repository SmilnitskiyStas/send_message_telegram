export declare function getDb(): any;
export declare function closeDb(): void;
export declare function dbGet<T = any>(sql: string, params?: any[]): T | undefined;
export declare function dbRun(sql: string, params?: any[]): {
    changes: number;
    lastInsertRowid: number;
};
export declare function dbAll<T = any>(sql: string, params?: any[]): T[];
//# sourceMappingURL=index.d.ts.map