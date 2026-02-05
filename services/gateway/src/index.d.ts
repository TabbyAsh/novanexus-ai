import type { JWTPayload } from '@nova/shared';
declare const app: import("express-serve-static-core").Express;
declare global {
    namespace Express {
        interface Request {
            auth?: JWTPayload;
        }
    }
}
export default app;
