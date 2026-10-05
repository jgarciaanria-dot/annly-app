// =========================================================
// Supabase Edge Function: yappy-crear-orden  (Annly · Agenda y Tiendas)
//
// El dueño de un negocio toca el botón de Yappy en "Mi plan". Esta función:
//   1. Confirma que quien llama es dueño del negocio (o Platform Admin).
//   2. Calcula EN EL SERVIDOR el monto del mes (igual que pf-crear-enlace).
//   3. Registra el pago (pagos_plataforma, estado 'pendiente', referencia 'YAPPY:<orderId>').
//   4. Valida el comercio en Yappy y crea la orden (payments/validate/merchant + payments/payment-wc).
//   5. Devuelve { body: { transactionId, documentName, token } } para btn-yappy.eventPayment().
//
// La confirmación del pago NO se hace aquí ni en el navegador: la hace el aviso IPN de Yappy.
// "Verify JWT" APAGADO (igual que pf-crear-enlace): la seguridad está adentro, con la sesión del usuario.
// Secretos (un botón de Yappy por app): YAPPY_MERCHANT_ID_AGENDA / YAPPY_MERCHANT_ID_PEDIDOS,
//           YAPPY_DOMAIN_AGENDA / YAPPY_DOMAIN_PEDIDOS, YAPPY_AMBIENTE ('produccion' | 'pruebas').
//           (YAPPY_MERCHANT_ID y YAPPY_DOMAIN sirven de respaldo si ambas apps comparten botón.)
// =========================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRUEBAS = (Deno.env.get("YAPPY_AMBIENTE") || "produccion") === "pruebas";
const YAPPY_API = PRUEBAS ? "https://api-comecom-uat.yappycloud.com" : "https://apipagosbg.bgeneral.cloud";
const IPN_URL = `${URL_SB}/functions/v1/yappy-ipn`;

// Mismos orígenes permitidos que pf-crear-enlace
const ORIGENES = [
  /^https:\/\/annly\.app$/, /^https:\/\/dev\.annly\.app$/,
  /^https:\/\/pedidos\.annly\.app$/, /^https:\/\/dev-pedidos\.annly\.app$/,
  /^https:\/\/tienda\.annly\.app$/,
  /^https:\/\/annly-(app|pedidos)[a-z0-9-]*\.vercel\.app$/,
];

// Catálogo de errores de Yappy (manual del Botón de Pago)
const ERRORES: Record<string, string> = {
  E002: "Algo salió mal. Intenta nuevamente.",
  E005: "Este número no está registrado en Yappy.",
  E006: "Algo salió mal. Intenta nuevamente.",
  E007: "El pedido ya ha sido registrado.",
  E008: "Algo salió mal. Intenta nuevamente.",
  E009: "ID de la orden mayor a 15 dígitos.",
  E010: "El valor de los montos no es el correcto.",
  E011: "Error en los campos de URL.",
  E012: "Algo salió mal. Intenta nuevamente.",
  E100: "Bad Request.",
};

let CORS: Record<string, string> = {};
function corsPara(req: Request) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
    "Access-Control-Allow-Headers": req.headers.get("access-control-request-headers") || "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const resp = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const r2 = (n: number) => Math.round(n * 100) / 100;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Yappy pide un orderId alfanumérico de 1 a 15 caracteres
function nuevoOrderId() {
  const b = crypto.getRandomValues(new Uint8Array(14));
  return "Y" + Array.from(b).map((x) => (x % 36).toString(36)).join("").toUpperCase();
}
// Número Yappy: 8 dígitos panameños, sin +507
function limpiarAlias(t: unknown) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("507")) d = d.slice(3);
  return /^[0-9]{8}$/.test(d) ? d : "";
}
async function postYappy(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = token;
  const r = await fetch(YAPPY_API + path, { method: "POST", headers, body: JSON.stringify(body) });
  const texto = await r.text();
  let json: any = null; try { json = JSON.parse(texto); } catch (_) { /* no JSON */ }
  return { ok: r.ok, json, texto };
}

Deno.serve(async (req) => {
  CORS = corsPara(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp({ ok: true, funcion: "yappy-crear-orden", ambiente: PRUEBAS ? "pruebas" : "produccion" });
  try {
    const { negocioId, origen, volverA, aliasYappy } = await req.json();
    if (!negocioId) return resp({ error: "Falta el negocio." }, 400);
    const base = String(volverA || "").replace(/\/+$/, "");
    if (!ORIGENES.some((r) => r.test(base))) return resp({ error: "Dirección de retorno no permitida." }, 400);
    const alias = limpiarAlias(aliasYappy);
    if (!alias) return resp({ error: "Ingresa tu número Yappy (8 dígitos, sin +507).", code: "ALIAS" }, 400);

    // Botón de Yappy de cada app: ID de comercio y dominio configurados en Yappy Comercial (deben coincidir exacto)
    const esPedidos = origen === "pedidos";
    const MERCHANT_ID = (esPedidos ? Deno.env.get("YAPPY_MERCHANT_ID_PEDIDOS") : Deno.env.get("YAPPY_MERCHANT_ID_AGENDA")) || Deno.env.get("YAPPY_MERCHANT_ID") || "";
    if (!MERCHANT_ID) return resp({ error: "Falta configurar el ID de comercio de Yappy en los secretos de Supabase." }, 500);
    const domain = (esPedidos ? Deno.env.get("YAPPY_DOMAIN_PEDIDOS") : Deno.env.get("YAPPY_DOMAIN_AGENDA")) || Deno.env.get("YAPPY_DOMAIN") || "";
    if (!domain) return resp({ error: "Falta configurar el dominio de Yappy en los secretos de Supabase." }, 500);

    // 1) Con la sesión del usuario: si RLS le deja ver la suscripción, es dueño (o Platform Admin)
    const sbUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: sub } = await sbUsuario.from("subscriptions")
      .select("id, status, current_period_end, plans(code, name, monthly_price)")
      .eq("business_id", negocioId).neq("status", "cancelled")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub) return resp({ error: "No tienes permiso para pagar este plan, o el negocio no tiene plan." }, 403);

    const sb = createClient(URL_SB, SERVICE);

    // 2) Monto del mes, calculado aquí (misma regla que pf-crear-enlace)
    const plan = (sub as any).plans || {};
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: items } = await sb.from("subscription_items")
      .select("item_code, description, unit_price, quantity, cancela_el")
      .eq("subscription_id", sub.id).eq("is_active", true);
    const detalle = [{ code: plan.code, nombre: "Plan " + (plan.name || plan.code), monto: r2(Number(plan.monthly_price) || 0) }];
    for (const it of items || []) {
      if (it.cancela_el && it.cancela_el < hoy) continue;
      const m = r2((Number(it.unit_price) || 0) * (Number(it.quantity) || 1));
      if (m > 0) detalle.push({ code: it.item_code, nombre: (it.description || it.item_code) + ((Number(it.quantity) || 1) > 1 ? " × " + it.quantity : ""), monto: m });
    }
    const monto = r2(detalle.reduce((s, d) => s + d.monto, 0));
    if (monto < 1) return resp({ error: "No hay nada que cobrar este mes." }, 400);

    const vence = sub.current_period_end ? String(sub.current_period_end).slice(0, 10) : "";
    const desde = vence && vence > hoy ? new Date(vence + "T12:00:00") : new Date();
    const concepto = `Mensualidad ${MESES[desde.getMonth()]} ${desde.getFullYear()}`;

    // 3) Registrar el pago (pendiente). Cada intento lleva su propio orderId: Yappy rechaza repetidos (E007).
    const orderId = nuevoOrderId();
    const { data: pago, error: errP } = await sb.from("pagos_plataforma").insert([{
      business_id: negocioId, concepto_code: "MENSUALIDAD", concepto, monto, estado: "pendiente",
      origen: esPedidos ? "pedidos" : "agenda", detalle, volver_a: base, referencia: "YAPPY:" + orderId,
    }]).select("id").single();
    if (errP) throw errP;
    const rechazar = (nota: string) => sb.from("pagos_plataforma").update({ estado: "rechazado", nota: nota.slice(0, 300) }).eq("id", pago.id);

    // 4a) Validar el comercio y obtener el token de sesión
    const v = await postYappy("/payments/validate/merchant", { merchantId: MERCHANT_ID, urlDomain: domain });
    const tokenSesion = v.json?.body?.token;
    if (!tokenSesion) {
      console.error("yappy validate:", v.texto.slice(0, 400));
      await rechazar("Yappy no validó el comercio: " + v.texto);
      return resp({ error: "No se pudo conectar con Yappy. Intenta en unos minutos." }, 502);
    }

    // 4b) Crear la orden
    const total = monto.toFixed(2);
    const o = await postYappy("/payments/payment-wc", {
      merchantId: MERCHANT_ID, orderId, domain, paymentDate: Math.floor(Date.now() / 1000),
      aliasYappy: alias, ipnUrl: IPN_URL,
      discount: "0.00", taxes: "0.00", subtotal: total, total,
    }, tokenSesion);
    const b = o.json?.body;
    if (!b?.transactionId || !b?.documentName || !b?.token) {
      const code = String(o.json?.status?.code || "");
      console.error("yappy payment-wc:", o.texto.slice(0, 400));
      await rechazar("Yappy no creó la orden: " + o.texto);
      return resp({ error: ERRORES[code] || "No se pudo crear la orden de pago. Intenta de nuevo.", code }, 502);
    }

    // 5) Listo: el botón abre el pago en la app Yappy. La confirmación llega después por el IPN.
    return resp({ body: { transactionId: b.transactionId, documentName: b.documentName, token: b.token }, pagoId: pago.id, monto, concepto });
  } catch (e) {
    console.error("yappy-crear-orden:", e);
    return resp({ error: "No se pudo preparar el pago." }, 500);
  }
});
