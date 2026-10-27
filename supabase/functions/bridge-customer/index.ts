import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** bridge-customer — create the signed-in user's Bridge customer and
 *  persist the id to user_profiles.bridge_customer_id (JWT auth).
 *  Secret: BRIDGE_API_KEY */

// env override for sandbox testing: BRIDGE_API_URL=https://api.sandbox.bridge.xyz/v0
const BRIDGE_API = Deno.env.get("BRIDGE_API_URL")?.trim() || "https://api.bridge.xyz/v0";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const bridgeKey = Deno.env.get("BRIDGE_API_KEY")?.trim();
  if (!bridgeKey) return json({ error: "bridge_not_configured" }, 500);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const {
    data: { user },
    error: userErr,
  } = await db.auth.getUser(req.headers.get("Authorization")!.replace("Bearer ", ""));
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  // idempotent: reuse the existing customer instead of creating duplicates
  const { data: profile } = await db
    .schema("public")
    .from("user_profiles")
    .select("bridge_customer_id")
    .eq("id", user.id)
    .single();
  if (profile?.bridge_customer_id) {
    return json({ customer_id: profile.bridge_customer_id, existing: true });
  }

  const payload = await req.json().catch(() => ({}));
  const res = await fetch(`${BRIDGE_API}/customers`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Basic ${btoa(bridgeKey)}`,
    },
    body: JSON.stringify({ email: user.email, type: "standard", ...payload }),
  });

  if (!res.ok) return json({ error: "bridge_error", detail: await res.text() }, 502);
  const customer = await res.json();

  await db
    .schema("public")
    .from("user_profiles")
    .update({ bridge_customer_id: customer.id })
    .eq("id", user.id);

  return json({ customer_id: customer.id, existing: false });
});
