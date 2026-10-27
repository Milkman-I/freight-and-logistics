import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** bridge-create-transfer — submit a user's `pending` tx row as a real
 *  Bridge transfer. Amount/currency read from the DB row (authoritative;
 *  never the client body); a Bridge 4xx/5xx flips the row to failed so
 *  nothing sits fake-pending. JWT auth. Secret: BRIDGE_API_KEY */

// env override for sandbox testing: BRIDGE_API_URL=https://api.sandbox.bridge.xyz/v0
const BRIDGE_API = Deno.env.get("BRIDGE_API_URL")?.trim() || "https://api.bridge.xyz/v0";
const DECIMALS: Record<string, number> = { USD: 100, EUR: 100, USDB: 1_000_000 };

type TransferRow = {
  id: string;
  amount_minor: number;
  currency: string; // USD | EUR | USDB
  rail: string | null; // ach | fednow | wire | sepa | base
  status: string;
  counterparty: string | null;
  bridge_transfer_id: string | null;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

/** Bridge transfer state → F&L money lifecycle (mirrors bridge-webhook) */
function mapTransfer(state: string): string | null {
  const s = state ?? "";
  if (["awaiting_funds", "awaiting_total_funding"].includes(s)) return "awaiting_funds";
  if (["funds_arriving", "funds_entering"].includes(s)) return "funds_arriving";
  if (["created", "pending", "processing"].includes(s)) return "pending";
  if (["funds_received", "cleared"].includes(s)) return "funds_received";
  if (s === "settled") return "settled";
  if (["failed", "canceled", "returned", "refund_requested", "refunded", "expired"].includes(s))
    return "failed";
  return null;
}

/** DB rail → Bridge payment_rail (blockchain = base) */
const paymentRail = (rail: string | null): string => {
  const r = (rail ?? "").toLowerCase();
  return r === "base" ? "blockchain" : r || "ach";
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const bridgeKey = Deno.env.get("BRIDGE_API_KEY")?.trim();
  if (!bridgeKey) return json({ error: "bridge_not_configured" }, 500);

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
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  // the caller's own row — amount/currency are authoritative from it
  const body = (await req.json().catch(() => ({}))) as {
    transaction_id?: string;
    wallet_address?: string;
  };
  const txId = String(body.transaction_id ?? "");
  if (!txId) return json({ error: "transaction_id_required" }, 400);

  const { data: tx } = await service
    .schema("public")
    .from("transactions")
    .select("*")
    .eq("id", txId)
    .eq("user_id", user.id) // ownership check
    .single<TransferRow>();
  if (!tx) return json({ error: "transaction_not_found" }, 404);
  if (tx.direction !== "out") return json({ error: "transfer_not_outgoing" }, 400);
  if (tx.bridge_transfer_id) return json({ error: "already_submitted" }, 409);
  if (tx.status !== "pending" && tx.status !== "failed")
    return json({ error: "transaction_not_sendable", status: tx.status }, 400);

  // KYC gate
  const { data: profile } = await service
    .schema("public")
    .from("user_profiles")
    .select("bridge_customer_id, kyc_status")
    .eq("id", user.id)
    .single<{ bridge_customer_id: string | null; kyc_status: string }>();
  if (!profile?.bridge_customer_id) return json({ error: "customer_not_registered" }, 428);
  if (profile.kyc_status !== "approved") return json({ error: "kyc_not_approved" }, 403);

  // bank rails need structured recipient details the /send UI doesn't have yet
  const railLower = (tx.rail ?? "base").toLowerCase();
  if (["ach", "wire", "fednow", "sepa"].includes(railLower)) {
    await failRow(tx.id);
    return json({ error: "recipient_details_required", rail: railLower }, 400);
  }

  // blockchain payout (USDB on base) — the primary stablecoin path
  const decimals = DECIMALS[tx.currency] ?? 1_000_000;
  const amountMajor = (tx.amount_minor / decimals).toFixed(decimals === 100 ? 2 : 6);
  const walletAddress = String(body.wallet_address ?? tx.counterparty ?? "");
  if (!walletAddress) {
    await failRow(tx.id);
    return json({ error: "wallet_address_required" }, 400);
  }

  const res = await fetch(`${BRIDGE_API}/transfers`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Basic ${btoa(bridgeKey)}`,
    },
    body: JSON.stringify({
      amount: amountMajor,
      currency: tx.currency.toLowerCase(),
      on_behalf_of: profile.bridge_customer_id,
      destination: {
        payment_rail: paymentRail(tx.rail),
        ...(railLower === "base" ? { chain: "base" } : {}),
        wallet_address: walletAddress,
      },
    }),
  });

  if (!res.ok) {
    await failRow(tx.id);
    return json({ error: "bridge_error", detail: await res.text() }, 502);
  }

  const created = (await res.json()) as { id: string; state: string };
  const status = mapTransfer(created.state ?? "created") ?? "pending";

  // link the row — the transfer.updated webhook owns it from here
  await service
    .schema("public")
    .from("transactions")
    .update({ bridge_transfer_id: created.id, status })
    .eq("id", tx.id);

  return json({ transaction_id: tx.id, bridge_transfer_id: created.id, status });
});
