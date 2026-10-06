// =========================================================
// Edge Function: consulta-modulo
// Un negocio toca "Quiero información" en un módulo que se cotiza aparte (por ejemplo Agente AI):
// se envía un correo a soporte@annly.app con sus datos, para saber quiénes están interesados.
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

const MODULOS: Record<string, string> = { AGENTE_AI: "Agente AI" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u, error: eu } = await sb.auth.getUser(token);
    if (eu || !u?.user?.email) return json({ error: "Sesión no válida" }, 401);

    const { businessId, modulo, mensaje } = await req.json().catch(() => ({}));
    const nombreModulo = MODULOS[String(modulo || "")];
    if (!nombreModulo) return json({ error: "Módulo no válido" }, 400);

    const { data: n } = await sb.from("businesses")
      .select("id,nombre,slug,tipo_negocio,whatsapp,owner_user_id")
      .eq("id", businessId).maybeSingle();
    if (!n || n.owner_user_id !== u.user.id) return json({ error: "Negocio no válido" }, 403);

    const { data: sub } = await sb.from("subscriptions").select("status, plans(name)")
      .eq("business_id", n.id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const plan = (sub as any)?.plans?.name ? `${(sub as any).plans.name} (${sub?.status})` : "—";
    const texto = String(mensaje || "").trim().slice(0, 1500);
    const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#201b2b;line-height:1.55">
<h2 style="margin:0 0 10px">Nueva consulta: ${esc(nombreModulo)}</h2>
<table cellpadding="4" style="font-size:14px">
<tr><td><b>Negocio</b></td><td>${esc(n.nombre)} (${esc(n.tipo_negocio)})</td></tr>
<tr><td><b>Correo</b></td><td>${esc(u.user.email)}</td></tr>
<tr><td><b>WhatsApp</b></td><td>${esc(n.whatsapp || "—")}</td></tr>
<tr><td><b>Plan</b></td><td>${esc(plan)}</td></tr>
<tr><td><b>Enlace</b></td><td>annly.app/${esc(n.slug)}</td></tr>
</table>
<p style="margin:14px 0 4px"><b>Mensaje</b></p>
<p style="margin:0;white-space:pre-wrap">${esc(texto || "(sin mensaje)")}</p>
<p style="color:#8a8496;font-size:12px;margin-top:18px">Responde este correo para escribirle directamente.</p></div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `consulta-${n.id}-${modulo}-${hoy}` },
      body: JSON.stringify({
        from: "Annly <notificaciones@annly.app>", to: "soporte@annly.app", reply_to: u.user.email,
        subject: `Consulta de módulo: ${nombreModulo} — ${n.nombre}`, html,
      }),
    });
    if (!res.ok && res.status !== 409) {
      console.error("Resend:", await res.text());
      return json({ error: "No se pudo enviar" }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Error interno" }, 500);
  }
});
