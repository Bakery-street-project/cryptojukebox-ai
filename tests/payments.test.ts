import { expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { CACHE_DIR } from "../src/ingest.ts";
import { PaymentsConfigError, readPaymentsConfig } from "../src/payments/config.ts";
import { usdcAtomicAmount } from "../src/payments/mock.ts";

const PAY_TO = "0x1111111111111111111111111111111111111111";

process.env.JUKEBOX_PAYMENTS = "mock";
process.env.JUKEBOX_PAY_TO = PAY_TO;
process.env.JUKEBOX_PAY_NETWORK = "base-sepolia";
process.env.JUKEBOX_PAY_PRICE_USDC = "0.05";
delete process.env.JUKEBOX_X402_FACILITATOR_URL;

const { route } = await import("../src/server.ts");

function decodeRequest(paymentHeader?: string, url = "https://example.com/track"): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (paymentHeader) headers["x-payment"] = paymentHeader;
  return new Request("http://localhost/api/decode", {
    method: "POST",
    headers,
    body: JSON.stringify({ url }),
  });
}

function mockPayment(nonce: string, overrides?: { to?: string; value?: string; scheme?: string; network?: string }): string {
  const body = {
    x402Version: 2,
    scheme: overrides?.scheme ?? "exact",
    network: overrides?.network ?? "eip155:84532",
    payload: {
      authorization: {
        from: "0x2222222222222222222222222222222222222222",
        to: overrides?.to ?? PAY_TO,
        value: overrides?.value ?? "50000",
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + 3600),
        nonce,
        extraData: "0x",
      },
      signature: "0xdeadbeef",
    },
  };
  return Buffer.from(JSON.stringify(body)).toString("base64");
}

test("config: unset or off -> null (payment gate disabled)", () => {
  expect(readPaymentsConfig({})).toBeNull();
  expect(readPaymentsConfig({ JUKEBOX_PAYMENTS: "off" })).toBeNull();
  expect(readPaymentsConfig({ JUKEBOX_PAYMENTS: "  " })).toBeNull();
});

test("config: unknown mode throws", () => {
  expect(() => readPaymentsConfig({ JUKEBOX_PAYMENTS: "mainnet" })).toThrow(PaymentsConfigError);
});

test("config: payTo must be an address, price must be positive", () => {
  expect(() => readPaymentsConfig({ JUKEBOX_PAYMENTS: "mock", JUKEBOX_PAY_TO: "not-an-address" })).toThrow(PaymentsConfigError);
  expect(() =>
    readPaymentsConfig({ JUKEBOX_PAYMENTS: "mock", JUKEBOX_PAY_TO: PAY_TO, JUKEBOX_PAY_PRICE_USDC: "-1" }),
  ).toThrow(PaymentsConfigError);
});

test("config: x402-testnet requires an https facilitator URL", () => {
  expect(() => readPaymentsConfig({ JUKEBOX_PAYMENTS: "x402-testnet", JUKEBOX_PAY_TO: PAY_TO })).toThrow(PaymentsConfigError);
  const cfg = readPaymentsConfig({
    JUKEBOX_PAYMENTS: "x402-testnet",
    JUKEBOX_PAY_TO: PAY_TO,
    JUKEBOX_X402_FACILITATOR_URL: "https://x402.org/facilitator",
  });
  expect(cfg?.mode).toBe("x402-testnet");
  if (cfg?.mode === "x402-testnet") expect(cfg.facilitatorUrl).toBe("https://x402.org/facilitator");
});

test("config: network alias and passthrough caip-2", () => {
  const base = readPaymentsConfig({ JUKEBOX_PAYMENTS: "mock", JUKEBOX_PAY_TO: PAY_TO, JUKEBOX_PAY_NETWORK: "base" });
  expect(base?.networkCaip2).toBe("eip155:8453");
  const custom = readPaymentsConfig({ JUKEBOX_PAYMENTS: "mock", JUKEBOX_PAY_TO: PAY_TO, JUKEBOX_PAY_NETWORK: "eip155:123" });
  expect(custom?.networkCaip2).toBe("eip155:123");
});

test("mock: 0.05 USDC is 50000 atomic units", () => {
  const cfg = readPaymentsConfig({ JUKEBOX_PAYMENTS: "mock", JUKEBOX_PAY_TO: PAY_TO });
  expect(cfg && usdcAtomicAmount(cfg)).toBe("50000");
});

test("gate: unpaid decode request gets 402 with x402 requirements", async () => {
  const res = await route(decodeRequest());
  expect(res.status).toBe(402);
  expect(res.headers.get("x-payment-required")).toStartWith("eyJ");
  const body = (await res.json()) as {
    x402Version: number;
    error: string;
    paymentRequirements: { scheme: string; network: string; maxAmountRequired: string; payTo: string; asset: string }[];
  };
  expect(body.x402Version).toBe(2);
  expect(body.error).toInclude("payment required");
  const req0 = body.paymentRequirements[0];
  expect(req0?.scheme).toBe("exact");
  expect(req0?.network).toBe("eip155:84532");
  expect(req0?.maxAmountRequired).toBe("50000");
  expect(req0?.payTo).toBe(PAY_TO);
});

test("gate: unpaid request must not touch the audio cache", async () => {
  const before = existsSync(CACHE_DIR) ? readdirSync(CACHE_DIR).length : -1;
  await route(decodeRequest());
  await route(decodeRequest("!!!not-base64-json!!!"));
  const after = existsSync(CACHE_DIR) ? readdirSync(CACHE_DIR).length : -1;
  expect(after).toBe(before);
});

test("gate: valid mock payment releases the pipeline", async () => {
  const res = await route(decodeRequest(mockPayment("0x" + "aa".repeat(32))));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: string };
  expect(body.error).toInclude("supported sources");
});

test("gate: replayed authorization is rejected after settle", async () => {
  const nonce = "0x" + "bb".repeat(32);
  const first = await route(decodeRequest(mockPayment(nonce)));
  expect(first.status).toBe(400);
  const replay = await route(decodeRequest(mockPayment(nonce)));
  expect(replay.status).toBe(402);
  const body = (await replay.json()) as { error: string };
  expect(body.error).toInclude("replayed");
});

test("gate: payment to wrong address or wrong amount is rejected", async () => {
  const wrongTo = await route(
    decodeRequest(mockPayment("0x" + "cc".repeat(32), { to: "0x3333333333333333333333333333333333333333" })),
  );
  expect(wrongTo.status).toBe(402);
  const wrongValue = await route(decodeRequest(mockPayment("0x" + "dd".repeat(32), { value: "1" })));
  expect(wrongValue.status).toBe(402);
});

test("gate: expired authorization is rejected", async () => {
  const expired = Buffer.from(
    JSON.stringify({
      x402Version: 2,
      scheme: "exact",
      network: "eip155:84532",
      payload: {
        authorization: {
          from: "0x2222222222222222222222222222222222222222",
          to: PAY_TO,
          value: "50000",
          validBefore: String(Math.floor(Date.now() / 1000) - 10),
          nonce: "0x" + "ee".repeat(32),
        },
        signature: "0xdeadbeef",
      },
    }),
  ).toString("base64");
  const res = await route(decodeRequest(expired));
  expect(res.status).toBe(402);
  const body = (await res.json()) as { error: string };
  expect(body.error).toInclude("expired");
});
