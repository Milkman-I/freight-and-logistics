import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * bridge-create-transfer — submits the user's outgoing pending transaction
 * row as a real Bridge transfer, funded from their custody wallet
 * (source: bridge_wallet → wallet id) and delivered on-chain to a crypto
 * address (destination: payment_rail "base" → to_address). Amount and
 * currency are read strictly from the DB row, never the request body. A
 * Bridge rejection flips the row to failed; acceptance links
 * bridge_transfer_id and hands lifecycle ownership to the webhook. JWT
 * auth. Secrets: BRIDGE_API_KEY · ALLOWED_ORIGINS (optional) ·
 * BRIDGE_API_URL (optional, overrides api.bridge.xyz/v0).
 */

const API_URL =
  Deno.env.get("BRIDGE_API_URL")?.trim() || "https://api.bridge.xyz/v0";

const DECIMALS: Record<string, number> = { USD: 100, EUR: 100, USDB: 1_000_000 };

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

const json = (
  body: unknown,
  status = 200,
  cors: Record<string, string> = { vary: "Origin" },
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });

type TransferRow = {
  id: string;
  user_id: string;
  amount_minor: number;
  currency: string;
  rail: string | null;
  status: string;
  direction: string;
  counterparty: string | null;
  bridge_transfer_id: string | null;
};

type ProfileRow = {
  bridge_customer_id: string | null;
  kyc_status: string;
};

const mapTransfer = (state: string): string | null => {
  if (["awaiting_funds", "awaiting_total_funding"].includes(state)) return "awaiting_funds";
  if (["funds_arriving", "funds_entering"].includes(state)) return "funds_arriving";
  if (["created", "pending", "processing", "payment_submitted"].includes(state)) return "pending";
  if (["funds_received", "cleared"].includes(state)) return "funds_received";
  if (["settled", "payment_processed"].includes(state)) return "settled";
  if (["failed", "canceled", "returned", "refund_requested", "refunded", "expired"].includes(state)) {
    return "failed";
  }
  return null;
};

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const key = Deno.env.get("BRIDGE_API_KEY")?.trim();
  if (!key) return json({ error: "bridge_not_configured" }, 500, cors);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const {
    data: { user },
    error: userErr,
  } = await db.auth.getUser(req.headers.get("Authorization")!.replace("Bearer ", ""));
  if (userErr || !user) return json({ error: "unauthorized" }, 401, cors);

  const body = (await req.json().catch(() => ({}))) as {
    transaction_id?: string;
    wallet_address?: string;
  };
  const txId = String(body.transaction_id ?? "");
  if (!txId) return json({ error: "transaction_id_required" }, 400, cors);

  const { data: tx } = await db
    .schema("public")
    .from("transactions")
    .select("*")
    .eq("id", txId)
    .eq("user_id", user.id)
    .single<TransferRow>();
  if (!tx) return json({ error: "transaction_not_found" }, 404, cors);
  if (tx.direction !== "out") return json({ error: "transfer_not_outgoing" }, 400, cors);
  if (tx.bridge_transfer_id) return json({ error: "already_submitted" }, 409, cors);
  if (tx.status !== "pending" && tx.status !== "failed") {
    return json({ error: "transaction_not_sendable", status: tx.status }, 400, cors);
  }

  const { data: profile } = await db
    .schema("public")
    .from("user_profiles")
    .select("bridge_customer_id, kyc_status")
    .eq("id", user.id)
    .single<ProfileRow>();
  if (!profile?.bridge_customer_id) {
    return json({ error: "customer_not_registered" }, 428, cors);
  }
  if (profile.kyc_status !== "approved") {
    return json({ error: "kyc_not_approved" }, 403, cors);
  }

  const rail = (tx.rail ?? "base").toLowerCase();
  if (["ach_push", "wire", "fednow", "sepa"].includes(rail)) {
    await db.schema("public").from("transactions").update({ status: "failed" }).eq("id", tx.id);
    return json({ error: "recipient_details_required", rail }, 400, cors);
  }

  const decimals = DECIMALS[tx.currency] ?? 1_000_000;
  const amount = (tx.amount_minor / decimals).toFixed(decimals === 100 ? 2 : 6);
  const toAddress = String(body.wallet_address ?? tx.counterparty ?? "");
  if (!toAddress) {
    await db.schema("public").from("transactions").update({ status: "failed" }).eq("id", tx.id);
    return json({ error: "wallet_address_required" }, 400, cors);
  }

  const { data: walletRow } = await db
    .schema("public")
    .from("money_accounts")
    .select("bridge_account_id")
    .eq("user_id", user.id)
    .eq("kind", "wallet")
    .maybeSingle<{ bridge_account_id: string | null }>();
  if (!walletRow?.bridge_account_id) {
    await db.schema("public").from("transactions").update({ status: "failed" }).eq("id", tx.id);
    return json({ error: "wallet_not_provisioned" }, 400, cors);
  }

  const res = await fetch(`${API_URL}/transfers`, {
    method: "POST",
    headers: {
      "Api-Key": key,
      "Idempotency-Key": crypto.randomUUID(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      amount,
      on_behalf_of: profile.bridge_customer_id,
      source: {
        payment_rail: "bridge_wallet",
        currency: tx.currency.toLowerCase(),
        bridge_wallet_id: walletRow.bridge_account_id,
      },
      destination: {
        payment_rail: rail,
        currency: tx.currency.toLowerCase(),
        to_address: toAddress,
      },
    }),
  });

  if (!res.ok) {
    await db.schema("public").from("transactions").update({ status: "failed" }).eq("id", tx.id);
    return json({ error: "bridge_error", detail: await res.text() }, 502, cors);
  }

  const created = (await res.json()) as { id: string; state?: string };
  const status = mapTransfer(created.state ?? "created") ?? "pending";

  await db
    .schema("public")
    .from("transactions")
    .update({ bridge_transfer_id: created.id, status })
    .eq("id", tx.id);

  return json({ transaction_id: tx.id, bridge_transfer_id: created.id, status }, 200, cors);
});
