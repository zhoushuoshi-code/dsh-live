import type { WebServer } from '@deepseek-ai/dsh-host-webserver';
import type { HostPairingController } from './controller.js';
/** Register the desktop pairing surface through the official DSH WebServer. */
export declare function registerHostRoutes(webServer: WebServer, controller: HostPairingController | undefined): () => void;
//# sourceMappingURL=routes.d.ts.map