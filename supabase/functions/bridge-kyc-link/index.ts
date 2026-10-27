import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** bridge-kyc-link — return the hosted KYC URL for the user's Bridge
 *  kyc link (JWT auth; bridge-customer must have run first — it creates
 *  the link and stores its id). Secret: BRIDGE_API_KEY ("sk-test" keys
 *  auto-target the sandbox host). */

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

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const bridgeKey = Deno.env.get("BRIDGE_API_KEY")?.trim();
  if (!bridgeKey) return json({ error: "bridge_not_configured" }, 500, cors);
  const BRIDGE_API = API_BY_KEY(bridgeKey);

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

  await req.json().catch(() => ({})); // drain body (client sends redirect_uri)
  const res = await fetch(`${BRIDGE_API}/kyc_links/${profile.bridge_kyc_link_id}`, {
    headers: {
      "Api-Key": bridgeKey, // current Bridge auth scheme
      accept: "application/json",
    },
  });
  if (!res.ok) return json({ error: "bridge_error", detail: await res.text() }, 502, cors);

  const link = (await res.json()) as { id: string; kyc_link?: string; kyc_status?: string };

  return json(
    {
      kyc_link_id: link.id,
      redirect_url: link.kyc_link,
      status: link.kyc_status ?? "not_started",
    },
    200,
    cors,
  );
});
