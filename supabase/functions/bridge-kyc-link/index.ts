import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** bridge-kyc-link — return the hosted KYC URL for the user's Bridge
 *  customer (JWT auth; bridge-customer must have run first).
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

  const { data: profile } = await db
    .schema("public")
    .from("user_profiles")
    .select("bridge_customer_id")
    .eq("id", user.id)
    .single();
  if (!profile?.bridge_customer_id) return json({ error: "no_customer_yet" }, 409);

  const body: { redirect_uri?: string } = await req.json().catch(() => ({}));
  const res = await fetch(`${BRIDGE_API}/kyc_links`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Basic ${btoa(bridgeKey)}`,
    },
    body: JSON.stringify({
      customer_id: profile.bridge_customer_id,
      type: "individual",
      // client sends its origin's /kyc/done; dev fallback otherwise
      redirect_uri: body.redirect_uri ?? "http://localhost:5173/kyc/done",
    }),
  });

  if (!res.ok) return json({ error: "bridge_error", detail: await res.text() }, 502);
  const link = await res.json();

  await db
    .schema("public")
    .from("user_profiles")
    .update({ kyc_status: "under_review" })
    .eq("id", user.id);

  return json({ kyc_link_id: link.id, redirect_url: link.redirect_url, status: link.status });
});
