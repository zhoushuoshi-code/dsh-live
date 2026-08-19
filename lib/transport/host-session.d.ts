import type { ApprovalBridge } from '../approval-bridge.js';
import { type HostPairing } from '../crypto/protocol.js';
export type HostSessionStatus = 'connecting' | 'waiting-for-phone' | 'paired' | 'closed' | 'error';
export interface RelaySocket {
    send(data: Uint8Array<ArrayBuffer>): void | Promise<void>;
    close(code?: number, reason?: string): void;
    onMessage(listener: (data: Uint8Array<ArrayBuffer>) => void): () => void;
    onClose(listener: () => void): () => void;
}
export type RelaySocketFactory = (url: string) => Promise<RelaySocket>;
export interface HostRelaySessionOptions {
    mobileAppUrl: string;
    relayUrl: string;
    now?: number;
    ttlMs?: number;
    socketFactory?: RelaySocketFactory;
}
/** Open one outbound binary WebSocket without exposing a local Host port. */
export declare function openNodeRelaySocket(url: string): Promise<RelaySocket>;
/** One QR invitation, one outbound relay socket, and at most one paired phone. */
export declare class HostRelaySession {
    #private;
    readonly pairing: HostPairing;
    readonly socket: RelaySocket;
    private readonly bridge;
    private constructor();
    static create(bridge: Pick<ApprovalBridge, 'subscribe' | 'decide'>, options: HostRelaySessionOptions): Promise<HostRelaySession>;
    get status(): HostSessionStatus;
    get lastError(): Error | undefined;
    get expiresAt(): number;
    get pairingUrl(): string;
    subscribeStatus(listener: (status: HostSessionStatus) => void): () => void;
    close(): void;
}
//# sourceMappingURL=host-session.d.ts.map