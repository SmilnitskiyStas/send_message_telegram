export interface EventDetails {
    eventTime: string;
    storeNumber: string | null;
    cameraLabel: string | null;
    targetId: string | null;
    personName: string | null;
    similarity: number | null;
    ageGroup: string | null;
    gender: string | null;
}
export declare function parseEventDetails(body: string): EventDetails;
export declare function extractEventDetails(body: string): Promise<EventDetails>;
export declare function buildNotificationText(ev: EventDetails, storeName: string | null): string;
export declare function buildRegistrationSuccessText(firstName: string, lastName: string, storeName: string | null, role: string): string;
//# sourceMappingURL=templates.d.ts.map