import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** bridge-create-transfer — submit a user's `pending` tx row as a real
 *  Bridge transfer. Amount/currency read from the DB row (authoritative;
 *  never the client body); a Bridge 4xx/5xx flips the row to failed so
 *  nothing sits fake-pending. JWT auth. Secret: BRIDGE_API_KEY
 *  ("sk-test" keys auto-target the sandbox host). */

const API_BY_KEY = (key: string) =>
  Deno.env.get("BRIDGE_API_URL")?.trim() ||
  (key.startsWith("sk-test")
    ? "https://api.sandbox.bridge.xyz/v0"
    : "https://api.bridge.xyz/v0");

const DECIMALS: Record<string, number> = { USD: 100, EUR: 100, USDB: 1_000_000 };

type TransferRow = {
  id: string;
  amount_minor: number;
  currency: string; // USD | EUR | USDB
  rail: string | null; // ach_push | fednow | wire | sepa | base
  status: string;
  counterparty: string | null;
  bridge_transfer_id: string | null;
};

// CORS: our site origins only (env list, dev defaults) — never "*"
const ALLOWED_ORIGINS = (
  Deno.env.get("ALLOWED_ORIGINS") ??
  "http://localhost:5173,http://localhost:4173"
)
  .split(",")
  .map((s) => s.trim());

const corsFor = (req: Request): Record<string, string> => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.includes(origin)) return { vary: "Origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };
};

const json = (body: unknown, status = 200, cors: Record<string, string> = { vary: "Origin" }) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });

/** Bridge transfer state → F&L money lifecycle (mirrors bridge-webhook) */
function mapTransfer(state: string): string | null {
  const s = state ?? "";
  if (["awaiting_funds", "awaiting_total_funding"].includes(s)) return "awaiting_funds";
  if (["funds_arriving", "funds_entering"].includes(s)) return "funds_arriving";
  if (["created", "pending", "processing", "payment_submitted"].includes(s)) return "pending";
  if (["funds_received", "cleared"].includes(s)) return "funds_received";
  if (["settled", "payment_processed"].includes(s)) return "settled";
  if (["failed", "canceled", "returned", "refund_requested", "refunded", "expired"].includes(s))
    return "failed";
  return null;
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const bridgeKey = Deno.env.get("BRIDGE_API_KEY")?.trim();
  if (!bridgeKey) return json({ error: "bridge_not_configured" }, 500, cors);
  const BRIDGE_API = API_BY_KEY(bridgeKey);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const failRow = (id: string) =>
    service
      .schema("public")
      .from("transactions")
      .update({ status: "failed" })
      .eq("id", id);

  const {
    data: { user },
    error: userErr,
  } = await service.auth.getUser(req.headers.get("Authorization")!.replace("Bearer ", ""));
  if (userErr || !user) return json({ error: "unauthorized" }, 401, cors);

  // the caller's own row — amount/currency are authoritative from it
  const body = (await req.json().catch(() => ({}))) as {
    transaction_id?: string;
    wallet_address?: string;
  };
  const txId = String(body.transaction_id ?? "");
  if (!txId) return json({ error: "transaction_id_required" }, 400, cors);

  const { data: tx } = await service
    .schema("public")
    .from("transactions")
    .select("*")
    .eq("id", txId)
    .eq("user_id", user.id) // ownership check
    .single<TransferRow>();
  if (!tx) return json({ error: "transaction_not_found" }, 404, cors);
  if (tx.direction !== "out") return json({ error: "transfer_not_outgoing" }, 400, cors);
  if (tx.bridge_transfer_id) return json({ error: "already_submitted" }, 409, cors);
  if (tx.status !== "pending" && tx.status !== "failed") {
    return json({ error: "transaction_not_sendable", status: tx.status }, 400, cors);
  }

  // KYC gate
  const { data: profile } = await service
    .schema("public")
    .from("user_profiles")
    .select("bridge_customer_id, kyc_status")
    .eq("id", user.id)
    .single<{ bridge_customer_id: string | null; kyc_status: string }>();
  if (!profile?.bridge_customer_id) {
    return json({ error: "customer_not_registered" }, 428, cors);
  }
  if (profile.kyc_status !== "approved") {
    return json({ error: "kyc_not_approved" }, 403, cors);
  }

  // bank rails need structured recipient details the /send UI doesn't have yet
  const railLower = (tx.rail ?? "base").toLowerCase();
  if (["ach_push", "wire", "fednow", "sepa"].includes(railLower)) {
    await failRow(tx.id);
    return json({ error: "recipient_details_required", rail: railLower }, 400, cors);
  }

  // wallet payout (USDB on base) — the primary stablecoin path
  const decimals = DECIMALS[tx.currency] ?? 1_000_000;
  const amountMajor = (tx.amount_minor / decimals).toFixed(decimals === 100 ? 2 : 6);
  const walletAddress = String(body.wallet_address ?? tx.counterparty ?? "");
  if (!walletAddress) {
    await failRow(tx.id);
    return json({ error: "wallet_address_required" }, 400, cors);
  }

  // the customer's Base custody wallet funds this payout (docs: wallet source)
  const { data: walletRow } = await service
    .schema("public")
    .from("money_accounts")
    .select("bridge_account_id")
    .eq("user_id", user.id)
    .eq("kind", "wallet")
    .maybeSingle<{ bridge_account_id: string | null }>();
  if (!walletRow?.bridge_account_id) {
    await failRow(tx.id);
    return json({ error: "wallet_not_provisioned" }, 400, cors);
  }

  const res = await fetch(`${BRIDGE_API}/transfers`, {
    method: "POST",
    headers: {
      "Api-Key": bridgeKey, // current Bridge auth scheme (no Basic prefix)
      "Idempotency-Key": crypto.randomUUID(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      amount: amountMajor,
      on_behalf_of: profile.bridge_customer_id,
      source: {
        payment_rail: "bridge_wallet",
        currency: tx.currency.toLowerCase(),
        bridge_wallet_id: walletRow.bridge_account_id,
      },
      destination: {
        payment_rail: railLower, // base chain payout
        currency: tx.currency.toLowerCase(),
        to_address: walletAddress, // current field name (was wallet_address)
      },
    }),
  });

  if (!res.ok) {
    await failRow(tx.id);
    return json({ error: "bridge_error", detail: await res.text() }, 502, cors);
  }

  const created = (await res.json()) as { id: string; state: string };
  const status = mapTransfer(created.state ?? "created") ?? "pending";

  // link the row — the transfer.updated webhook owns it from here
  await service
    .schema("public")
    .from("transactions")
    .update({ bridge_transfer_id: created.id, status })
    .eq("id", tx.id);

  return json(
    { transaction_id: tx.id, bridge_transfer_id: created.id, status },
    200,
    cors,
  );
});
