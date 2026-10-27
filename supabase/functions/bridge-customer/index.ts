import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * bridge-customer — onboards the signed-in user with a Bridge KYC link
 * (POST /kyc_links, individual type; Bridge creates the customer and
 * returns its id at link creation) and mirrors the live link state into
 * user_profiles (GET /kyc_links/{id} drives kyc_status + customer_id).
 * Bridge issues exactly ONE kyc link per email per environment, so this
 * endpoint is self-healing: a duplicate-create rejection carries the
 * existing link in its body and it gets adopted (stored + its hosted URL
 * returned) instead of erroring — a user who abandoned Persona mid-flow
 * always reopens their original link, never a dead end. A stored-pointer
 * GET that doesn't resolve falls through to creation and converges the
 * same way. Every success response carries redirect_url. JWT auth.
 * Secrets: BRIDGE_API_KEY · ALLOWED_ORIGINS (optional) · BRIDGE_API_URL
 * (optional, overrides https://api.bridge.xyz/v0).
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
  kyc_link?: string;
  kyc_status?: string;
  customer_id?: string;
};

type DuplicateError = {
  code?: string;
  existing_kyc_link?: LinkResponse;
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

  const persist = (link: LinkResponse) => {
    const kyc = mapKyc(link.kyc_status ?? "not_started");
    return db
      .from("user_profiles")
      .update({
        bridge_kyc_link_id: link.id,
        ...(link.customer_id ? { bridge_customer_id: link.customer_id } : {}),
        kyc_status: kyc,
      })
      .eq("id", user.id)
      .then(() =>
        json(
          {
            kyc_link_id: link.id,
            kyc_status: kyc,
            ...(link.customer_id ? { customer_id: link.customer_id } : {}),
            ...(link.kyc_link ? { redirect_url: link.kyc_link } : {}),
          },
          200,
          cors,
        ),
      );
  };

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
          ...(link.kyc_link ? { redirect_url: link.kyc_link } : {}),
        },
        200,
        cors,
      );
    }
  }

  const fullName =
    String(payload.full_name ?? "").trim() ||
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

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as DuplicateError | null;
    if (err?.code === "duplicate_record" && err.existing_kyc_link?.id) {
      return await persist(err.existing_kyc_link);
    }
    return json({ error: "bridge_error", detail: JSON.stringify(err ?? "unknown") }, 502, cors);
  }

  return await persist((await res.json()) as LinkResponse);
});
