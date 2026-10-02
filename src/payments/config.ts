import type { EvmCaip2Network, PaymentsConfig } from "./types.ts";

export class PaymentsConfigError extends Error {}

const NETWORK_ALIASES: Record<string, EvmCaip2Network> = {
  "base-sepolia": "eip155:84532",
  base: "eip155:8453",
};

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function readPaymentsConfig(env: Record<string, string | undefined>): PaymentsConfig | null {
  const raw = (env.JUKEBOX_PAYMENTS ?? "off").trim().toLowerCase();
  if (raw === "off" || raw === "") return null;
  if (raw !== "mock" && raw !== "x402-testnet") {
    throw new PaymentsConfigError(`JUKEBOX_PAYMENTS must be off|mock|x402-testnet, got "${raw}"`);
  }

  const network = (env.JUKEBOX_PAY_NETWORK ?? "base-sepolia").trim().toLowerCase();
  const caip2 = NETWORK_ALIASES[network] ?? (/^eip155:\d+$/.test(network) ? (network as EvmCaip2Network) : undefined);
  if (!caip2) throw new PaymentsConfigError(`unknown JUKEBOX_PAY_NETWORK "${network}" (known: base-sepolia, base)`);

  const payTo = (env.JUKEBOX_PAY_TO ?? "").trim();
  if (!EVM_ADDRESS.test(payTo)) {
    throw new PaymentsConfigError("JUKEBOX_PAY_TO must be a 0x EVM receive address — a public address only; never put a private key or seed anywhere in this project");
  }

  const priceUsdc = (env.JUKEBOX_PAY_PRICE_USDC ?? "0.05").trim();
  if (!/^\d+(\.\d+)?$/.test(priceUsdc) || Number(priceUsdc) <= 0) {
    throw new PaymentsConfigError(`JUKEBOX_PAY_PRICE_USDC must be a positive decimal USDC amount, got "${priceUsdc}"`);
  }

  const facilitatorUrl = (env.JUKEBOX_X402_FACILITATOR_URL ?? "").trim();
  if (raw === "x402-testnet" && !/^https:\/\//.test(facilitatorUrl)) {
    throw new PaymentsConfigError("JUKEBOX_PAYMENTS=x402-testnet requires JUKEBOX_X402_FACILITATOR_URL (https facilitator)");
  }
  if (facilitatorUrl && !/^https:\/\//.test(facilitatorUrl)) {
    throw new PaymentsConfigError(`JUKEBOX_X402_FACILITATOR_URL must be an https URL, got "${facilitatorUrl}"`);
  }

  if (raw === "mock") {
    return facilitatorUrl
      ? { mode: "mock", networkCaip2: caip2, payTo, priceUsdc, facilitatorUrl }
      : { mode: "mock", networkCaip2: caip2, payTo, priceUsdc };
  }
  return { mode: "x402-testnet", networkCaip2: caip2, payTo, priceUsdc, facilitatorUrl };
}
