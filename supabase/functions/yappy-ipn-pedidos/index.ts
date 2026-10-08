// =========================================================
// Supabase Edge Function: yappy-ipn-pedidos  (Annly · Tiendas)
//
// Yappy avisa aquí (GET ?orderId&status&domain&hash) cuando termina el pago de un pedido de una tienda.
//   - La firma (hash) se calcula con el Secret DE ESA TIENDA: sin firma válida no pasa nada.
//   - Si el pago fue ejecutado (E), el pedido pasa a CONFIRMADO en la base (pedido_pagado_yappy), una sola vez.
//   - R / C / X (rechazado, cancelado, expirado) solo quedan anotados; el pedido sigue pendiente hasta que venza.
//   hash = HMAC-SHA256( orderId + status + domain , secreto ) en hex; secreto = parte antes del primer "." de base64decode(secret).
// "Verify JWT" APAGADO (quien llama es Yappy). Deploy: supabase functions deploy yappy-ipn-pedidos --no-verify-jwt
// =========================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ESTADOS: Record<string, string> = { E: "ejecutado", R: "rechazado", C: "cancelado", X: "expirado" };
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

async function hmacHex(secreto: string, mensaje: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const f = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(mensaje));
  return Array.from(new Uint8Array(f)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function igual(a: string, b: string) { // sin cortar al primer error
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function leerAviso(req: Request): Promise<Record<string, string>> {
  const o: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((v, k) => { o[k] = v; });
  if (req.method === "POST") {
    const t = await req.text();
    try { Object.assign(o, JSON.parse(t)); } catch (_) { new URLSearchParams(t).forEach((v, k) => { o[k] = v; }); }
  }
  return o;
}

Deno.serve(async (req) => {
  try {
    const a = await leerAviso(req);
    const orderId = String(a.orderId || "");
    const status = String(a.status || "");
    const domain = String(a.domain || "");
    const hash = String(a.hash || "").toLowerCase();
    if (!orderId || !status || !hash) return json({ success: false }, 400);

    const { data: orden } = await sb.from("yappy_orders").select("business_id, ref_id, tipo, estado").eq("order_id", orderId).eq("tipo", "pedido").maybeSingle();
    if (!orden) return json({ success: false }, 404);
    const { data: cred } = await sb.from("yappy_credentials").select("secret_b64, dominio_registrado").eq("business_id", orden.business_id).maybeSingle();
    if (!cred || !cred.secret_b64) return json({ success: false }, 404);

    let secreto = "";
    try { secreto = atob(String(cred.secret_b64).trim()).split(".")[0]; } catch (_) { /* queda vacío */ }
    const esperado = secreto ? await hmacHex(secreto, orderId + status + domain) : "";
    if (!secreto || !igual(esperado, hash)) {
      console.error("yappy-ipn-pedidos: firma inválida", orderId);
      return json({ success: false }, 401);
    }

    const estado = ESTADOS[status.toUpperCase()] || status;
    if (status.toUpperCase() === "E") {
      // Una orden ya ejecutada no vuelve atrás por un aviso repetido
      const { data: r, error } = await sb.rpc("pedido_pagado_yappy", { p_order: orden.ref_id, p_yappy_order: orderId });
      if (error) {
        // Yappy cobró pero la base no pudo marcar el pedido: se anota para que la tienda no espere y el negocio lo revise
        console.error("yappy-ipn-pedidos: no se pudo confirmar el pedido", orden.ref_id, error);
        await sb.from("yappy_orders").update({ estado: "revisar" }).eq("order_id", orderId);
        return json({ success: false }, 500);
      }
      await sb.from("yappy_orders").update({ estado: "ejecutado" }).eq("order_id", orderId);
      return json({ success: true, pedido: r });
    }
    if (orden.estado !== "ejecutado") await sb.from("yappy_orders").update({ estado }).eq("order_id", orderId);
    return json({ success: true });
  } catch (e) {
    console.error("yappy-ipn-pedidos:", e);
    return json({ success: false }, 500);
  }
});
