import { DEFAULT_ASSETS } from "@x402/evm";
import type {
  GateVerdict,
  PaymentGate,
  PaymentRequirementView,
  PaymentsConfig,
} from "./types.ts";

const DECODE_ROUTE = "POST /api/decode";

interface MockAuthorization {
  from?: unknown;
  to?: unknown;
  value?: unknown;
  validBefore?: unknown;
  nonce?: unknown;
}

export function usdcAtomicAmount(cfg: PaymentsConfig): string {
  const assetInfo = DEFAULT_ASSETS[cfg.networkCaip2]?.[0];
  if (!assetInfo) throw new Error(`no default USDC asset known for network ${cfg.networkCaip2}`);
  const [whole, frac = ""] = cfg.priceUsdc.split(".");
  const digits = (frac + "0".repeat(assetInfo.decimals)).slice(0, assetInfo.decimals);
  return String(BigInt(whole!) * 10n ** BigInt(assetInfo.decimals) + BigInt(digits || "0"));
}

function requirementsView(cfg: PaymentsConfig): PaymentRequirementView {
  const assetInfo = DEFAULT_ASSETS[cfg.networkCaip2]?.[0];
  if (!assetInfo) throw new Error(`no default USDC asset known for network ${cfg.networkCaip2}`);
  const view: PaymentRequirementView = {
    scheme: "exact",
    network: cfg.networkCaip2,
    maxAmountRequired: usdcAtomicAmount(cfg),
    resource: DECODE_ROUTE,
    description: "One neuromorphic decode: dreams, ideas, scripts and prompts from the track.",
    mimeType: "application/json",
    payTo: cfg.payTo,
    maxTimeoutSeconds: 60,
    asset: assetInfo.asset,
    extra: { network: cfg.networkCaip2 },
  };
  return view;
}

function challenge402(cfg: PaymentsConfig, error: string): GateVerdict {
  const body: Record<string, unknown> = {
    x402Version: 2,
    error,
    paymentRequirements: [requirementsView(cfg)],
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64");
  return { release: false, status: 402, headers: { "x-payment-required": encoded }, body };
}

function decodePaymentHeader(header: string): unknown {
  const json = Buffer.from(header, "base64").toString("utf8");
  return JSON.parse(json);
}

/**
 * Mock gate for local runs and CI: mirrors the x402 v2 wire shape but never
 * touches a chain. The signature is NOT verified — settlement is instant and
 * replay is guarded only for the lifetime of this process.
 */
export function createMockGate(cfg: PaymentsConfig): PaymentGate & { settledCount(): number } {
  const settled = new Set<string>();

  return {
    mode: "mock",
    settledCount: () => settled.size,

    async verifyAndSettle(req: Request): Promise<GateVerdict> {
      const header = req.headers.get("x-payment");
      if (!header) return challenge402(cfg, "x402: payment required");

      let payload: unknown;
      try {
        payload = decodePaymentHeader(header);
      } catch {
        return challenge402(cfg, "x402: malformed payment header");
      }

      const p = payload as {
        scheme?: unknown;
        network?: unknown;
        payload?: { authorization?: MockAuthorization; signature?: unknown };
      };
      if (p.scheme !== "exact" || p.network !== cfg.networkCaip2) {
        return challenge402(cfg, "x402: unsupported payment");
      }
      const auth = p.payload?.authorization;
      const signature = p.payload?.signature;
      if (
        !auth ||
        typeof auth.to !== "string" ||
        auth.to.toLowerCase() !== cfg.payTo.toLowerCase() ||
        auth.value !== usdcAtomicAmount(cfg) ||
        typeof auth.nonce !== "string" ||
        typeof signature !== "string" ||
        !/^0x[0-9a-fA-F]*$/.test(signature)
      ) {
        return challenge402(cfg, "x402: invalid payment");
      }

      if (typeof auth.validBefore === "string" || typeof auth.validBefore === "number") {
        const validBeforeSec = Number(auth.validBefore);
        if (Number.isFinite(validBeforeSec) && validBeforeSec < Math.floor(Date.now() / 1000)) {
          return challenge402(cfg, "x402: payment expired");
        }
      }
      if (settled.has(auth.nonce)) {
        return challenge402(cfg, "x402: replayed payment");
      }
      settled.add(auth.nonce);

      const receipt = Buffer.from(
        JSON.stringify({
          success: true,
          network: cfg.networkCaip2,
          transaction: "0xmock-" + auth.nonce.replace(/[^0-9a-fA-F]/g, "").slice(0, 40),
          responseUi: { message: "mock settlement (no chain touched)" },
        }),
      ).toString("base64");
      return { release: true, settleHeaders: { "x-payment-response": receipt } };
    },
  };
}

export { DECODE_ROUTE };
