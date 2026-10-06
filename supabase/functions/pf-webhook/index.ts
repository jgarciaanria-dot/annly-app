// =========================================================
// Supabase Edge Function: pf-webhook  (Annly · Agenda y Tiendas)
//
// PagueloFácil avisa aquí cada transacción. Si el pago:
//   - trae nuestra referencia ANNLY-<id> en la descripción,
//   - está aprobado (status = 1) y es un cobro real (AUTH_CAPTURE, CAPTURE o RECURRENT),
//   - y el monto coincide con lo que pedimos,
// se marca el pago como confirmado. Si es una MENSUALIDAD, el plan queda pagado un mes
// más (estado 'active'). Si es un MÓDULO adicional (concepto_code 'MODULO:<code>'), el módulo
// queda activo en la suscripción. Cualquier otro concepto (profesional o sucursal adicional)
// se confirma sin tocar la fecha del plan.
// Si algo no cuadra, el pago queda en 'revisar' para que Annly lo vea.
//
// "Verify JWT" APAGADO (quien llama es PagueloFácil).
// Seguridad: la URL que se le da a PagueloFácil lleva una clave: .../pf-webhook?k=<PF_WEBHOOK_KEY>
// Secretos: PF_WEBHOOK_KEY.
// =========================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CLAVE = Deno.env.get("PF_WEBHOOK_KEY") || "";
const COBROS = ["AUTH_CAPTURE", "CAPTURE", "RECURRENT"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (obj: unknown) => new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });

// Suma un mes a una fecha ISO (YYYY-MM-DD)
function masUnMes(iso: string) {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  const dia = d.getDate();
  d.setMonth(d.getMonth() + 1);
  if (d.getDate() < dia) d.setDate(0); // 31 ene + 1 mes = 28/29 feb
  return d.toISOString().slice(0, 10);
}

// El aviso puede venir como JSON o como formulario
async function leerAviso(req: Request): Promise<Record<string, any>> {
  const texto = await req.text();
  try { return JSON.parse(texto); } catch (_) { /* no es JSON */ }
  const p = new URLSearchParams(texto);
  const o: Record<string, any> = {};
  p.forEach((v, k) => { o[k] = v; });
  return o;
}

// Deja el pago en revisión con el motivo (lo ve Annly en el panel)
async function aRevision(id: string, nota: string, extra: Record<string, unknown> = {}) {
  const { error } = await sb.from("pagos_plataforma").update({ estado: "revisar", nota, ...extra }).eq("id", id);
  if (error) console.error("pf-webhook: no se pudo pasar a revisión", id, error);
}

// Módulo adicional pagado: se agrega a la suscripción (si no estaba ya vigente). Devuelve el error o null.
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

// Cambio de plan pagado: el plan de la suscripción pasa al nuevo y se desactivan los módulos que ya vienen incluidos en él
// (para no cobrarlos dos veces). Devuelve el error o null.
async function activarPlan(pago: any): Promise<string | null> {
  const pl = Array.isArray(pago.detalle) ? pago.detalle.find((d: any) => d && d.tipo === "plan") : null;
  if (!pl || !pl.plan_id || !pl.subscription_id) return "Pago de plan sin datos del plan";
  const { error } = await sb.from("subscriptions").update({ plan_id: pl.plan_id }).eq("id", pl.subscription_id);
  if (error) return error.message;
  const { data: incl } = await sb.from("plan_features").select("features(code)").eq("plan_id", pl.plan_id);
  const codigos = (incl || []).map((r: any) => r.features && r.features.code).filter(Boolean);
  if (codigos.length) {
    const { error: errItems } = await sb.from("subscription_items").update({ is_active: false })
      .eq("subscription_id", pl.subscription_id).eq("item_type", "addon").eq("is_active", true).in("item_code", codigos);
    if (errItems) console.error("No se pudieron desactivar los módulos ya incluidos en el plan nuevo:", errItems);
  }
  return null;
}

// Extra por cantidad pagado (profesional o sede adicional): se suma 1 unidad a la suscripción. Devuelve el error o null.
async function activarExtra(pago: any): Promise<string | null> {
  const ex = Array.isArray(pago.detalle) ? pago.detalle.find((d: any) => d && d.tipo === "extra") : null;
  if (!ex || !ex.code || !ex.subscription_id) return "Pago de extra sin datos del extra";
  const { error } = await sb.from("subscription_items").insert([{
    subscription_id: ex.subscription_id, item_type: "addon", item_code: ex.code,
    description: ex.nombre || ex.code, quantity: 1, unit_price: Number(ex.monto) || Number(pago.monto), is_active: true,
  }]);
  return error ? error.message : null;
}

Deno.serve(async (req) => {
  try {
    if (!CLAVE || new URL(req.url).searchParams.get("k") !== CLAVE) {
      console.warn("pf-webhook: llamada sin clave válida");
      return new Response("No autorizado", { status: 401 });
    }
    const a = await leerAviso(req);
    const texto = JSON.stringify(a);

    // Nuestra referencia viaja en la descripción (o en PARM_1)
    const m = texto.match(/ANNLY-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const pagoId = (m && m[1]) || (UUID.test(String(a.PARM_1 || "")) ? String(a.PARM_1) : null);
    if (!pagoId) return ok({ ignorado: true, motivo: "sin referencia Annly" });

    const { data: pago, error: errPago } = await sb.from("pagos_plataforma").select("*").eq("id", pagoId).maybeSingle();
    if (errPago) throw errPago;
    if (!pago) return ok({ ignorado: true, motivo: "pago no encontrado" });
    if (pago.estado === "confirmado") return ok({ yaConfirmado: true }); // avisos repetidos

    const status = Number(a.status ?? (String(a.Estado || "").toLowerCase().startsWith("aprob") ? 1 : 0));
    const tipo = String(a.operationType || "AUTH_CAPTURE").toUpperCase();
    const pagado = Number(a.totalPay ?? a.TotalPagado ?? 0);
    const codOper = a.codOper || a.Oper || null;

    // Aún no es un cobro (pre-autorización, 3DS) → se espera el aviso siguiente
    if (!COBROS.includes(tipo)) return ok({ ignorado: true, motivo: "operación " + tipo });

    if (status !== 1) {
      const { error } = await sb.from("pagos_plataforma").update({
        estado: "rechazado", referencia: codOper, pf_respuesta: a, resuelto_en: new Date().toISOString(),
        nota: "PagueloFácil: " + (a.messageSys || a.Razon || "pago no aprobado"),
      }).eq("id", pago.id).neq("estado", "confirmado");
      if (error) throw error;
      return ok({ rechazado: true });
    }

    // Aprobado pero el monto no cuadra → a revisión de Annly
    if (Math.abs(pagado - Number(pago.monto)) > 0.01) {
      await aRevision(pago.id, `Monto distinto: se pidió ${pago.monto} y se pagó ${pagado}`,
        { referencia: codOper, monto_pagado: pagado, pf_respuesta: a });
      return ok({ revisar: true });
    }

    // Solo la mensualidad mueve la fecha del plan (pf-crear-enlace la marca con concepto_code)
    const esMensualidad = pago.concepto_code
      ? String(pago.concepto_code).toUpperCase() === "MENSUALIDAD"
      : /^mensualidad/i.test(String(pago.concepto || ""));
    const esModulo = String(pago.concepto_code || "").startsWith("MODULO:");

    // La suscripción vigente: la de vencimiento más lejano que no esté cancelada
    let sub: { id: string; current_period_end: string | null } | null = null;
    let hasta: string | null = null;
    if (esMensualidad) {
      const { data, error } = await sb.from("subscriptions").select("id, current_period_end")
        .eq("business_id", pago.business_id).not("status", "in", "(cancelled,canceled)")
        .order("current_period_end", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      if (error || !data) {
        await aRevision(pago.id, "Pago aprobado, pero no se encontró la suscripción del negocio" + (error ? ": " + error.message : ""),
          { referencia: codOper, monto_pagado: pagado, pf_respuesta: a });
        return ok({ revisar: true, motivo: "sin suscripción" });
      }
      sub = data;
      const hoy = new Date().toISOString().slice(0, 10);
      const vence = sub.current_period_end ? String(sub.current_period_end).slice(0, 10) : "";
      hasta = masUnMes(vence && vence > hoy ? vence : hoy);
    }

    // 1) Se "toma" el pago: solo un aviso puede pasarlo a confirmado (si llegan 2 a la vez,
    //    el segundo no encuentra nada que actualizar y no suma otro mes)
    const { data: tomado, error: errTomar } = await sb.from("pagos_plataforma").update({
      estado: "confirmado", referencia: codOper, monto_pagado: pagado, pf_respuesta: a,
      periodo_hasta: hasta, resuelto_en: new Date().toISOString(),
    }).eq("id", pago.id).neq("estado", "confirmado").select("id");
    if (errTomar) throw errTomar;
    if (!tomado || !tomado.length) return ok({ yaConfirmado: true });

    // 2a) Módulo adicional: queda activo
    if (esModulo) {
      const errMod = await activarModulo(pago);
      if (errMod) {
        console.error("pf-webhook: pago de módulo confirmado pero no se activó", pago.id, errMod);
        await aRevision(pago.id, "Pago confirmado, pero no se pudo activar el módulo: " + errMod);
        return ok({ revisar: true, motivo: "módulo no activado" });
      }
      return ok({ confirmado: true, modulo: true });
    }

    // 2b) Extra por cantidad: se suma a la suscripción
    if (String(pago.concepto_code || "").startsWith("EXTRA:")) {
      const errEx = await activarExtra(pago);
      if (errEx) {
        console.error("pf-webhook: pago de extra confirmado pero no se activó", pago.id, errEx);
        await aRevision(pago.id, "Pago confirmado, pero no se pudo activar el extra: " + errEx);
        return ok({ revisar: true, motivo: "extra no activado" });
      }
      return ok({ confirmado: true, extra: true });
    }

    // 2c) Cambio de plan: el plan de la suscripción pasa al nuevo
    if (String(pago.concepto_code || "").startsWith("PLAN:")) {
      const errPl = await activarPlan(pago);
      if (errPl) {
        console.error("pf-webhook: pago de plan confirmado pero no se cambió el plan", pago.id, errPl);
        await aRevision(pago.id, "Pago confirmado, pero no se pudo cambiar el plan: " + errPl);
        return ok({ revisar: true, motivo: "plan no cambiado" });
      }
      return ok({ confirmado: true, plan: true });
    }

    // 2) Mensualidad: el plan queda pagado un mes más
    if (sub && hasta) {
      const { error: errSub } = await sb.from("subscriptions")
        .update({ status: "active", current_period_end: hasta }).eq("id", sub.id);
      if (errSub) {
        console.error("pf-webhook: pago confirmado pero no se actualizó la suscripción", pago.id, errSub);
        await aRevision(pago.id, "Pago confirmado, pero no se pudo extender el plan: " + errSub.message);
        return ok({ revisar: true, motivo: "suscripción no actualizada" });
      }
    }

    return ok({ confirmado: true, hasta });
  } catch (e) {
    console.error("pf-webhook:", e);
    // 200 para que PagueloFácil no reintente sin fin; el error queda en los Logs
    return ok({ error: String(e) });
  }
});
