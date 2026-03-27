import amqp from 'amqplib';
export declare function connectQueue(): Promise<void>;
export declare function getChannel(): amqp.Channel;
export declare function sendToQueue(queue: string, message: any): Promise<void>;
export declare function consumeQueue(queue: string, callback: (msg: any) => void): Promise<void>;
//# sourceMappingURL=queue.d.ts.map