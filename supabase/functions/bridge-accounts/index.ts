import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** bridge-accounts — provision the KYC-approved user's Bridge payment
 *  infrastructure (idempotent): a Base custody wallet (USDB), a USD
 *  virtual account (ACH push/FedNow/Wire deposits → USDC to the wallet)
 *  and a EUR virtual IBAN (SEPA deposits → EURC to the wallet). Also
 *  ensures the Bridge webhook endpoint is registered + active and
 *  returns its RSA public key. JWT auth. Secret: BRIDGE_API_KEY
 *  ("sk-test" keys auto-target the sandbox host). */

const API_BY_KEY = (key: string) =>
  Deno.env.get("BRIDGE_API_URL")?.trim() ||
  (key.startsWith("sk-test")
    ? "https://api.sandbox.bridge.xyz/v0"
    : "https://api.bridge.xyz/v0");

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

type Wallet = { id: string; address?: string; chain?: string };

type VAccount = {
  id: string;
  status?: string;
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

type AccountRow = {
  id: string;
  currency: string;
  kind: string;
  bridge_account_id: string | null;
};

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const bridgeKey = Deno.env.get("BRIDGE_API_KEY")?.trim();
  if (!bridgeKey) return json({ error: "bridge_not_configured" }, 500, cors);
  const BRIDGE_API = API_BY_KEY(bridgeKey);
  const post = (path: string, body: unknown, idem: string) =>
    fetch(`${BRIDGE_API}${path}`, {
      method: "POST",
      headers: {
        "Api-Key": bridgeKey,
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
    .select("bridge_customer_id, kyc_status, full_name")
    .eq("id", user.id)
    .single<{ bridge_customer_id: string | null; kyc_status: string; full_name: string | null }>();
  if (!profile?.bridge_customer_id) {
    return json({ error: "customer_not_registered" }, 428, cors);
  }
  if (profile.kyc_status !== "approved") {
    return json({ error: "kyc_not_approved" }, 403, cors);
  }

  const cid = profile.bridge_customer_id;
  const { data: existing } = await db
    .schema("public")
    .from("money_accounts")
    .select("id, currency, kind, bridge_account_id")
    .eq("user_id", user.id);
  const have = (currency: string, kind: string) =>
    (existing ?? []).some((a: AccountRow) => a.currency === currency && a.kind === kind);
  const upsertRow = (row: Record<string, unknown>) =>
    db.schema("public").from("money_accounts").upsert(row, { onConflict: "bridge_account_id" });

  const short = user.id.slice(0, 8); // deterministic idempotency per user+purpose
  const notes: string[] = [];

  // 1) Base custody wallet — deposits and payouts land here
  let walletAddress: string | null = null;
  const walletRow = (existing ?? []).find((a: AccountRow) => a.kind === "wallet");
  if (!walletRow) {
    const res = await post(`/customers/${cid}/wallets`, { chain: "base" }, `fl-${short}-base-wallet`);
    if (!res.ok) {
      notes.push(`wallet: ${await res.text()}`);
    } else {
      const w = (await res.json()) as Wallet;
      await upsertRow({
        user_id: user.id,
        bridge_account_id: w.id,
        kind: "wallet",
        currency: "USDB",
        wallet_address: w.address ?? null,
        rails: ["base"],
        status: "active",
      });
      walletAddress = w.address ?? null;
    }
  } else {
    walletAddress = null; // filled below from the row when present
  }

  // resolve the wallet address for v-account destinations (fresh row may be ours)
  let destAddress = walletAddress;
  if (!destAddress) {
    const { data: wRow } = await db
      .schema("public")
      .from("money_accounts")
      .select("wallet_address")
      .eq("user_id", user.id)
      .eq("kind", "wallet")
      .maybeSingle<{ wallet_address: string | null }>();
    destAddress = wRow?.wallet_address ?? null;
  }

  // 2) USD virtual account — ACH push / FedNow / Wire deposits
  if (!have("USD", "us_checking") && destAddress) {
    const res = await post(
      `/customers/${cid}/virtual_accounts`,
      {
        developer_fee_percent: "0",
        source: { currency: "usd" },
        destination: { currency: "usdc", payment_rail: "base", address: destAddress },
      },
      `fl-${short}-us-vaccount`,
    );
    if (!res.ok) notes.push(`us_vaccount: ${(await res.text()).slice(0, 220)}`);
  }

  // 3) EUR virtual IBAN — SEPA deposits
  if (!have("EUR", "eur_iban") && destAddress) {
    const res = await post(
      `/customers/${cid}/virtual_accounts`,
      {
        developer_fee_percent: "0",
        source: { currency: "eur" },
        destination: { currency: "eurc", payment_rail: "base", address: destAddress },
      },
      `fl-${short}-eur-viban`,
    );
    if (!res.ok) notes.push(`eur_viban: ${(await res.text()).slice(0, 220)}`);
  }

  // webhook endpoint: register our function URL, activate it, return its public key
  const hookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/bridge-webhook`;
  const categories = [
    "customer",
    "kyc_link",
    "transfer",
    "virtual_account",
    "virtual_account.activity",
    "bridge_wallet.activity",
  ];
  let webhook: { id: string; url: string; status: string; public_key?: string | null } | null = null;
  const listRes = await fetch(`${BRIDGE_API}/webhooks`, {
    headers: { "Api-Key": bridgeKey, accept: "application/json" },
  });
  const list = ((await listRes.json().catch(() => null)) ?? {}) as { data?: { id: string; url: string }[] };
  const found = (list.data ?? []).find((w) => w.url === hookUrl);
  const activate = async (id: string) => {
    const res = await fetch(`${BRIDGE_API}/webhooks/${id}`, {
      method: "PUT",
      headers: { "Api-Key": bridgeKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ url: hookUrl, status: "active", event_categories: categories }),
    });
    if (!res.ok) {
      notes.push(`webhook_activate: ${(await res.text()).slice(0, 220)}`);
      return null;
    }
    return (await res.json()) as { id: string; url: string; status: string; public_key?: string };
  };
  if (found) {
    webhook = await activate(found.id);
  } else {
    const res = await post(
      "/webhooks",
      { url: hookUrl, event_epoch: "webhook_creation", event_categories: categories },
      `fl-${short}-webhook-endpoint`,
    );
    if (!res.ok) {
      notes.push(`webhook_create: ${(await res.text()).slice(0, 220)}`);
    } else {
      const created = (await res.json()) as { id: string; url: string };
      webhook = await activate(created.id);
    }
  }

  // persist the endpoint's public key — bridge-webhook verifies against it
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

  return json(
    { accounts: accounts ?? [], wallet_address: destAddress, webhook, notes },
    200,
    cors,
  );
});
