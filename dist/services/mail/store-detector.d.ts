import { Store } from '../../types';
export declare function parseEncodingDevice(body: string): {
    storeNumber: string | null;
    cameraNumber: string | null;
};
export declare function detectStore(subject: string, textBody: string): Store | null;
//# sourceMappingURL=store-detector.d.ts.map