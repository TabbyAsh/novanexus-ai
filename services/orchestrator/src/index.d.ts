import type { BotType } from '@nova/shared';
declare const app: import("express-serve-static-core").Express;
export interface BotRegistration {
    id: string;
    botType: BotType;
    instanceId: string;
    status: 'ONLINE' | 'OFFLINE' | 'BUSY' | 'ERROR';
    capabilities: string[];
    permissions: string[];
    lastHeartbeat: string | null;
    registeredAt: string;
}
export default app;
