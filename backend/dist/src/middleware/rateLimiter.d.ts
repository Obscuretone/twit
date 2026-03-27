import { Request, Response, NextFunction } from 'express';
export declare const rateLimiter: (windowSecs: number, limit: number, prefix?: string) => (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=rateLimiter.d.ts.map