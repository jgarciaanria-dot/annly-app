// =========================================================
// Supabase Edge Function: yappy-pedido  (Annly · Tiendas)
//
// El cliente de una tienda toca el botón oficial de Yappy. Esta función:
//   1. Lee el pedido en la base y obtiene EL MONTO de ahí (abono o total). El navegador solo manda el id del pedido.
//   2. Comprueba que la tienda tenga el módulo "Pagos en línea" y sus credenciales de Yappy Comercial activas.
//   3. Valida el comercio en Yappy y crea la orden (con el aviso apuntando a yappy-ipn-pedidos).
//   4. Registra la orden en yappy_orders (tipo 'pedido', ref_id = id del pedido).
//   5. Devuelve { ok, transactionId, token, documentName, orderId } para btn-yappy.eventPayment().
//
// El pedido NO se confirma aquí ni en el navegador: lo confirma yappy-ipn-pedidos cuando Yappy avisa.
// "Verify JWT" APAGADO (compra un visitante sin sesión). Seguridad: el id del pedido es un uuid y el monto sale de la base.
// Deploy: supabase functions deploy yappy-pedido --no-verify-jwt
// =========================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const YAPPY_API = Deno.env.get("YAPPY_API_BASE") || "https://apipagosbg.bgeneral.cloud";
// Dirección del aviso de Yappy. El panel de Supabase puede darle otro nombre a la función al crearla desde el editor:
// en ese caso se define el secreto YAPPY_IPN_PEDIDOS_URL con su dirección completa.
const IPN_URL = Deno.env.get("YAPPY_IPN_PEDIDOS_URL") || `${URL_SB}/functions/v1/yappy-ipn-pedidos`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Mensajes para el cliente (sin detalles internos)
const fallo = (error: string, status = 400) => resp({ ok: false, error }, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fallo("Método no permitido", 405);
  try {
    const { orderId, aliasYappy: aliasRaw } = await req.json();
    const pedido = String(orderId || "").trim();
    const alias = String(aliasRaw || "").replace(/\D/g, "");
    if (!UUID.test(pedido)) return fallo("Pedido no válido.");
    if (alias.length < 7 || alias.length > 11) return fallo("Ingresa tu número Yappy (8 dígitos, sin +507).");

    // 1) El monto lo dice la base
    const { data: info, error: errMonto } = await sb.rpc("pedido_yappy_monto", { p_order: pedido });
    if (errMonto || !info) {
      const m = String(errMonto?.message || "");
      return fallo(/no está pendiente|venció|no existe|pago pendiente/i.test(m) ? m.replace(/^.*?: /, "") : "No se pudo preparar el pago de este pedido.");
    }
    const businessId = String(info.businessId);
    const monto = Number(info.monto);

    // 2) Módulo y credenciales de ESTA tienda
    const { data: modulo } = await sb.rpc("pedido_modulo_activo", { p_business: businessId, p_code: "PEDIDOS_PAGOS" });
    if (!modulo) return fallo("Esta tienda todavía no recibe pagos en línea.", 403);
    const { data: cred } = await sb.from("yappy_credentials")
      .select("merchant_id, secret_b64, dominio_registrado, activo").eq("business_id", businessId).maybeSingle();
    if (!cred || !cred.activo) return fallo("Esta tienda todavía no recibe pagos en línea.", 403);

    // 3) Yappy: validar el comercio y crear la orden
    const vResp = await fetch(`${YAPPY_API}/payments/validate/merchant`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId: cred.merchant_id, urlDomain: cred.dominio_registrado }),
    });
    const v = await vResp.json();
    if (!v?.body?.token) { console.error("yappy-pedido: no se validó el comercio", JSON.stringify(v)); return fallo("No se pudo conectar con Yappy. Intenta de nuevo o paga por otro medio.", 502); }

    // id de la orden en Yappy: único y de hasta 15 caracteres
    const yappyOrder = "P" + Date.now().toString().slice(-10) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    const oResp = await fetch(`${YAPPY_API}/payments/payment-wc`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: v.body.token },
      body: JSON.stringify({
        merchantId: cred.merchant_id, orderId: yappyOrder, domain: cred.dominio_registrado,
        paymentDate: String(v.body.epochTime), aliasYappy: alias, ipnUrl: IPN_URL,
        discount: "0.00", taxes: "0.00", subtotal: monto.toFixed(2), total: monto.toFixed(2),
      }),
    });
    const o = await oResp.json();
    if (!o?.body?.token) {
      console.error("yappy-pedido: no se creó la orden", JSON.stringify(o));
      const codigo = String(o?.status?.code || o?.body?.code || "");
      return fallo(codigo === "E005" ? "Ese número no está registrado en Yappy." : "No se pudo crear la orden de pago. Intenta de nuevo.", 502);
    }

    // 4) Se registra para poder reconocer el aviso de Yappy
    const { error: errIns } = await sb.from("yappy_orders").insert([{
      business_id: businessId, order_id: yappyOrder, tipo: "pedido", ref_id: pedido, total: monto, estado: "pendiente",
    }]);
    if (errIns) { console.error("yappy-pedido: no se registró la orden", errIns); return fallo("No se pudo registrar el pago. Intenta de nuevo.", 500); }

    return resp({ ok: true, transactionId: o.body.transactionId, token: o.body.token, documentName: o.body.documentName, orderId: yappyOrder });
  } catch (e) {
    console.error("yappy-pedido:", e);
    return fallo("Error inesperado. Intenta de nuevo.", 500);
  }
});
