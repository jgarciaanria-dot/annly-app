// =========================================================
// Edge Function: agenda-profesional
// Agenda de solo lectura de un profesional, para su celular. La página mi-agenda.html manda { c: codigo } (enlace corto
// annly.app/agenda/paola-3fa9c01b27de) o { t: token } (enlace largo de siempre; sigue funcionando).
// El token lo crea el dueño en Equipo (tabla agenda_profesional_enlaces). Devuelve únicamente las citas próximas
// de ESE profesional (nombre, teléfono, servicio, fecha, hora, estado); no devuelve precios ni finanzas ni otros profesionales.
// "Verify JWT" APAGADO (el visitante no tiene sesión; el token hace de llave).
// Deploy: supabase functions deploy agenda-profesional --no-verify-jwt
// =========================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGENES = new Set(["https://annly.app", "https://www.annly.app", "https://dev.annly.app"]);
const DIAS_ADELANTE = 60;
const DIAS_ATRAS = 7;   // para ver la semana en curso completa
const OCULTAS = ["cancelada", "cancelado", "rechazado"];

const corsPara = (req: Request) => {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENES.has(o) ? o : "https://annly.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

// Fecha de hoy en Panamá (YYYY-MM-DD) y la de dentro de n días
const fechaPanama = (suma = 0) => {
  const d = new Date(Date.now() + suma * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

Deno.serve(async (req) => {
  const CORS = corsPara(req);
  const resp = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp({ ok: false, error: "Método no permitido" }, 405);
  const origen = req.headers.get("origin") || "";
  if (origen && !ORIGENES.has(origen)) return resp({ ok: false, error: "Origen no permitido" }, 403);

  try {
    const cuerpo = await req.json().catch(() => ({}));
    const token = typeof cuerpo?.t === "string" ? cuerpo.t.trim().toLowerCase() : "";
    const codigo = typeof cuerpo?.c === "string" ? cuerpo.c.trim().toLowerCase() : "";
    const tokenOk = /^[a-f0-9]{48}$/.test(token), codigoOk = /^[a-z0-9-]{1,40}-[a-f0-9]{12}$/.test(codigo);
    if (!tokenOk && !codigoOk) return resp({ ok: false, error: "enlace_invalido" }, 404);

    const { data: enlace } = await sb.from("agenda_profesional_enlaces").select("employee_id, business_id")
      .eq(tokenOk ? "token" : "codigo", tokenOk ? token : codigo).maybeSingle();
    if (!enlace) return resp({ ok: false, error: "enlace_invalido" }, 404);

    const [{ data: emp }, { data: neg }] = await Promise.all([
      sb.from("employees").select("nombre").eq("id", enlace.employee_id).eq("business_id", enlace.business_id).maybeSingle(),
      sb.from("businesses").select("nombre, logo_url, color_primario, color_secundario, fuente").eq("id", enlace.business_id).maybeSingle(),
    ]);
    if (!emp) return resp({ ok: false, error: "enlace_invalido" }, 404);

    const hoy = fechaPanama(0);
    const { data: citas, error } = await sb.from("appointments")
      .select("id, fecha, hora, duracion_min, cliente_nombre, cliente_telefono, servicio_nombre, estado, location_id")
      .eq("business_id", enlace.business_id).eq("employee_id", enlace.employee_id)
      .gte("fecha", fechaPanama(-DIAS_ATRAS)).lte("fecha", fechaPanama(DIAS_ADELANTE))
      .order("fecha", { ascending: true }).order("hora", { ascending: true }).limit(400);
    if (error) { console.error("agenda-profesional citas", error); return resp({ ok: false, error: "no_disponible" }, 500); }

    // Nombre de la sucursal (solo útil si el negocio tiene más de una)
    let sedes: Record<string, string> = {};
    try {
      const { data: locs } = await sb.from("locations").select("id, nombre").eq("business_id", enlace.business_id);
      sedes = Object.fromEntries((locs || []).map((l: any) => [String(l.id), l.nombre]));
    } catch (_) { /* sin sedes */ }
    const variasSedes = Object.keys(sedes).length > 1;

    return resp({
      ok: true,
      profesional: emp.nombre,
      negocio: neg?.nombre || "",
      // Marca del negocio para que la página se vea como la suya (solo datos públicos de la agenda)
      marca: { logo: neg?.logo_url || "", color: neg?.color_primario || "", color2: neg?.color_secundario || "", fuente: neg?.fuente || "" },
      hoy,
      citas: (citas || []).filter((c: any) => !OCULTAS.includes(String(c.estado || "").toLowerCase())).map((c: any) => ({
        id: c.id, fecha: c.fecha, hora: String(c.hora || "").slice(0, 5), duracion: c.duracion_min || null,
        cliente: c.cliente_nombre || "", telefono: c.cliente_telefono || "", servicio: c.servicio_nombre || "",
        estado: c.estado || "", sede: variasSedes ? (sedes[String(c.location_id)] || "") : "",
      })),
    });
  } catch (e) {
    console.error("agenda-profesional", e);
    return resp({ ok: false, error: "no_disponible" }, 500);
  }
});
