import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * bridge-customer — onboards the signed-in user with a Bridge KYC link
 * (POST /kyc_links, individual type; Bridge creates the customer and
 * returns its id at link creation) and mirrors the live link state into
 * user_profiles (GET /kyc_links/{id} drives kyc_status + customer_id).
 * JWT auth. Secrets: BRIDGE_API_KEY · ALLOWED_ORIGINS (optional) ·
 * BRIDGE_API_URL (optional, overrides https://api.bridge.xyz/v0).
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

const mapKyc = (s: string): string =>
  s === "approved" || s === "active"
    ? "approved"
    : ["rejected", "offboarded", "retired"].includes(s)
    ? "rejected"
    : s === "not_started"
    ? "not_started"
    : s === "incomplete"
    ? "incomplete"
    : "under_review";

type LinkResponse = {
  id: string;
  kyc_status?: string;
  customer_id?: string;
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

  const email = user.email ?? "";

  if (profile?.bridge_kyc_link_id) {
    const res = await fetch(`${API_URL}/kyc_links/${profile.bridge_kyc_link_id}`, {
      headers: { "Api-Key": key, accept: "application/json" },
    });
    if (res.ok) {
      const link = (await res.json()) as LinkResponse;
      const kyc = mapKyc(link.kyc_status ?? "not_started");
      const changed =
        kyc !== profile.kyc_status ||
        (Boolean(link.customer_id) && link.customer_id !== profile.bridge_customer_id);
      if (changed) {
        await db
          .from("user_profiles")
          .update({
            kyc_status: kyc,
            ...(link.customer_id ? { bridge_customer_id: link.customer_id } : {}),
          })
          .eq("id", user.id);
      }
      return json(
        {
          kyc_link_id: profile.bridge_kyc_link_id,
          kyc_status: kyc,
          customer_id: link.customer_id ?? profile.bridge_customer_id,
        },
        200,
        cors,
      );
    }
  }

  if (profile?.bridge_customer_id) {
    return json({ customer_id: profile.bridge_customer_id, kyc_status: profile.kyc_status }, 200, cors);
  }

  const fullName =
    String(payload.full_name ?? "").trim() ||
    [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim() ||
    (profile?.full_name ?? "").trim() ||
    email.split("@")[0];

  const res = await fetch(`${API_URL}/kyc_links`, {
    method: "POST",
    headers: {
      "Api-Key": key,
      "Idempotency-Key": crypto.randomUUID(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      full_name: fullName,
      email,
      type: "individual",
      ...(payload.redirect_uri ? { redirect_uri: payload.redirect_uri } : {}),
    }),
  });
  if (!res.ok) return json({ error: "bridge_error", detail: await res.text() }, 502, cors);

  const link = (await res.json()) as LinkResponse;
  const kyc = mapKyc(link.kyc_status ?? "not_started");
  await db
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
