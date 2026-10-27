import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** bridge-customer — onboard the signed-in user via a Bridge KYC link
 *  (current flow: the link creates the customer, approval delivers the id)
 *  and keep kyc_status + bridge_customer_id synced in user_profiles.
 *  JWT auth. Secret: BRIDGE_API_KEY ("sk-test" keys auto-target sandbox). */

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

/** Bridge kyc_link status → F&L app status */
const mapKyc = (s: string) =>
  s === "approved" ? "approved"
  : ["rejected", "offboarded"].includes(s) ? "rejected"
  : s === "not_started" ? "not_started"
  : s === "incomplete" ? "incomplete"
  : "under_review"; // under_review | awaiting_* | paused

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const bridgeKey = Deno.env.get("BRIDGE_API_KEY")?.trim();
  if (!bridgeKey) return json({ error: "bridge_not_configured" }, 500, cors);
  const BRIDGE_API = API_BY_KEY(bridgeKey);
  const auth = (extra: Record<string, string> = {}) => ({
    "Api-Key": bridgeKey, // current Bridge auth scheme (no Basic prefix)
    accept: "application/json",
    ...extra,
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

  const payload = (await req.json().catch(() => ({}))) as {
    full_name?: string;
    first_name?: string;
    last_name?: string;
    redirect_uri?: string;
  };

  const { data: profile } = await db
    .schema("public")
    .from("user_profiles")
    .select("bridge_customer_id, bridge_kyc_link_id, kyc_status, full_name")
    .eq("id", user.id)
    .single<{
      bridge_customer_id: string | null;
      bridge_kyc_link_id: string | null;
      kyc_status: string;
      full_name: string | null;
    }>();

  // already onboarded
  if (profile?.bridge_customer_id) {
    return json(
      { customer_id: profile.bridge_customer_id, existing: true },
      200,
      cors,
    );
  }

  const email = user.email ?? "";

  // resume an existing kyc link — pull fresh state; customer_id may exist
  // at creation time, while approval is tracked separately via kyc_status
  if (profile?.bridge_kyc_link_id) {
    const res = await fetch(`${BRIDGE_API}/kyc_links/${profile.bridge_kyc_link_id}`, {
      headers: auth(),
    });
    if (res.ok) {
      const link = (await res.json()) as {
        kyc_status?: string;
        customer_id?: string;
      };
      const updates: Record<string, string> = {
        kyc_status: mapKyc(link.kyc_status ?? "not_started"),
      };
      if (link.customer_id && !profile.bridge_customer_id) {
        updates.bridge_customer_id = link.customer_id;
      }
      await db.from("user_profiles").update(updates).eq("id", user.id);
      return json(
        {
          kyc_link_id: profile.bridge_kyc_link_id,
          kyc_status: updates.kyc_status,
          ...(updates.bridge_customer_id
            ? { customer_id: updates.bridge_customer_id }
            : {}),
        },
        200,
        cors,
      );
    }
  }

  // create the kyc link (docs schema: full_name + email; customer comes on approval)
  const fullName =
    String(payload.full_name ?? "").trim() ||
    [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim() ||
    (profile?.full_name ?? "").trim() ||
    email.split("@")[0];

  const res = await fetch(`${BRIDGE_API}/kyc_links`, {
    method: "POST",
    headers: auth({ "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() }),
    body: JSON.stringify({
      full_name: fullName,
      email,
      type: "individual",
      ...(payload.redirect_uri ? { redirect_uri: payload.redirect_uri } : {}),
    }),
  });
  if (!res.ok) return json({ error: "bridge_error", detail: await res.text() }, 502, cors);

  const link = (await res.json()) as {
    id: string;
    kyc_status?: string;
    customer_id?: string;
  };
  const kyc = mapKyc(link.kyc_status ?? "not_started");
  await db
    .schema("public")
    .from("user_profiles")
    .update({
      bridge_kyc_link_id: link.id,
      ...(link.customer_id ? { bridge_customer_id: link.customer_id } : {}),
      kyc_status: kyc,
    })
    .eq("id", user.id);

  return json(
    {
      kyc_link_id: link.id,
      kyc_status: kyc,
      ...(link.customer_id ? { customer_id: link.customer_id } : {}),
    },
    200,
    cors,
  );
});
