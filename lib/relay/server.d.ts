export interface BlindRelayServerOptions {
    host?: string;
    port?: number;
    publicDir?: string;
    publicOrigin?: string;
    maxRooms?: number;
    roomIdleMs?: number;
    maxFrameBytes?: number;
}
export interface RunningBlindRelayServer {
    readonly host: string;
    readonly port: number;
    readonly httpUrl: string;
    readonly wsUrl: string;
    close(): Promise<void>;
}
/** Deployable HTTP + WebSocket adapter that never parses forwarded frame bodies. */
export declare function startBlindRelayServer(options?: BlindRelayServerOptions): Promise<RunningBlindRelayServer>;
//# sourceMappingURL=server.d.ts.map