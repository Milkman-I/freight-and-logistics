import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * bridge-webhook — single receiver for all Bridge webhook events
 * (server-to-server: no JWT, no CORS). Bridge signs every payload with the
 * endpoint's RSA key; the signature header is `X-Webhook-Signature:
 * t=<ms>,v0=<b64>` over SHA256(SHA256("{t}.{payload}")) — WebCrypto's
 * RSASSA-PKCS1-v1_5 hashes an already-digested buffer, so the inner digest
 * is what gets verified. The public key comes from bridge_config (written
 * by bridge-accounts on provisioning); unverified or stale events are
 * rejected 401. Mirrors the current flat event schema: customer →
 * kyc_status, kyc_link → kyc + customer id, virtual_account →
 * money_accounts, bridge_wallet → wallet row, transfer → transactions
 * (settled incoming payments auto-match the oldest open invoice of the
 * same amount + currency). Processing is at-least-once: already
 * processed event ids answer 200 without re-running, failures answer
 * 5xx so Bridge redelivers. Every verified event is audited in
 * webhook_events. Secrets: SUPABASE service role (built-ins).
 */

const MAX_SKEW_MS = 600_000;
const DECIMALS: Record<string, number> = { USD: 100, EUR: 100, USDB: 1_000_000 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type CustomerObject = { id?: string; status?: string };
type KycLinkObject = { id?: string; email?: string; kyc_status?: string; customer_id?: string };
type WalletObject = { id?: string; chain?: string; address?: string; customer_id?: string };
type VirtualAccountObject = {
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

const mapKyc = (s: string): string | null => {
  if (s === "approved" || s === "active") return "approved";
  if (["rejected", "offboarded", "retired"].includes(s)) return "rejected";
  if (s === "not_started") return "not_started";
  if (s === "incomplete") return "incomplete";
  if (["under_review", "awaiting_signature", "awaiting_questionnaire", "awaiting_ubo", "paused"].includes(s)) {
    return "under_review";
  }
  return null;
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

const verifySignature = async (
  raw: Uint8Array,
  header: string,
  pem: string,
): Promise<boolean> => {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.trim().split("=", 2) as [string, string]),
  );
  const t = Number(parts.t);
  const sigB64 = parts.v0;
  if (!Number.isFinite(t) || !sigB64 || Math.abs(Date.now() - t) > MAX_SKEW_MS) return false;

  const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "spki",
    bytes(pem.replace(/-----[^\n-]+-----|\s+/g, "")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const payload = new TextDecoder().decode(raw);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${t}.${payload}`),
  );
  return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, cryptoKey, bytes(sigB64), digest);
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: config } = await db
    .schema("public")
    .from("bridge_config")
    .select("webhook_public_key")
    .eq("id", 1)
    .maybeSingle<{ webhook_public_key: string | null }>();
  const pem = config?.webhook_public_key?.trim();
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
  const category = event.event_category ?? "unknown";
  const eventType = event.event_type ?? "";
  const obj = event.event_object ?? {};

  // at-least-once delivery: skip events already fully processed
  if (event.event_id) {
    const { data: seen } = await db
      .from("webhook_events")
      .select("processed")
      .eq("bridge_event_id", event.event_id)
      .maybeSingle<{ processed: boolean }>();
    if (seen?.processed) return json({ received: true, duplicate: true });
  }

  let errorNote: string | null = null;

  try {
    if (category === "customer") {
      const c = obj as CustomerObject;
      const kyc = c.id ? mapKyc(c.status ?? "") : null;
      if (kyc) {
        await db
          .schema("public")
          .from("user_profiles")
          .update({ kyc_status: kyc })
          .eq("bridge_customer_id", c.id!);
      }
    } else if (category === "kyc_link") {
      const link = obj as KycLinkObject;
      const kyc = mapKyc(link.kyc_status ?? "");
      const updates = {
        ...(kyc ? { kyc_status: kyc } : {}),
        ...(link.customer_id ? { bridge_customer_id: link.customer_id } : {}),
      };
      if (Object.keys(updates).length > 0) {
        if (link.id) {
          await db.schema("public").from("user_profiles").update(updates).eq("bridge_kyc_link_id", link.id);
        } else if (link.email) {
          await db.schema("public").from("user_profiles").update(updates).eq("google_email", link.email);
        }
      }
    } else if (category === "virtual_account") {
      const acc = obj as VirtualAccountObject;
      const sdi = acc.source_deposit_instructions ?? {};
      if (acc.customer_id && acc.id) {
        const { data: owner } = await db
          .schema("public")
          .from("user_profiles")
          .select("id")
          .eq("bridge_customer_id", acc.customer_id)
          .single<{ id: string }>();
        if (owner) {
          const isUsd = (sdi.currency ?? "usd").toUpperCase() === "USD";
          await db
            .schema("public")
            .from("money_accounts")
            .upsert(
              {
                user_id: owner.id,
                bridge_account_id: acc.id,
                kind: isUsd ? "us_checking" : "eur_iban",
                currency: isUsd ? "USD" : "EUR",
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
    } else if (category === "bridge_wallet") {
      const w = obj as WalletObject;
      if (w.customer_id && w.id) {
        const { data: owner } = await db
          .schema("public")
          .from("user_profiles")
          .select("id")
          .eq("bridge_customer_id", w.customer_id)
          .single<{ id: string }>();
        if (owner) {
          await db
            .schema("public")
            .from("money_accounts")
            .upsert(
              {
                user_id: owner.id,
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
    } else if (category === "transfer") {
      const t = obj as TransferObject;
      const status = t.id ? mapTransfer(t.state ?? "") : null;
      if (status) {
        const isDeposit = Boolean(t.source?.virtual_account_id || t.source?.external_account_id);
        const currency = (t.currency ?? t.source?.currency ?? t.destination?.currency ?? "usdb").toUpperCase();
        const amountMinor = Math.round(Number(t.amount ?? 0) * (DECIMALS[currency] ?? 1_000_000));
        const rail = (t.source?.payment_rail ?? t.destination?.payment_rail ?? "base").toLowerCase();

        let userId: string | null = null;
        if (t.on_behalf_of) {
          const { data: owner } = await db
            .schema("public")
            .from("user_profiles")
            .select("id")
            .eq("bridge_customer_id", t.on_behalf_of)
            .single<{ id: string }>();
          userId = owner?.id ?? null;
        }
        const accountId = t.source?.virtual_account_id ?? t.source?.bridge_wallet_id ?? null;
        if (!userId && accountId) {
          const { data: accRow } = await db
            .schema("public")
            .from("money_accounts")
            .select("user_id")
            .eq("bridge_account_id", accountId)
            .single<{ user_id: string }>();
          userId = accRow?.user_id ?? null;
        }

        const { data: existing } = await db
          .schema("public")
          .from("transactions")
          .select("id")
          .eq("bridge_transfer_id", t.id!)
          .maybeSingle<{ id: string }>();

        let txRowId: string | null = existing?.id ?? null;
        if (existing) {
          await db
            .schema("public")
            .from("transactions")
            .update({ status })
            .eq("id", existing.id);
        } else if (userId) {
          const inserted = await db
            .schema("public")
            .from("transactions")
            .upsert(
              {
                user_id: userId,
                bridge_transfer_id: t.id!,
                direction: isDeposit ? "in" : "out",
                amount_minor: amountMinor,
                currency,
                rail,
                status,
                description: rail,
                counterparty: t.destination?.to_address ?? "",
              },
              { onConflict: "bridge_transfer_id" },
            )
            .select("id")
            .single<{ id: string }>();
          txRowId = inserted.data?.id ?? null;
        } else {
          errorNote = `unresolved owner for transfer ${t.id}`;
        }

        if (isDeposit && userId && txRowId && (status === "funds_received" || status === "settled")) {
          const { data: invoice } = await db
            .schema("public")
            .from("invoices")
            .select("id")
            .eq("user_id", userId)
            .eq("status", "unpaid")
            .eq("currency", currency)
            .eq("amount_minor", amountMinor)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle<{ id: string }>();
          if (invoice) {
            await db
              .schema("public")
              .from("invoices")
              .update({ status: "paid", paid_at: new Date().toISOString(), tx_id: txRowId })
              .eq("id", invoice.id);
          }
        }
      }
    }
  } catch (e) {
    errorNote = e instanceof Error ? e.message : String(e);
  }

  await db.from("webhook_events").insert({
    kind: `${category}/${eventType}`,
    bridge_event_id: event.event_id ?? null,
    payload: event,
    processed: !errorNote,
    processing_error: errorNote,
  });

  // 5xx makes Bridge redeliver — processing should be retried, not dropped
  if (errorNote) return json({ error: "processing_failed", detail: errorNote }, 500);
  return json({ received: true });
});
