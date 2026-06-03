/**
 * Manual end-to-end smoke test of the Pagadito Connect client.
 *
 * Usage:
 *   PAGADITO_ENV=sandbox \
 *   PAGADITO_UID=<sandbox uid> \
 *   PAGADITO_WSK=<sandbox wsk> \
 *   PAGADITO_RETURN_URL=https://example.com/return \
 *   PAGADITO_RECONCILE_SECRET=dummy \
 *   pnpm tsx scripts/pagadito-smoke.ts
 *
 * Exits 0 on success, 1 on failure.
 */
import { pagadito } from "../lib/pagadito/client";
import { PAGADITO } from "../lib/pagadito/config";

async function main() {
  console.log(`[smoke] env=${PAGADITO.env} baseUrl=${PAGADITO.baseUrl}`);

  if (!PAGADITO.isConfigured) {
    console.error("[smoke] PAGADITO_UID / PAGADITO_WSK not set");
    process.exit(1);
  }

  // 1. exec-trans
  const ern = `SMOKE-${Date.now()}`;
  console.log(`[smoke] step 1: exec-trans ern=${ern} amount=1.00 NIO country=SV`);
  const trans = await pagadito.execTrans({
    ern,
    amount:      1.0,
    currency:    "NIO",
    countryCode: "SV",
    details:     [{ quantity: 1, description: "Smoke test", price: 1.0 }],
  });
  console.log(`[smoke] checkout url=${trans.url}`);
  console.log(`[smoke] transaction token=${trans.token}`);

  // 2. get-status (will be REGISTERED/PENDING until a human pays in sandbox)
  console.log("[smoke] step 2: get-status");
  const status = await pagadito.getStatus(trans.token, "SV");
  console.log(`[smoke] code=${status.code} rawStatus=${status.rawStatus} status=${status.status} ref=${status.reference ?? "-"}`);

  console.log("[smoke] OK");
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
