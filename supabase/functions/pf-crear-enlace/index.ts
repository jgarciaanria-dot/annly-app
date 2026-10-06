// =========================================================
// Supabase Edge Function: pf-crear-enlace  (Annly · Agenda y Tiendas)
//
// El dueño de un negocio toca "Pagar mi mensualidad" (o "Agregar" un módulo adicional). Esta función:
//   1. Confirma que quien llama es dueño del negocio (o Platform Admin).
//   2. Calcula EN EL SERVIDOR el monto: la mensualidad (plan + módulos + extras activos) o, si llega
//      `modulo`, el precio completo de ese módulo adicional (no aplica en prueba gratis).
//   3. Registra el pago (pagos_plataforma, estado 'pendiente').
//   4. Pide a PagueloFácil un enlace único (LinkDeamon) con la referencia ANNLY-<id>.
//   5. Devuelve la URL para mandar al cliente a pagar.
// El módulo se activa cuando pf-webhook confirma el pago.
//
// "Verify JWT" APAGADO: con las llaves nuevas de Supabase la verificación del portero rechaza
// la llamada. La seguridad está adentro: con la sesión del usuario se comprueba que sea dueño
// del negocio (RLS de subscriptions); si no lo es, responde 403 y no crea ningún cobro.
// Secretos: PF_CCLW (código web), PF_AMBIENTE ('produccion' | 'pruebas').
// =========================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CCLW = Deno.env.get("PF_CCLW") || "";
const PRUEBAS = (Deno.env.get("PF_AMBIENTE") || "produccion") === "pruebas";
const PF_LINK = PRUEBAS ? "https://sandbox.paguelofacil.com/LinkDeamon.cfm" : "https://secure.paguelofacil.com/LinkDeamon.cfm";

// A dónde puede volver el cliente al pagar (evita que alguien use la función para redirigir a otro sitio).
// Producción, dev y los deploys de Vercel de los proyectos de Annly (no cualquier *.vercel.app).
const ORIGENES = [
  /^https:\/\/annly\.app$/, /^https:\/\/dev\.annly\.app$/,
  /^https:\/\/pedidos\.annly\.app$/, /^https:\/\/dev-pedidos\.annly\.app$/,
  /^https:\/\/tienda\.annly\.app$/,
  /^https:\/\/annly-(app|pedidos)[a-z0-9-]*\.vercel\.app$/,
];

// CORS: se aceptan los encabezados que pida el navegador (la librería de Supabase agrega algunos nuevos)
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
const hex = (t: string) => Array.from(new TextEncoder().encode(t)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
const r2 = (n: number) => Math.round(n * 100) / 100;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

Deno.serve(async (req) => {
  CORS = corsPara(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp({ ok: true, funcion: "pf-crear-enlace", ambiente: PRUEBAS ? "pruebas" : "produccion", nota: "Responde. Se usa con POST desde el panel." });
  try {
    if (!CCLW) return resp({ error: "Falta configurar PF_CCLW en los secretos de Supabase." }, 500);
    const { negocioId, origen, volverA, modulo, extra } = await req.json();
    if (!negocioId) return resp({ error: "Falta el negocio." }, 400);
    const base = String(volverA || "").replace(/\/+$/, "");
    if (!ORIGENES.some((r) => r.test(base))) return resp({ error: "Dirección de retorno no permitida." }, 400);

    // 1) Con la sesión del usuario: si RLS le deja ver la suscripción, es dueño (o Platform Admin)
    const sbUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: sub } = await sbUsuario.from("subscriptions")
      .select("id, status, current_period_end, plans(code, name, monthly_price)")
      .eq("business_id", negocioId).neq("status", "cancelled")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub) return resp({ error: "No tienes permiso para pagar este plan, o el negocio no tiene plan." }, 403);

    const sb = createClient(URL_SB, SERVICE);
    const { data: negocio } = await sb.from("businesses").select("nombre").eq("id", negocioId).maybeSingle();
    const esPedidos = origen === "pedidos";

    const hoy = new Date().toISOString().slice(0, 10);
    let detalle: any[] = [];
    let monto = 0;
    let concepto = "";
    let conceptoCode = "MENSUALIDAD";

    if (modulo) {
      // 2) Módulo adicional: precio completo del catálogo (features), calculado aquí. En prueba gratis no se cobra.
      if ((sub as any).status === "trial") return resp({ error: "En tu prueba gratis el módulo se activa sin cobro." }, 400);
      const codigo = String(modulo).toUpperCase();
      if (["PROFESIONAL_ADICIONAL", "SUCURSAL_ADICIONAL", "AGENTE_AI"].includes(codigo)) return resp({ error: "Ese módulo no se paga desde aquí." }, 400);
      const { data: f } = await sb.from("features").select("code, name, monthly_price")
        .eq("code", codigo).eq("is_addon", true).eq("is_active", true).eq("producto", esPedidos ? "pedidos" : "agenda").maybeSingle();
      if (!f) return resp({ error: "Módulo no disponible." }, 400);
      const { data: ya } = await sb.from("subscription_items").select("cancela_el")
        .eq("subscription_id", sub.id).eq("item_type", "addon").eq("item_code", codigo).eq("is_active", true);
      if ((ya || []).some((r: any) => !r.cancela_el || r.cancela_el >= hoy)) return resp({ error: "Ese módulo ya está activo." }, 400);
      monto = r2(Number(f.monthly_price) || 0);
      if (monto < 1) return resp({ error: "Ese módulo no tiene costo." }, 400);
      concepto = `Módulo ${f.name}`;
      conceptoCode = "MODULO:" + codigo;
      detalle = [{ tipo: "modulo", code: codigo, nombre: f.name, monto, subscription_id: sub.id }];
    } else if (extra) {
      // 2) Extra por cantidad (profesional o sede adicional): 1 unidad al precio del catálogo. No aplica en prueba gratis.
      if (esPedidos) return resp({ error: "Ese extra no está disponible aquí." }, 400);
      if ((sub as any).status === "trial") return resp({ error: "Podrás agregar extras cuando termine tu prueba." }, 400);
      const codigo = String(extra).toUpperCase();
      if (!["PROFESIONAL_ADICIONAL", "SUCURSAL_ADICIONAL"].includes(codigo)) return resp({ error: "Extra no válido." }, 400);
      const { data: f } = await sb.from("features").select("code, name, monthly_price").eq("code", codigo).eq("is_active", true).maybeSingle();
      if (!f) return resp({ error: "Extra no disponible." }, 400);
      monto = r2(Number(f.monthly_price) || 0);
      if (monto < 1) return resp({ error: "Ese extra no tiene precio configurado." }, 400);
      concepto = codigo === "PROFESIONAL_ADICIONAL" ? "Profesional adicional" : "Sede adicional";
      conceptoCode = "EXTRA:" + codigo;
      detalle = [{ tipo: "extra", code: codigo, nombre: concepto, monto, subscription_id: sub.id }];
    } else {
      // 2) Monto del mes, calculado aquí
      const plan = (sub as any).plans || {};
      const { data: items } = await sb.from("subscription_items")
        .select("item_code, description, unit_price, quantity, cancela_el")
        .eq("subscription_id", sub.id).eq("is_active", true);
      detalle = [{ code: plan.code, nombre: "Plan " + (plan.name || plan.code), monto: r2(Number(plan.monthly_price) || 0) }];
      for (const it of items || []) {
        if (it.cancela_el && it.cancela_el < hoy) continue;
        const m = r2((Number(it.unit_price) || 0) * (Number(it.quantity) || 1));
        if (m > 0) detalle.push({ code: it.item_code, nombre: (it.description || it.item_code) + ((Number(it.quantity) || 1) > 1 ? " × " + it.quantity : ""), monto: m });
      }
      monto = r2(detalle.reduce((s, d) => s + d.monto, 0));
      if (monto < 1) return resp({ error: "No hay nada que cobrar este mes." }, 400);

      // Mes que se paga: el del vencimiento actual (o este mes si ya venció).
      // current_period_end puede venir con hora ("2026-10-15T05:00:00+00:00"): se usa solo la fecha.
      const vence = sub.current_period_end ? String(sub.current_period_end).slice(0, 10) : "";
      const desde = vence && vence > hoy ? new Date(vence + "T12:00:00") : new Date();
      concepto = `Mensualidad ${MESES[desde.getMonth()]} ${desde.getFullYear()}`;
    }

    // Si ya hay un enlace del mismo monto creado hace menos de 50 min y sin usar, se reutiliza
    const hace50 = new Date(Date.now() - 50 * 60 * 1000).toISOString();
    const { data: previo } = await sb.from("pagos_plataforma").select("id, enlace_url")
      .eq("business_id", negocioId).eq("estado", "pendiente").eq("monto", monto).eq("concepto", concepto).gte("creado_en", hace50)
      .not("enlace_url", "is", null).order("creado_en", { ascending: false }).limit(1).maybeSingle();
    if (previo?.enlace_url) return resp({ url: previo.enlace_url, pagoId: previo.id, monto, concepto });

    // 3) Registrar el pago
    const { data: pago, error: errP } = await sb.from("pagos_plataforma").insert([{
      business_id: negocioId, concepto_code: conceptoCode, concepto, monto, estado: "pendiente",
      origen: esPedidos ? "pedidos" : "agenda", detalle, volver_a: base,
    }]).select("id").single();
    if (errP) throw errP;

    // 4) Enlace único en PagueloFácil
    const ref = "ANNLY-" + pago.id;
    const descripcion = `Annly ${concepto} - ${negocio?.nombre || "Negocio"} - ${ref}`.slice(0, 150);
    const form = new URLSearchParams({
      CCLW, CMTN: monto.toFixed(2), CDSC: descripcion,
      RETURN_URL: hex(`${base}/pago.html?id=${pago.id}`),
      PARM_1: pago.id, EXPIRES_IN: "3600",
      CARD_TYPE: "CARD", // solo tarjeta de crédito o débito
    });
    const r = await fetch(PF_LINK, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "*/*" }, body: form.toString() });
    const texto = await r.text();
    let json: any = null; try { json = JSON.parse(texto); } catch (_) { /* respuesta no JSON */ }
    const url = json?.data?.url;
    if (!url) {
      await sb.from("pagos_plataforma").update({ estado: "rechazado", nota: "PagueloFácil no devolvió enlace: " + texto.slice(0, 300) }).eq("id", pago.id);
      return resp({ error: "PagueloFácil no pudo crear el enlace de pago. Intenta en unos minutos." }, 502);
    }
    await sb.from("pagos_plataforma").update({ enlace_url: url }).eq("id", pago.id);

    // 5) Listo
    return resp({ url, pagoId: pago.id, monto, concepto });
  } catch (e) {
    console.error("pf-crear-enlace:", e);
    return resp({ error: "No se pudo preparar el pago." }, 500);
  }
});
