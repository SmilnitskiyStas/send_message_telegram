import { ParsedEmail } from '../../types';
export interface EventDetails {
    eventTime: string;
    storeNumber: string | null;
    cameraNumber: string | null;
    cameraLabel: string | null;
    targetId: string | null;
    personName: string | null;
    similarity: number | null;
    ageGroup: string | null;
    gender: string | null;
}
export declare function parseEventDetails(body: string): EventDetails;
export declare function buildNotificationText(email: ParsedEmail, storeName: string | null): string;
export declare function buildRegistrationSuccessText(firstName: string, lastName: string, storeName: string | null, role: string): string;
//# sourceMappingURL=templates.d.ts.map