export type PaymentsMode = "off" | "mock" | "x402-testnet";

export type EvmCaip2Network = `eip155:${number}`;

export type PaymentsConfig =
  | {
      mode: "mock";
      networkCaip2: EvmCaip2Network;
      payTo: string;
      priceUsdc: string;
      facilitatorUrl?: string;
    }
  | {
      mode: "x402-testnet";
      networkCaip2: EvmCaip2Network;
      payTo: string;
      priceUsdc: string;
      facilitatorUrl: string;
    };

export interface PaymentRequirementView {
  scheme: "exact";
  network: EvmCaip2Network;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { network?: string; timeCache?: string };
}

export type GateVerdict =
  | { release: true; settleHeaders: Record<string, string> }
  | { release: false; status: number; headers: Record<string, string>; body: Record<string, unknown> };

export interface PaymentGate {
  readonly mode: Exclude<PaymentsMode, "off">;
  verifyAndSettle(req: Request): Promise<GateVerdict>;
}
