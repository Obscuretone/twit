import { Response } from 'express';
declare class RealtimeBroadcaster {
    private clients;
    private eventEmitter;
    private initialized;
    constructor();
    init(): Promise<void>;
    private setupRabbitMQ;
    addClient(userId: string, res: Response): string;
    removeClient(clientId: string): void;
    private broadcastToLocalClients;
    publishEvent(targetUserId: string | null, type: string, payload: any): Promise<void>;
}
export declare const realtimeBroadcaster: RealtimeBroadcaster;
export {};
//# sourceMappingURL=realtime.d.ts.map