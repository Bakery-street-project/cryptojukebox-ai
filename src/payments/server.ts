import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { x402HTTPResourceServer } from "@x402/core/http";
import type { HTTPAdapter, HTTPRequestContext } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createMockGate, DECODE_ROUTE } from "./mock.ts";
import type { GateVerdict, PaymentGate, PaymentsConfig } from "./types.ts";

class BunRequestAdapter implements HTTPAdapter {
  constructor(private readonly req: Request) {}
  getHeader(name: string): string | undefined {
    return this.req.headers.get(name) ?? undefined;
  }
  getMethod(): string {
    return this.req.method;
  }
  getPath(): string {
    return new URL(this.req.url).pathname;
  }
  getUrl(): string {
    return this.req.url;
  }
  getAcceptHeader(): string {
    return this.req.headers.get("accept") ?? "";
  }
  getUserAgent(): string {
    return this.req.headers.get("user-agent") ?? "";
  }
}

function toObjectBody(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { detail: body ?? null };
}

async function buildX402TestnetGate(cfg: Extract<PaymentsConfig, { mode: "x402-testnet" }>): Promise<PaymentGate> {
  const resource = new x402ResourceServer(new HTTPFacilitatorClient({ url: cfg.facilitatorUrl }));
  resource.register(cfg.networkCaip2, new ExactEvmScheme());
  const http = new x402HTTPResourceServer(resource, {
    [DECODE_ROUTE]: {
      accepts: [{ scheme: "exact", network: cfg.networkCaip2, payTo: cfg.payTo, price: cfg.priceUsdc }],
      resource: "cryptojukebox decode",
      description: "One neuromorphic decode: dreams, ideas, scripts and prompts from the track.",
      mimeType: "application/json",
    },
  });
  await http.initialize();

  return {
    mode: "x402-testnet",

    async verifyAndSettle(req: Request): Promise<GateVerdict> {
      const adapter = new BunRequestAdapter(req);
      const context: HTTPRequestContext = {
        adapter,
        path: new URL(req.url).pathname,
        method: req.method,
      };
      const paymentHeader = req.headers.get("x-payment");
      if (paymentHeader) context.paymentHeader = paymentHeader;

      const result = await http.processHTTPRequest(context);
      if (result.type === "payment-error") {
        return {
          release: false,
          status: result.response.status,
          headers: result.response.headers,
          body: toObjectBody(result.response.body),
        };
      }
      if (result.type === "no-payment-required") {
        return { release: true, settleHeaders: {} };
      }

      const settle = await http.processSettlement(result.paymentPayload, result.paymentRequirements, result.declaredExtensions, {
        request: context,
      });
      if (!settle.success) {
        return {
          release: false,
          status: settle.response.status,
          headers: settle.headers,
          body: toObjectBody(settle.response.body),
        };
      }
      return { release: true, settleHeaders: settle.headers };
    },
  };
}

export async function buildPaymentGate(cfg: PaymentsConfig): Promise<PaymentGate> {
  if (cfg.mode === "mock") return createMockGate(cfg);
  return buildX402TestnetGate(cfg);
}
