import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * bridge-accounts — provisions the KYC-approved user's Bridge payment
 * infrastructure (idempotent): a Base custody wallet (USDB), a USD virtual
 * account (ACH push/FedNow/Wire deposits → USDC to the wallet) and a EUR
 * virtual IBAN (SEPA deposits → EURC). Deposit instructions are mirrored
 * into money_accounts directly from the API responses; a mirror row
 * missing the data it mirrors is dropped and re-provisioned (the stable
 * idempotency keys replay Bridge's last good response). Also registers +
 * activates the Bridge webhook endpoint and persists its RSA public key in
 * bridge_config. JWT auth. Secrets: BRIDGE_API_KEY · ALLOWED_ORIGINS
 * (optional) · BRIDGE_API_URL (optional, overrides api.bridge.xyz/v0).
 */

const API_URL =
  Deno.env.get("BRIDGE_API_URL")?.trim() || "https://api.bridge.xyz/v0";

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

type Wallet = {
  id: string;
  address?: string;
  chain?: string;
};

type DepositInstructions = {
  bank_name?: string;
  bank_beneficiary_name?: string;
  account_holder_name?: string;
  bank_account_number?: string;
  bank_routing_number?: string;
  iban?: string;
};

type VirtualAccount = {
  id: string;
  status?: string;
  source_deposit_instructions?: DepositInstructions;
  destination?: { address?: string; currency?: string; payment_rail?: string };
};

type AccountRow = {
  id: string;
  currency: string;
  kind: string;
  bridge_account_id: string | null;
  wallet_address: string | null;
  account_number: string | null;
  iban: string | null;
};

type WebhookEndpoint = {
  id: string;
  url: string;
  status: string;
  public_key?: string | null;
};

const WEBHOOK_CATEGORIES = [
  "customer",
  "kyc_link",
  "transfer",
  "virtual_account",
  "virtual_account.activity",
  "bridge_wallet.activity",
];

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const key = Deno.env.get("BRIDGE_API_KEY")?.trim();
  if (!key) return json({ error: "bridge_not_configured" }, 500, cors);

  const get = (path: string) =>
    fetch(`${API_URL}${path}`, {
      headers: { "Api-Key": key, accept: "application/json" },
    });

  const post = (path: string, body: unknown, idem: string) =>
    fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "Api-Key": key,
        "Idempotency-Key": idem,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });

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

  const { data: profile } = await db
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

  const cid = profile.bridge_customer_id;
  const notes: string[] = [];

  const { data: existing } = await db
    .schema("public")
    .from("money_accounts")
    .select("id, currency, kind, bridge_account_id, wallet_address, account_number, iban")
    .eq("user_id", user.id);
  let rows = (existing ?? []) as AccountRow[];

  const empty = rows.filter((a) =>
    a.kind === "wallet"
      ? !a.wallet_address
      : a.currency === "USD"
      ? !a.account_number
      : a.currency === "EUR"
      ? !a.iban
      : false,
  );
  if (empty.length > 0) {
    await db.from("money_accounts").delete().in("id", empty.map((a) => a.id));
    rows = rows.filter((a) => !empty.includes(a));
  }

  const upsertRow = (row: Record<string, unknown>) =>
    db.schema("public").from("money_accounts").upsert(row, { onConflict: "bridge_account_id" });
  const idemFor = (purpose: string) => `fl-${user.id.slice(0, 8)}-${purpose}`;

  if (!rows.some((a) => a.kind === "wallet")) {
    const res = await post(`/customers/${cid}/wallets`, { chain: "base" }, idemFor("base-wallet"));
    if (!res.ok) {
      notes.push(`wallet: ${(await res.text()).slice(0, 220)}`);
    } else {
      const w = (await res.json()) as Wallet;
      await upsertRow({
        user_id: user.id,
        bridge_account_id: w.id,
        kind: "wallet",
        currency: "USDB",
        wallet_address: w.address ?? null,
        rails: [w.chain ?? "base"],
        status: "active",
      });
    }
  }

  const { data: walletRow } = await db
    .schema("public")
    .from("money_accounts")
    .select("wallet_address")
    .eq("user_id", user.id)
    .eq("kind", "wallet")
    .maybeSingle<{ wallet_address: string | null }>();
  const walletAddress = walletRow?.wallet_address ?? null;

  if (!rows.some((a) => a.currency === "USD" && a.kind === "us_checking") && walletAddress) {
    const res = await post(
      `/customers/${cid}/virtual_accounts`,
      {
        developer_fee_percent: "0",
        source: { currency: "usd" },
        destination: { currency: "usdc", payment_rail: "base", address: walletAddress },
      },
      idemFor("us-vaccount"),
    );
    if (!res.ok) {
      notes.push(`us_vaccount: ${(await res.text()).slice(0, 220)}`);
    } else {
      const va = (await res.json()) as VirtualAccount;
      const sdi = va.source_deposit_instructions ?? {};
      await upsertRow({
        user_id: user.id,
        bridge_account_id: va.id,
        kind: "us_checking",
        currency: "USD",
        routing_number: sdi.bank_routing_number ?? null,
        account_number: sdi.bank_account_number ?? null,
        iban: sdi.iban ?? null,
        bank_name: sdi.bank_name ?? null,
        beneficiary_name: sdi.bank_beneficiary_name ?? sdi.account_holder_name ?? null,
        wallet_address: va.destination?.address ?? null,
        rails: sdi.payment_rails ?? ["ach_push", "fednow", "wire"],
        status: va.status === "deactivated" ? "failed" : "active",
      });
    }
  }

  if (!rows.some((a) => a.currency === "EUR" && a.kind === "eur_iban") && walletAddress) {
    const res = await post(
      `/customers/${cid}/virtual_accounts`,
      {
        developer_fee_percent: "0",
        source: { currency: "eur" },
        destination: { currency: "eurc", payment_rail: "base", address: walletAddress },
      },
      idemFor("eur-viban"),
    );
    if (!res.ok) {
      notes.push(`eur_viban: ${(await res.text()).slice(0, 220)}`);
    } else {
      const va = (await res.json()) as VirtualAccount;
      const sdi = va.source_deposit_instructions ?? {};
      await upsertRow({
        user_id: user.id,
        bridge_account_id: va.id,
        kind: "eur_iban",
        currency: "EUR",
        routing_number: sdi.bank_routing_number ?? null,
        account_number: sdi.bank_account_number ?? null,
        iban: sdi.iban ?? null,
        bank_name: sdi.bank_name ?? null,
        beneficiary_name: sdi.bank_beneficiary_name ?? sdi.account_holder_name ?? null,
        wallet_address: va.destination?.address ?? null,
        rails: sdi.payment_rails ?? ["sepa"],
        status: va.status === "deactivated" ? "failed" : "active",
      });
    }
  }

  const hookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/bridge-webhook`;
  const listRes = await get("/webhooks");
  const list = ((await listRes.json().catch(() => null)) ?? {}) as {
    data?: { id: string; url: string }[];
  };
  const found = (list.data ?? []).find((w) => w.url === hookUrl);

  let webhook: WebhookEndpoint | null = null;
  if (found) {
    const res = await fetch(`${API_URL}/webhooks/${found.id}`, {
      method: "PUT",
      headers: { "Api-Key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        url: hookUrl,
        status: "active",
        event_categories: WEBHOOK_CATEGORIES,
      }),
    });
    if (res.ok) webhook = (await res.json()) as WebhookEndpoint;
  } else {
    const res = await post(
      "/webhooks",
      { url: hookUrl, event_epoch: "webhook_creation", event_categories: WEBHOOK_CATEGORIES },
      idemFor("webhook-endpoint"),
    );
    if (!res.ok) {
      notes.push(`webhook: ${(await res.text()).slice(0, 220)}`);
    } else {
      const created = (await res.json()) as { id: string };
      const active = await fetch(`${API_URL}/webhooks/${created.id}`, {
        method: "PUT",
        headers: { "Api-Key": key, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          url: hookUrl,
          status: "active",
          event_categories: WEBHOOK_CATEGORIES,
        }),
      });
      if (active.ok) webhook = (await active.json()) as WebhookEndpoint;
    }
  }

  if (webhook && !webhook.public_key) {
    const read = await get(`/webhooks/${webhook.id}`);
    if (read.ok) webhook = (await read.json()) as WebhookEndpoint;
  }

  if (webhook?.public_key) {
    await db.from("bridge_config").upsert(
      {
        id: 1,
        webhook_public_key: webhook.public_key,
        webhook_endpoint_id: webhook.id,
        webhook_url: hookUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  }

  const { data: accounts } = await db
    .schema("public")
    .from("money_accounts")
    .select("*")
    .eq("user_id", user.id);

  return json({ accounts: accounts ?? [], wallet_address: walletAddress, webhook, notes }, 200, cors);
});
