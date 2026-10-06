// =========================================================
// Edge Function: enviar-bienvenida
// El navegador la llama justo después de crear el negocio (registro con correo
// o con Google). Se identifica a la persona con su sesión, se busca su negocio
// sin correo de bienvenida y se envía una sola vez.
// Desplegar con "Verify JWT" apagado (la sesión se valida aquí dentro).
// =========================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function fechaLarga(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return f.charAt(0).toUpperCase() + f.slice(1);
}

function armarCorreo(n: any, dominioApp: string, dominioTienda: string) {
  const esTienda = n.tipo_negocio === "pedidos";
  const panel = esTienda ? `${dominioTienda}/admin` : `${dominioApp}/admin`;
  const guia = `${dominioApp}/guia.html${esTienda ? "?tipo=pedidos" : ""}`;
  const enlace = `${esTienda ? dominioTienda : dominioApp}/${n.slug}`;
  const vence = n.trial_vence_en ? fechaLarga(n.trial_vence_en) : "";
  const pasos = esTienda
    ? ["Sube tus primeros productos con foto y precio.", "Define tus zonas de entrega y las franjas con cupo.", "Comparte el enlace de tu tienda en Instagram y WhatsApp."]
    : ["Crea tus servicios con precio y duración.", "Define tus horarios y los de tu equipo.", "Comparte tu enlace en Instagram y WhatsApp."];
  const lista = pasos.map((p, i) => `<tr><td style="width:34px;vertical-align:top"><div style="width:26px;height:26px;border-radius:50%;background:#f4eaff;color:#7424d4;font-weight:700;text-align:center;line-height:26px;font-size:13px">${i + 1}</div></td><td style="padding:2px 0 14px;font-size:15px;color:#201b2b">${p}</td></tr>`).join("");
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f7f3fb;font-family:'DM Sans',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 14px">
<table width="560" style="max-width:560px;background:#fff;border-radius:18px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td style="background:linear-gradient(135deg,#7424d4,#ef3d87);padding:28px 30px;color:#fff"><div style="font-size:26px;font-weight:700;font-family:Georgia,serif">Annly</div><div style="font-size:13px;opacity:.9;margin-top:2px">Tu negocio, abierto todo el día</div></td></tr>
<tr><td style="padding:30px">
<h1 style="margin:0 0 10px;font-size:22px;color:#201b2b">Te damos la bienvenida, ${esc(n.nombre)}</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#4b4558">Tu cuenta ya está lista. Tienes <b>14 días gratis</b> para probar Annly${vence ? `, hasta el <b>${esc(vence)}</b>` : ""}, sin tarjeta y sin compromiso.</p>
<p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#201b2b">Tus primeros 3 pasos</p>
<table cellpadding="0" cellspacing="0" width="100%">${lista}</table>
<p style="text-align:center;margin:8px 0 6px"><a href="${panel}" style="display:inline-block;background:linear-gradient(135deg,#7424d4,#ef3d87);color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;font-size:15px">Entrar a mi panel</a></p>
<p style="text-align:center;margin:0 0 20px;font-size:14px"><a href="${guia}" style="color:#7424d4;font-weight:700">Ver la guía rápida: ${esTienda ? "carga tus productos" : "crea tus servicios"} en 5 minutos</a></p>
<div style="background:#f4eaff;border-radius:12px;padding:14px 16px;font-size:13.5px;color:#4b4558">Tu enlace para compartir:<br><a href="${enlace}" style="color:#7424d4;font-weight:700;word-break:break-all">${esc(enlace)}</a></div>
<p style="margin:22px 0 0;font-size:13.5px;line-height:1.55;color:#6b6578">¿Dudas? Responde este correo o escríbenos a <a href="mailto:soporte@annly.app" style="color:#7424d4">soporte@annly.app</a>. Con gusto te ayudamos.</p>
</td></tr></table>
<p style="font-size:12px;color:#8a8496;margin:16px 0 0">Annly · Más citas, más pedidos y más tiempo para ti.</p>
</td></tr></table></body></html>`;
  return { html, asunto: "Te damos la bienvenida a Annly: tu prueba de 14 días ya empezó" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u, error: eu } = await sb.auth.getUser(token);
    if (eu || !u?.user?.email) return json({ error: "Sesión no válida" }, 401);

    const { data: negocios } = await sb.from("businesses")
      .select("id,nombre,slug,tipo_negocio,trial_vence_en")
      .eq("owner_user_id", u.user.id).is("bienvenida_enviada_at", null)
      .limit(1);
    const n = negocios?.[0];
    if (!n) return json({ ok: true, omitido: "sin negocio pendiente" });

    // Se reserva primero: si dos llamadas llegan a la vez, solo una continúa.
    const { data: reservado } = await sb.from("businesses")
      .update({ bienvenida_enviada_at: new Date().toISOString() })
      .eq("id", n.id).is("bienvenida_enviada_at", null).select("id");
    if (!reservado?.length) return json({ ok: true, omitido: "ya enviado" });

    const origin = req.headers.get("origin") || "";
    const dev = /dev[.-]/.test(origin);
    const dominioApp = dev ? "https://dev.annly.app" : "https://annly.app";
    const dominioTienda = dev ? "https://dev-pedidos.annly.app" : "https://tienda.annly.app";
    const { html, asunto } = armarCorreo(n, dominioApp, dominioTienda);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `bienvenida-${n.id}` },
      body: JSON.stringify({ from: "Annly <notificaciones@annly.app>", reply_to: "soporte@annly.app", to: u.user.email, subject: asunto, html }),
    });
    if (!res.ok) {
      console.error("Resend:", await res.text());
      await sb.from("businesses").update({ bienvenida_enviada_at: null }).eq("id", n.id); // se podrá reintentar
      return json({ error: "No se pudo enviar" }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Error interno" }, 500);
  }
});
