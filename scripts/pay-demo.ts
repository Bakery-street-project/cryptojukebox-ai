/**
 * x402 pay-demo: pays for one /api/decode call with test USDC on Base Sepolia.
 *
 * Use this to verify the JUKEBOX_PAYMENTS=x402-testnet leg end-to-end:
 *   1. Get a throwaway test wallet (NEVER a wallet holding real funds):
 *      bun add viem   (already a devDependency here)
 *   2. Faucet test USDC on Base Sepolia: https://faucet.circle.com
 *   3. Run the jukebox with JUKEBOX_PAYMENTS=x402-testnet, JUKEBOX_PAY_TO=<your receive address>,
 *      JUKEBOX_X402_FACILITATOR_URL=https://x402.org/facilitator
 *   4. PAY_DEMO_PRIVATE_KEY=0x<test-key> bun scripts/pay-demo.ts [track-url]
 *
 * Proves: 402 challenge -> EIP-3009 authorization -> facilitator verify+settle ->
 * USDC lands in payTo -> DecodeResponse released. Testnet money only.
 */
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const baseUrl = process.env.JUKEBOX_URL ?? "http://localhost:8787";
const trackUrl = process.argv[2] ?? "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const key = process.env.PAY_DEMO_PRIVATE_KEY;
if (!key?.startsWith("0x")) {
  console.error("Set PAY_DEMO_PRIVATE_KEY to a THROWAWAY Base Sepolia test key (see header comment).");
  process.exit(1);
}

const account = privateKeyToAccount(key as `0x${string}`);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
const client = new x402HTTPClient(new x402Client());
client.register("eip155:84532", new ExactEvmScheme(toClientEvmSigner(account, publicClient)));

const init = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: trackUrl }),
};

let res = await fetch(`${baseUrl}/api/decode`, init);
console.log(`unpaid POST /api/decode -> HTTP ${res.status}`);
if (res.status === 402) {
  const body = (await res.json().catch(() => undefined)) as unknown;
  const required = client.getPaymentRequiredResponse((name) => res.headers.get(name), body);
  const payload = await client.createPaymentPayload(required);
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(client.encodePaymentSignatureHeader(payload))) {
    headers.set(name, value);
  }
  console.log("paying exact/eip155:84532 with EIP-3009 authorization from", account.address);
  res = await fetch(`${baseUrl}/api/decode`, { ...init, headers });
}
console.log(`paid request -> HTTP ${res.status}`);
const settle = client.getPaymentSettleResponse((name) => res.headers.get(name));
if (settle) console.log("settlement:", settle);
const json = await res.json().catch(() => null);
if (res.ok && json) {
  const artifacts = json.artifacts ?? {};
  console.log("decoded:", json.title);
  console.log("dream:", String(artifacts.dream ?? "").slice(0, 160) + "…");
} else {
  console.log(json);
}
