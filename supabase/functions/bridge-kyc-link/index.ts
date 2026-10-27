import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * bridge-kyc-link — returns the hosted verification URL (kyc_link) and the
 * live status of the signed-in user's stored Bridge KYC link. bridge-customer
 * must have run first (it creates the link and stores its id). JWT auth.
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

type LinkResponse = {
  id: string;
  kyc_link?: string;
  kyc_status?: string;
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

  const { data: profile } = await db
    .schema("public")
    .from("user_profiles")
    .select("bridge_kyc_link_id")
    .eq("id", user.id)
    .single<{ bridge_kyc_link_id: string | null }>();
  if (!profile?.bridge_kyc_link_id) {
    return json({ error: "no_customer_yet" }, 409, cors);
  }

  const res = await fetch(`${API_URL}/kyc_links/${profile.bridge_kyc_link_id}`, {
    headers: { "Api-Key": key, accept: "application/json" },
  });
  if (!res.ok) return json({ error: "bridge_error", detail: await res.text() }, 502, cors);

  const link = (await res.json()) as LinkResponse;
  return json(
    {
      kyc_link_id: link.id,
      redirect_url: link.kyc_link ?? null,
      status: link.kyc_status ?? "not_started",
    },
    200,
    cors,
  );
});
