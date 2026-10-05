// =========================================================
// Supabase Edge Function: yappy-ipn  (Annly · Agenda y Tiendas)
//
// Yappy avisa aquí (ipnUrl) cuando una orden termina. Si el aviso:
//   - trae una firma (hash) válida, calculada con nuestra clave secreta de Yappy,
//   - corresponde a una orden nuestra (pagos_plataforma.referencia = 'YAPPY:<orderId>'),
//   - y dice que fue ejecutada (status = E),
// se marca el pago como confirmado. Si es MENSUALIDAD, el plan queda pagado un mes más
// (misma regla que pf-webhook). Si es un módulo adicional (concepto_code 'MODULO:<code>'), lo activa. R / C / X (rechazada, cancelada, expirada) → 'rechazado'.
// El monto es el que se pidió al crear la orden (el aviso no trae monto).
//
// "Verify JWT" APAGADO (quien llama es Yappy). La seguridad es la firma: sin hash válido no se hace nada.
// Secretos: YAPPY_CLAVE_SECRETA (la clave secreta del botón, tal como la da Yappy Comercial),
//           (un botón por app) YAPPY_CLAVE_SECRETA_AGENDA / YAPPY_CLAVE_SECRETA_PEDIDOS con sus dominios
//           YAPPY_DOMAIN_AGENDA / YAPPY_DOMAIN_PEDIDOS. YAPPY_CLAVE_SECRETA y YAPPY_DOMAIN sirven de respaldo.
//
// Formato del aviso (manual del Botón de Pago, sección IPN): GET a <ipnUrl>?orderId=..&hash=..&status=..&domain=..
//   hash = HMAC-SHA256( orderId + status + domain , secreto ) en hex, donde
//   secreto = parte antes del primer "." de base64decode(YAPPY_CLAVE_SECRETA).
//   status: E ejecutado · R rechazado · C cancelado · X expirado.
// =========================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const env = (k: string) => Deno.env.get(k) || "";
const norm = (d: string) => d.trim().toLowerCase().replace(/\/+$/, "");
// Un botón por app: cada uno con su dominio y su clave secreta
const BOTONES = [
  { dominio: env("YAPPY_DOMAIN_AGENDA"), clave: env("YAPPY_CLAVE_SECRETA_AGENDA") },
  { dominio: env("YAPPY_DOMAIN_PEDIDOS"), clave: env("YAPPY_CLAVE_SECRETA_PEDIDOS") },
  { dominio: env("YAPPY_DOMAIN"), clave: env("YAPPY_CLAVE_SECRETA") },
].filter((b) => b.dominio && b.clave);
const ok = (obj: unknown) => new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });

function masUnMes(iso: string) {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  const dia = d.getDate();
  d.setMonth(d.getMonth() + 1);
  if (d.getDate() < dia) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

// Secreto de firma: parte antes del primer "." de la clave secreta decodificada de base64
function secreto(clave: string): string {
  try { return atob(clave.trim()).split(".")[0]; } catch (_) { return ""; }
}
async function hmacHex(secreto: string, mensaje: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const f = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(mensaje));
  return Array.from(new Uint8Array(f)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function igual(a: string, b: string) { // comparación sin cortar al primer error
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// La firma solo vale si el dominio del aviso es el de un botón nuestro y se firmó con la clave de ESE botón
async function firmaValida(orderId: string, status: string, domain: string, hash: string) {
  for (const b of BOTONES) {
    if (norm(b.dominio) !== norm(domain)) continue;
    const sec = secreto(b.clave);
    if (sec && igual(await hmacHex(sec, orderId + status + domain), hash.toLowerCase())) return true;
  }
  return false;
}

// El aviso puede venir en la URL (GET) o en el cuerpo (POST JSON o formulario)
async function leerAviso(req: Request): Promise<Record<string, string>> {
  const o: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((v, k) => { o[k] = v; });
  if (req.method === "POST") {
    const t = await req.text();
    try { Object.assign(o, JSON.parse(t)); } catch (_) { new URLSearchParams(t).forEach((v, k) => { o[k] = v; }); }
  }
  return o;
}

// Módulo adicional pagado: se agrega a la suscripción (si no estaba ya vigente)
async function activarModulo(pago: any): Promise<string | null> {
  const mod = Array.isArray(pago.detalle) ? pago.detalle.find((d: any) => d && d.tipo === "modulo") : null;
  if (!mod || !mod.code || !mod.subscription_id) return "Pago de módulo sin datos del módulo";
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: ya, error: errYa } = await sb.from("subscription_items").select("cancela_el")
    .eq("subscription_id", mod.subscription_id).eq("item_type", "addon").eq("item_code", mod.code).eq("is_active", true);
  if (errYa) return errYa.message;
  if ((ya || []).some((r: any) => !r.cancela_el || r.cancela_el >= hoy)) return null; // ya estaba activo
  const { error } = await sb.from("subscription_items").insert([{
    subscription_id: mod.subscription_id, item_type: "addon", item_code: mod.code,
    description: mod.nombre || mod.code, quantity: 1, unit_price: Number(mod.monto) || Number(pago.monto), is_active: true,
  }]);
  return error ? error.message : null;
}

async function aRevision(id: string, nota: string, extra: Record<string, unknown> = {}) {
  const { error } = await sb.from("pagos_plataforma").update({ estado: "revisar", nota, ...extra }).eq("id", id);
  if (error) console.error("yappy-ipn: no se pudo pasar a revisión", id, error);
}

Deno.serve(async (req) => {
  try {
    if (!BOTONES.length) { console.error("yappy-ipn: faltan los secretos de Yappy (clave y dominio)"); return new Response("Sin configurar", { status: 500 }); }
    const a = await leerAviso(req);
    const orderId = String(a.orderId || "");
    const status = String(a.status || "").toUpperCase();
    const domain = String(a.domain || "");
    const hash = String(a.hash || "");
    console.log("yappy-ipn aviso:", JSON.stringify({ orderId, status, domain, tieneHash: !!hash }));

    if (!orderId || !status || !hash || !(await firmaValida(orderId, String(a.status || ""), domain, hash))) {
      console.warn("yappy-ipn: firma inválida o aviso incompleto");
      return new Response("No autorizado", { status: 401 });
    }

    const { data: pago, error: errPago } = await sb.from("pagos_plataforma").select("*").eq("referencia", "YAPPY:" + orderId).maybeSingle();
    if (errPago) throw errPago;
    if (!pago) return ok({ ignorado: true, motivo: "orden no encontrada" });
    if (pago.estado === "confirmado") return ok({ yaConfirmado: true }); // avisos repetidos

    if (status !== "E") {
      if (["R", "C", "X"].includes(status)) {
        const { error } = await sb.from("pagos_plataforma").update({
          estado: "rechazado", pf_respuesta: a, resuelto_en: new Date().toISOString(),
          nota: "Yappy: " + ({ R: "rechazada", C: "cancelada", X: "expirada" } as Record<string, string>)[status],
        }).eq("id", pago.id).neq("estado", "confirmado");
        if (error) throw error;
        return ok({ rechazado: true });
      }
      return ok({ ignorado: true, motivo: "status " + status });
    }

    const esMensualidad = String(pago.concepto_code || "").toUpperCase() === "MENSUALIDAD";
    let sub: { id: string; current_period_end: string | null } | null = null;
    let hasta: string | null = null;
    if (esMensualidad) {
      const { data, error } = await sb.from("subscriptions").select("id, current_period_end")
        .eq("business_id", pago.business_id).not("status", "in", "(cancelled,canceled)")
        .order("current_period_end", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      if (error || !data) {
        await aRevision(pago.id, "Pago aprobado en Yappy, pero no se encontró la suscripción del negocio" + (error ? ": " + error.message : ""),
          { monto_pagado: pago.monto, pf_respuesta: a });
        return ok({ revisar: true, motivo: "sin suscripción" });
      }
      sub = data;
      const hoy = new Date().toISOString().slice(0, 10);
      const vence = sub.current_period_end ? String(sub.current_period_end).slice(0, 10) : "";
      hasta = masUnMes(vence && vence > hoy ? vence : hoy);
    }

    // 1) Se "toma" el pago: solo un aviso puede pasarlo a confirmado
    const { data: tomado, error: errTomar } = await sb.from("pagos_plataforma").update({
      estado: "confirmado", monto_pagado: pago.monto, pf_respuesta: a,
      periodo_hasta: hasta, resuelto_en: new Date().toISOString(),
    }).eq("id", pago.id).neq("estado", "confirmado").select("id");
    if (errTomar) throw errTomar;
    if (!tomado || !tomado.length) return ok({ yaConfirmado: true });

    // 2a) Módulo adicional: queda activo
    if (String(pago.concepto_code || "").startsWith("MODULO:")) {
      const errMod = await activarModulo(pago);
      if (errMod) {
        console.error("yappy-ipn: pago de módulo confirmado pero no se activó", pago.id, errMod);
        await aRevision(pago.id, "Pago confirmado, pero no se pudo activar el módulo: " + errMod);
        return ok({ revisar: true, motivo: "módulo no activado" });
      }
      return ok({ confirmado: true, modulo: true });
    }

    // 2) Mensualidad: el plan queda pagado un mes más
    if (sub && hasta) {
      const { error: errSub } = await sb.from("subscriptions")
        .update({ status: "active", current_period_end: hasta }).eq("id", sub.id);
      if (errSub) {
        console.error("yappy-ipn: pago confirmado pero no se actualizó la suscripción", pago.id, errSub);
        await aRevision(pago.id, "Pago confirmado, pero no se pudo extender el plan: " + errSub.message);
        return ok({ revisar: true, motivo: "suscripción no actualizada" });
      }
    }
    return ok({ confirmado: true, hasta });
  } catch (e) {
    console.error("yappy-ipn:", e);
    return ok({ error: String(e) });
  }
});
