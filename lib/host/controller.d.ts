import type { ApprovalBridge } from '../approval-bridge.js';
import { type HostRelaySessionOptions, type HostSessionStatus } from '../transport/host-session.js';
export interface HostControllerConfig {
    mobileAppUrl: string;
    relayUrl: string;
}
export interface PairingView {
    qrSvg: string;
    expiresAt: number;
    status: HostSessionStatus;
}
/** Owns the single active phone invitation for one DSH Host process. */
export declare class HostPairingController {
    #private;
    private readonly bridge;
    readonly config: HostControllerConfig;
    private readonly sessionOptions;
    constructor(bridge: Pick<ApprovalBridge, 'subscribe' | 'decide'>, config: HostControllerConfig, sessionOptions?: Pick<HostRelaySessionOptions, 'socketFactory'>);
    get status(): HostSessionStatus | 'not-started';
    pairing(): Promise<PairingView>;
    regenerate(): Promise<PairingView>;
    close(): void;
}
//# sourceMappingURL=controller.d.ts.map