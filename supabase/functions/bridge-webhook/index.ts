import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** bridge-webhook — receives Bridge events (server-to-server, no JWT/CORS),
 *  verifies the RSA signature `X-Webhook-Signature: t=<ms>,v0=<b64>` against
 *  the public key bridge-accounts stored in bridge_config, then mirrors the
 *  current flat event schema (event_category/event_type/event_object) into
 *  Postgres: customers → kyc_status, kyc_links → kyc+customer id, virtual
 *  accounts & wallets → money_accounts, transfers → transactions
 *  (+ invoice auto-match). */

const MAX_SKEW_MS = 600_000; // drop events older than 10 minutes (docs)
const DECIMALS: Record<string, number> = { USD: 100, EUR: 100, USDB: 1_000_000 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// ——— event object schemas (docs: webhooks/structure + API examples) ———
type CustomerObject = { id?: string; status?: string; email?: string };
type KycLinkObject = { id?: string; email?: string; kyc_status?: string; customer_id?: string };
type WalletObject = { id?: string; chain?: string; address?: string; customer_id?: string };
type VAccountObject = {
  id?: string;
  status?: string;
  customer_id?: string;
  source_deposit_instructions?: {
    currency?: string;
    payment_rails?: string[];
    bank_name?: string;
    bank_beneficiary_name?: string;
    account_holder_name?: string;
    bank_account_number?: string;
    bank_routing_number?: string;
    iban?: string;
  };
  destination?: { address?: string; currency?: string; payment_rail?: string };
};
type TransferObject = {
  id?: string;
  state?: string;
  amount?: string;
  currency?: string;
  on_behalf_of?: string;
  source?: {
    payment_rail?: string;
    currency?: string;
    virtual_account_id?: string;
    external_account_id?: string;
    bridge_wallet_id?: string;
  };
  destination?: { payment_rail?: string; currency?: string; to_address?: string };
};

/** Verify `t.<payload>` — Bridge signs SHA256(SHA256(payload)); WebCrypto's
 *  RSASSA-PKCS1-v1_5 hashes the digest we hand it, so pass the inner digest. */
async function verifySignature(raw: Uint8Array, header: string, pem: string): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.trim().split("=", 2) as [string, string]),
  );
  const t = Number(parts.t);
  const sigB64 = parts.v0;
  if (!Number.isFinite(t) || !sigB64 || Math.abs(Date.now() - t) > MAX_SKEW_MS) return false;

  const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const der = b64(pem.replace(/-----[^\n-]+-----|\s+/g, ""));
  const key = await crypto.subtle.importKey(
    "spki",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const text = new TextDecoder().decode(raw);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${t}.${text}`));
  return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, b64(sigB64), digest);
}

/** Bridge customer/kyc_link status → F&L kyc_status */
function mapKyc(s: string): string | null {
  const map: Record<string, string> = {
    not_started: "not_started",
    incomplete: "incomplete",
    under_review: "under_review",
    awaiting_signature: "under_review",
    awaiting_questionnaire: "under_review",
    awaiting_ubo: "under_review",
    paused: "under_review",
    active: "approved",
    approved: "approved",
    rejected: "rejected",
    retired: "rejected",
    offboarded: "rejected",
  };
  return map[s] ?? null;
}

/** Bridge transfer state → F&L money lifecycle (mirrors create-transfer) */
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
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // bypasses RLS by design
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // the endpoint's public key lands here via bridge-accounts provisioning
  const { data: cfg } = await db
    .schema("public")
    .from("bridge_config")
    .select("webhook_public_key")
    .eq("id", 1)
    .maybeSingle<{ webhook_public_key: string | null }>();
  const pem = cfg?.webhook_public_key?.trim();
  if (!pem) return json({ error: "bridge_not_configured" }, 500);

  const raw = new Uint8Array(await req.arrayBuffer());
  const signature = req.headers.get("x-webhook-signature") ?? "";
  const valid = await verifySignature(raw, signature, pem).catch(() => false);
  if (!valid) return json({ error: "invalid_signature" }, 401);

  const event = JSON.parse(new TextDecoder().decode(raw)) as {
    event_id?: string;
    event_category?: string;
    event_type?: string;
    event_object?: Record<string, unknown>;
  };
  const kind = event.event_category ?? "unknown";
  const type = event.event_type ?? "";
  const obj = (event.event_object ?? {}) as Record<string, unknown>;

  let errorNote: string | null = null;

  try {
    if (kind === "customer") {
      // scoped by bridge_customer_id — never an open update
      const c = obj as CustomerObject;
      const kyc = mapKyc(c.status ?? "");
      if (kyc && c.id) {
        await db
          .schema("public")
          .from("user_profiles")
          .update({ kyc_status: kyc })
          .eq("bridge_customer_id", c.id);
      }
    } else if (kind.startsWith("kyc_link")) {
      // approval delivers customer_id — resolve the owner by link id, then email
      const l = obj as KycLinkObject;
      const kyc = mapKyc(l.kyc_status ?? "");
      const updates: Record<string, string> = {
        ...(kyc ? { kyc_status: kyc } : {}),
        ...(l.customer_id ? { bridge_customer_id: l.customer_id } : {}),
      };
      const affects = db
        .schema("public")
        .from("user_profiles")
        .update(updates);
      const q = l.id ? affects.eq("bridge_kyc_link_id", l.id) : affects.eq("google_email", l.email ?? "");
      const { count } = await q;
      if (!count && l.email) {
        await db
          .schema("public")
          .from("user_profiles")
          .update(updates)
          .eq("google_email", l.email);
      }
    } else if (kind.startsWith("virtual_account")) {
      const acc = obj as VAccountObject;
      const sdi = acc.source_deposit_instructions ?? {};
      if (acc.customer_id) {
        const { data: profile } = await db
          .schema("public")
          .from("user_profiles")
          .select("id")
          .eq("bridge_customer_id", acc.customer_id)
          .single();
        if (profile) {
          const usd = (sdi.currency ?? "usd").toUpperCase() === "USD";
          await db
            .schema("public")
            .from("money_accounts")
            .upsert(
              {
                user_id: profile.id,
                bridge_account_id: acc.id,
                kind: usd ? "us_checking" : "eur_iban",
                currency: usd ? "USD" : "EUR",
                routing_number: sdi.bank_routing_number ?? null,
                account_number: sdi.bank_account_number ?? null,
                iban: sdi.iban ?? null,
                bank_name: sdi.bank_name ?? null,
                beneficiary_name: sdi.bank_beneficiary_name ?? sdi.account_holder_name ?? null,
                wallet_address: acc.destination?.address ?? null,
                rails: sdi.payment_rails ?? [],
                status: acc.status === "deactivated" ? "failed" : "active",
              },
              { onConflict: "bridge_account_id" },
            );
        }
      }
    } else if (kind.startsWith("bridge_wallet")) {
      const w = obj as WalletObject;
      if (w.customer_id) {
        const { data: profile } = await db
          .schema("public")
          .from("user_profiles")
          .select("id")
          .eq("bridge_customer_id", w.customer_id)
          .single();
        if (profile) {
          await db
            .schema("public")
            .from("money_accounts")
            .upsert(
              {
                user_id: profile.id,
                bridge_account_id: w.id,
                kind: "wallet",
                currency: "USDB",
                wallet_address: w.address ?? null,
                rails: [w.chain ?? "base"],
                status: "active",
              },
              { onConflict: "bridge_account_id" },
            );
        }
      }
    } else if (kind.startsWith("transfer")) {
      const t = obj as TransferObject;
      // fiat-source transfers are user deposits (into their v-account/wallet)
      const isDeposit = Boolean(t.source && (t.source.virtual_account_id || t.source.external_account_id));
      const status = mapTransfer(t.state ?? "");
      if (status && t.id) {
        const currencyRaw = t.currency ?? t.source?.currency ?? t.destination?.currency ?? "usdb";
        const currency = currencyRaw.toUpperCase();
        const decimals = DECIMALS[currency] ?? 1_000_000;
        const minorAmount = Math.round(Number(t.amount ?? 0) * decimals);

        // resolve owner: customer → v-account/wallet on either side
        let userId: string | null = null;
        if (t.on_behalf_of) {
          const { data: owner } = await db
            .schema("public")
            .from("user_profiles")
            .select("id")
            .eq("bridge_customer_id", t.on_behalf_of)
            .single();
          userId = owner?.id ?? null;
        }
        const accountId = t.source?.virtual_account_id ?? t.source?.bridge_wallet_id;
        if (!userId && accountId) {
          const { data: accRow } = await db
            .schema("public")
            .from("money_accounts")
            .select("user_id")
            .eq("bridge_account_id", accountId)
            .single();
          userId = accRow?.user_id ?? null;
        }

        const { data: existing } = await db
          .schema("public")
          .from("transactions")
          .select("id, user_id")
          .eq("bridge_transfer_id", t.id)
          .single();

        let txRowId: string | null = existing?.id ?? null;
        if (existing) {
          // update in place — user_id stays untouched
          await db
            .schema("public")
            .from("transactions")
            .update({ status, description: t.source?.payment_rail ?? "" })
            .eq("id", existing.id);
        } else if (userId) {
          await db
            .schema("public")
            .from("transactions")
            .upsert(
              {
                user_id: userId, // NOT NULL — insert only when resolved
                bridge_transfer_id: t.id,
                direction: isDeposit ? "in" : "out",
                amount_minor: minorAmount,
                currency,
                status,
                description: t.source?.payment_rail ?? "",
                rail: (t.source?.payment_rail ?? t.destination?.payment_rail ?? "base") as never,
              },
              { onConflict: "bridge_transfer_id" },
            )
            .select("id")
            .single()
            .then(({ data }) => {
              txRowId = data?.id ?? null;
            });
        } else {
          errorNote = `unresolved owner for transfer ${t.id}`;
        }

        // settled incoming payment → settle the owner's oldest open invoice
        // with the exact same amount + currency (pay-the-invoice flow)
        if (
          isDeposit &&
          userId &&
          txRowId &&
          (status === "funds_received" || status === "settled")
        ) {
          const { data: inv } = await db
            .schema("public")
            .from("invoices")
            .select("id")
            .eq("user_id", userId)
            .eq("status", "unpaid")
            .eq("currency", currency)
            .eq("amount_minor", minorAmount)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (inv) {
            await db
              .schema("public")
              .from("invoices")
              .update({ status: "paid", paid_at: new Date().toISOString(), tx_id: txRowId })
              .eq("id", inv.id);
          }
        }
      }
    }
  } catch (e) {
    errorNote = e instanceof Error ? e.message : String(e);
  }

  // audit every verified event, success or not
  await db.from("webhook_events").insert({
    kind: `${kind}/${type}`,
    bridge_event_id: event.event_id ?? null,
    payload: event,
    processed: !errorNote,
    processing_error: errorNote,
  });

  return json({ received: true });
});
