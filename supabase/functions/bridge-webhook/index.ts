import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** bridge-webhook — sole receiver for ALL Bridge events. No JWT (Bridge
 *  has none); auth via the x-webhook-secret header; always 200s quickly
 *  so Bridge never retry-storms. Audit-first: every raw event is upserted
 *  into webhook_events with a computed bridge_event_id (dedupes their
 *  at-least-once retries) before any control flow. Transfer rows are
 *  INSERTed only when an owner is resolved; user_id is never overwritten
 *  on UPDATE. Secret: BRIDGE_WEBHOOK_SECRET */

type Customer = { id: string; status: string };
type VirtualAccount = {
  id: string;
  customer_id?: string;
  currency?: string;
  bank_routing_number?: string;
  bank_account_number?: string;
  iban?: string;
  rails?: string[];
};
type Transfer = {
  id: string;
  state?: string;
  amount?: string | number;
  currency?: string;
  description?: string;
  developer_deposit_id?: string;
  in_favor_of_customer_id?: string;
  virtual_account_id?: string;
  transfer_intention_type?: string;
};

const DECIMALS: Record<string, number> = { USD: 100, EUR: 100, USDB: 1_000_000 };
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-webhook-secret",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

/** Bridge customer status → F&L kyc_status */
function mapKyc(status: string): string | null {
  const map: Record<string, string> = {
    not_started: "not_started",
    incomplete: "incomplete",
    awaiting_signature: "under_review",
    under_review: "under_review",
    active: "approved",
    rejected: "rejected",
    retired: "rejected",
  };
  return map[status] ?? null;
}

/** Bridge transfer state → F&L money lifecycle (mirrors create-transfer) */
function mapTransfer(state: string, inferredIn: boolean): string | null {
  const s = state ?? "";
  if (["awaiting_funds", "awaiting_total_funding"].includes(s)) return "awaiting_funds";
  if (["funds_arriving", "funds_entering"].includes(s)) return "funds_arriving";
  if (["created", "pending", "processing"].includes(s)) return "pending";
  if (["funds_received", "settled", "cleared"].includes(s))
    return inferredIn ? "funds_received" : "settled";
  if (["failed", "canceled", "returned", "refund_requested", "refunded", "expired"].includes(s))
    return "failed";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("BRIDGE_WEBHOOK_SECRET");
  if (!secret) return json({ error: "bridge_not_configured" }, 500);
  if (req.headers.get("x-webhook-secret") !== secret) return json({ error: "unauthorized" }, 401);

  const event = await req.json().catch(() => null);
  if (!event) return json({ error: "bad_payload" }, 400);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // bypasses RLS by design
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const kind: string = event.kind ?? `${event.object}/${event.event}`;
  const data = event.data ?? {};

  // computed dedup id when Bridge doesn't send one
  const eventId: string =
    typeof event.id === "string" && event.id
      ? event.id
      : `${kind}:${(data as { id?: string }).id ?? "none"}:${(data as { state?: string; status?: string }).state ?? (data as { status?: string }).status ?? ""}`;
  let errorNote: string | null = null;

  try {
    if (kind.startsWith("customer/")) {
      // scoped by bridge_customer_id — never an open update
      const c = data as Customer;
      const kyc = mapKyc(c.status);
      if (kyc && c.id) {
        await db
          .schema("public")
          .from("user_profiles")
          .update({ kyc_status: kyc })
          .eq("bridge_customer_id", c.id);
      }
    } else if (kind.startsWith("virtual_account/")) {
      const acc = data as VirtualAccount;
      if (acc.customer_id) {
        const { data: profile } = await db
          .schema("public")
          .from("user_profiles")
          .select("id")
          .eq("bridge_customer_id", acc.customer_id)
          .single();
        if (profile) {
          const usd = acc.currency === "usd";
          await db
            .schema("public")
            .from("money_accounts")
            .upsert(
              {
                user_id: profile.id,
                bridge_account_id: acc.id,
                kind: usd ? "us_checking" : acc.currency === "eur" ? "eur_iban" : "wallet",
                currency: usd ? "USD" : acc.currency === "eur" ? "EUR" : "USDB",
                routing_number: acc.bank_routing_number ?? null,
                account_number: acc.bank_account_number ?? null,
                iban: acc.iban ?? null,
                rails: acc.rails ?? [],
                status: "active",
              },
              { onConflict: "bridge_account_id" },
            );
        }
      }
    } else if (kind.startsWith("transfer/")) {
      const t = data as Transfer;
      const inferredIn = Boolean(t.in_favor_of_customer_id || t.virtual_account_id);
      const status = mapTransfer(t.state!, inferredIn);
      if (status && t.id) {
        const currency = t.currency === "eur" ? "EUR" : t.currency === "usd" ? "USD" : "USDB";

        // resolve owner: customer → developer deposit → virtual account
        let userId: string | null = null;
        const ownerCheck = t.in_favor_of_customer_id ?? t.developer_deposit_id;
        if (ownerCheck) {
          const { data: owner } = await db
            .schema("public")
            .from("user_profiles")
            .select("id")
            .eq("bridge_customer_id", ownerCheck)
            .single();
          userId = owner?.id ?? null;
        }
        if (!userId && t.virtual_account_id) {
          const { data: accRow } = await db
            .schema("public")
            .from("money_accounts")
            .select("user_id")
            .eq("bridge_account_id", t.virtual_account_id)
            .single();
          userId = accRow?.user_id ?? null;
        }

        const { data: existing } = await db
          .schema("public")
          .from("transactions")
          .select("id, user_id")
          .eq("bridge_transfer_id", t.id)
          .single();

        const decimals = DECIMALS[currency] ?? 1_000_000;
        const minorAmount = Math.round(Number(t.amount ?? 0) * decimals);
        let txRowId: string | null = existing?.id ?? null;
        if (existing) {
          // update in place — user_id stays untouched
          await db
            .schema("public")
            .from("transactions")
            .update({ status, description: t.description ?? "" })
            .eq("id", existing.id);
        } else if (userId) {
          await db
            .schema("public")
            .from("transactions")
            .upsert(
              {
                user_id: userId, // NOT NULL — insert only when resolved
                bridge_transfer_id: t.id,
                direction: inferredIn ? "in" : "out",
                amount_minor: minorAmount,
                currency,
                status,
                description: t.description ?? "",
                rail: t.transfer_intention_type ?? "base",
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
          inferredIn &&
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
    } else {
      console.log("unhandled webhook kind:", kind);
    }
  } catch (e) {
    errorNote = String(e); // still 200 below so Bridge doesn't retry-storm
  }

  // audit trail, regardless of handler success
  try {
    const { error } = await db
      .schema("public")
      .from("webhook_events")
      .upsert(
        {
          kind,
          bridge_event_id: eventId,
          payload: event,
          processed: errorNote === null,
          processing_error: errorNote,
        },
        { onConflict: "bridge_event_id" },
      );
    if (error) console.error("webhook_events write failed:", error);
  } catch (e) {
    console.error("webhook_events write raised:", e);
  }

  return json({ received: true });
});
