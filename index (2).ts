// =========================================================
// Supabase Edge Function: send-confirmation-email (multi-tenant)
//
// Tiene DOS formas de dispararse:
//
// 1) Database Webhook de Supabase sobre `appointments` (INSERT y UPDATE) —
//    Postgres llama esta función solo, sin que ningún código JS la invoque.
//    Manda correo al cliente Y al dueño cuando hay cita nueva, reprogramada
//    o cancelada. (Esta parte no se tocó — es la que ya tenías funcionando.)
//
// 2) Llamada directa desde el navegador (fetch con {tipo, businessId, datos})
//    para los correos de Certificados, que no tienen una tabla con webhook
//    propio: comprador, destinatario, negocio (pendiente de pago / activado).
// =========================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
// service_role (no anon) porque necesitamos leer auth.users para el correo del dueño
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function construirLinkGoogleCalendar(cita, negocio) {
  const horaCorta = (cita.hora || "00:00").split(":").slice(0, 2).join(":");
  const fecha = new Date(cita.fecha + "T" + horaCorta + ":00-05:00"); // hora de Panamá
  const fin = new Date(fecha.getTime() + (cita.duracion_min || 60) * 60000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Cita: ${cita.servicio_nombre}`,
    dates: `${fmt(fecha)}/${fmt(fin)}`,
    details: `Cita en ${negocio.nombre || "tu negocio"}. Servicio: ${cita.servicio_nombre}`,
    location: negocio.direccion || ""
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function formatearFechaHora(cita) {
  const fechaLegible = new Date(cita.fecha + "T00:00:00").toLocaleDateString("es-PA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  const fechaCapitalizada = fechaLegible.charAt(0).toUpperCase() + fechaLegible.slice(1);
  const [h, m] = (cita.hora || "0:0").split(":");
  const hNum = parseInt(h);
  const horaLegible = `${hNum > 12 ? hNum - 12 : (hNum === 0 ? 12 : hNum)}:${m} ${hNum >= 12 ? "p.m." : "a.m."}`;
  return { fechaLegible: fechaCapitalizada, horaLegible };
}

async function enviarCorreo(destinatario, nombreRemitente, asunto, html) {
  if (!destinatario) return { skipped: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${nombreRemitente} <notificaciones@annly.app>`, to: destinatario, subject: asunto, html })
  });
  const result = await res.json();
  if (!res.ok) console.error("Error de Resend:", result);
  return { ok: res.ok, result };
}

// ---------- Molde único de tabla HTML (mismo diseño para todos los correos) ----------
function armarPlantillaCorreo({ nombreNegocio, tagline, colorAcento, emojiHeader, titulo, saludo, subtitulo, filas, botones, notaTitulo, notaTexto, direccion }) {
  const filasHtml = filas.map(f => `
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #eeeeee;">
                    <table width="100%"><tr>
                      <td width="45" valign="middle">
                        <div style="width:38px;height:38px;background:#f5f0e8;border-radius:50%;text-align:center;line-height:38px;font-size:18px;">${f.emoji}</div>
                      </td>
                      <td>
                        <div style="font-size:12px;color:#737b8b;letter-spacing:.5px;margin-bottom:4px;">${f.etiqueta}</div>
                        <div style="font-size:17px;color:#151b2d;font-weight:${f.negrita !== false ? 600 : 400};${f.tachado ? "text-decoration:line-through;color:#a3a8b3;" : ""}">${f.valor}</div>
                      </td>
                    </tr></table>
                  </td>
                </tr>`).join("");

  const botonesHtml = (botones || []).map((b, i) => `
          <tr>
            <td align="center" style="padding:0 35px ${i === botones.length - 1 ? "25px" : "12px"};">
              <a href="${b.url}" target="_blank" style="display:block;background:${b.color};color:#ffffff;text-decoration:none;padding:17px 20px;border-radius:9px;font-size:16px;font-weight:bold;text-align:center;">
                ${b.emoji} &nbsp; ${b.texto} &nbsp; →
              </a>
            </td>
          </tr>`).join("");

  const notaHtml = notaTitulo ? `
          <tr>
            <td style="padding:0 35px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f8f7;border-radius:10px;">
                <tr>
                  <td width="55" valign="middle" style="padding:17px 10px 17px 18px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:#ffffff;text-align:center;line-height:32px;font-size:17px;">ℹ</div>
                  </td>
                  <td style="padding:15px 15px 15px 0;">
                    <div style="font-size:15px;font-weight:bold;color:#151b2d;margin-bottom:4px;">${notaTitulo}</div>
                    <div style="font-size:14px;color:#6d7483;">${notaTexto}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : "";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${titulo}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial, Helvetica, sans-serif;color:#202536;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:30px 15px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">

        <tr><td align="center" style="padding:28px 25px 24px;background:#ffffff;border-bottom:1px solid #e7d7bd;">
          <div style="font-size:20px;letter-spacing:4px;font-weight:500;color:${colorAcento};">${nombreNegocio.toUpperCase()}</div>
          ${tagline ? `<div style="margin-top:8px;font-size:11px;letter-spacing:3px;color:#8a8f9d;">${tagline}</div>` : ""}
        </td></tr>

        <tr><td style="padding:38px 35px 25px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="80" valign="top">
              <div style="width:64px;height:64px;background:#f4f0e9;border-radius:50%;text-align:center;line-height:64px;font-size:30px;">${emojiHeader}</div>
            </td>
            <td valign="top" style="padding-left:15px;">
              <div style="font-size:28px;line-height:34px;font-weight:700;color:#151b2d;">${titulo}</div>
              <div style="margin-top:10px;font-size:16px;line-height:23px;color:#626b7d;"><strong>${saludo}</strong><br>${subtitulo}</div>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:0 35px 25px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e5e5;border-radius:12px;background:#ffffff;">
            ${filasHtml}
          </table>
        </td></tr>

        ${botonesHtml}
        ${notaHtml}

        <tr><td style="padding:22px 35px;border-top:1px solid #eeeeee;background:#fafafa;">
          <div style="font-size:13px;font-weight:bold;letter-spacing:1px;color:#4b5261;">${nombreNegocio.toUpperCase()}</div>
          ${direccion ? `<div style="margin-top:6px;font-size:13px;color:#858b97;">${direccion}</div>` : ""}
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------- Arma los datos (filas/botones/texto) según destinatario + tipo de CITA ----------
function armarCorreoCita(audiencia, tipo, cita, negocio) {
  const nombreNegocio = negocio.nombre || "Tu negocio";
  const tagline = negocio.categoria ? negocio.categoria.toUpperCase() : "";
  const colorAcento = negocio.color_primario || "#a47c48";
  const { fechaLegible, horaLegible } = formatearFechaHora(cita);
  const precio = cita.precio_es_consultar ? "Por confirmar" : (cita.precio_final != null ? `$${Number(cita.precio_final).toFixed(2)}` : (cita.precio_total != null ? `$${Number(cita.precio_total).toFixed(2)}` : "Por confirmar"));
  const linkCalendario = construirLinkGoogleCalendar(cita, negocio);
  const tachado = tipo === "cancelada";
  const whatsappNegocio = (negocio.whatsapp || "").replace(/\D/g, "");
  const telCliente = (cita.cliente_telefono || "").replace(/\D/g, "");

  if (audiencia === "cliente") {
    const filas = [
      { emoji: "👤", etiqueta: "CLIENTE", valor: cita.cliente_nombre || "" },
      { emoji: "🏷️", etiqueta: "SERVICIO", valor: cita.servicio_nombre || "", tachado },
      { emoji: "📅", etiqueta: "FECHA", valor: fechaLegible, tachado },
      { emoji: "🕘", etiqueta: "HORA", valor: horaLegible, tachado }
    ];
    const abono = Number(cita.abono_monto) || 0;
    let notaAbono = null;
    if (abono > 0 && tipo !== "cancelada") {
      if (cita.precio_es_consultar) {
        filas.push({ emoji: "✓", etiqueta: "ABONO PAGADO", valor: `$${abono.toFixed(2)}` });
        notaAbono = "El precio final se confirma el día de tu cita según el servicio acordado — tu abono ya pagado se descuenta del total.";
      } else {
        const totalServicio = Number(cita.precio_final != null ? cita.precio_final : cita.precio_total) || 0;
        const porPagar = Math.max(0, totalServicio - abono);
        filas.push({ emoji: "$", etiqueta: "PRECIO DEL SERVICIO", valor: `$${totalServicio.toFixed(2)}`, negrita: false });
        filas.push({ emoji: "✓", etiqueta: "ABONO PAGADO", valor: `-$${abono.toFixed(2)}`, negrita: false });
        filas.push({ emoji: "$", etiqueta: "TOTAL A PAGAR EL DÍA DE LA CITA", valor: `$${porPagar.toFixed(2)}` });
      }
    } else {
      filas.push({ emoji: "$", etiqueta: "PRECIO TOTAL", valor: precio });
    }
    const mensajeWa = encodeURIComponent(`Hola, quisiera hacer un cambio en mi cita del ${fechaLegible} a las ${horaLegible} (${cita.servicio_nombre}).`);
    const botonWaNegocio = whatsappNegocio ? { emoji: "💬", texto: `Escribir a ${nombreNegocio}`, url: `https://wa.me/${whatsappNegocio}?text=${mensajeWa}`, color: "#20c66a" } : null;

    if (tipo === "nueva") {
      return {
        asunto: `Tu cita ha sido confirmada — ${nombreNegocio}`,
        html: armarPlantillaCorreo({
          nombreNegocio, tagline, colorAcento, emojiHeader: "📅",
          titulo: "¡Tu cita está confirmada!", saludo: `Hola, ${cita.cliente_nombre || ""}!`,
          subtitulo: "Tu cita ha sido agendada con éxito. Aquí tienes toda la información.",
          filas,
          botones: [{ emoji: "📆", texto: "Agregar a Google Calendar", url: linkCalendario, color: "#4285F4" }, botonWaNegocio].filter(Boolean),
          notaTitulo: notaAbono ? "Sobre tu abono" : "¿Necesitas hacer algún cambio?",
          notaTexto: notaAbono || "Puedes contactarnos por WhatsApp. Estamos para ayudarte.",
          direccion: negocio.direccion
        })
      };
    }
    if (tipo === "reprogramada") {
      return {
        asunto: `Tu cita cambió de horario — ${nombreNegocio}`,
        html: armarPlantillaCorreo({
          nombreNegocio, tagline, colorAcento, emojiHeader: "🔄",
          titulo: "¡Tu cita cambió de horario!", saludo: `Hola, ${cita.cliente_nombre || ""}!`,
          subtitulo: "Estos son los datos actualizados de tu cita.",
          filas,
          botones: [{ emoji: "📆", texto: "Agregar a Google Calendar", url: linkCalendario, color: "#4285F4" }, botonWaNegocio].filter(Boolean),
          notaTitulo: notaAbono ? "Sobre tu abono" : "¿Necesitas hacer algún cambio?",
          notaTexto: notaAbono || "Puedes contactarnos por WhatsApp. Estamos para ayudarte.",
          direccion: negocio.direccion
        })
      };
    }
    return {
      asunto: `Tu cita fue cancelada — ${nombreNegocio}`,
      html: armarPlantillaCorreo({
        nombreNegocio, tagline, colorAcento: "#C2695A", emojiHeader: "✕",
        titulo: "Tu cita fue cancelada", saludo: `Hola, ${cita.cliente_nombre || ""}!`,
        subtitulo: "Si fue un error o quieres reservar de nuevo, contáctanos.",
        filas,
        botones: [botonWaNegocio ? { ...botonWaNegocio, texto: "Reservar otra cita" } : null].filter(Boolean),
        direccion: negocio.direccion
      })
    };
  }

  // audiencia === "dueno"
  const abonoDueno = Number(cita.abono_monto) || 0;
  const filas = [
    { emoji: "👤", etiqueta: "CLIENTE", valor: cita.cliente_nombre || "" },
    { emoji: "💬", etiqueta: "WHATSAPP", valor: cita.cliente_telefono || "—", negrita: false },
    { emoji: "🏷️", etiqueta: "SERVICIO", valor: cita.servicio_nombre || "", tachado },
    { emoji: "📅", etiqueta: "FECHA", valor: fechaLegible, tachado },
    { emoji: "🕘", etiqueta: "HORA", valor: horaLegible, tachado }
  ];
  let notaAbonoDueno = null;
  if (abonoDueno > 0 && tipo !== "cancelada") {
    if (cita.precio_es_consultar) {
      filas.push({ emoji: "✓", etiqueta: "ABONO YA PAGADO", valor: `$${abonoDueno.toFixed(2)}` });
      notaAbonoDueno = `El precio es "desde", así que el total se confirma con el cliente el día de la cita. Ya pagó $${abonoDueno.toFixed(2)} de abono — descuéntalo del total acordado.`;
    } else {
      const totalServicioDueno = Number(cita.precio_final != null ? cita.precio_final : cita.precio_total) || 0;
      const porPagarDueno = Math.max(0, totalServicioDueno - abonoDueno);
      filas.push({ emoji: "$", etiqueta: "PRECIO DEL SERVICIO", valor: `$${totalServicioDueno.toFixed(2)}`, negrita: false });
      filas.push({ emoji: "✓", etiqueta: "ABONO YA PAGADO", valor: `-$${abonoDueno.toFixed(2)}`, negrita: false });
      filas.push({ emoji: "$", etiqueta: "LE FALTA PAGAR", valor: `$${porPagarDueno.toFixed(2)}` });
    }
  } else {
    filas.push({ emoji: "$", etiqueta: "PRECIO", valor: precio });
  }
  const mensajeWaCliente = encodeURIComponent(`Hola ${cita.cliente_nombre || ""}, te escribo de ${nombreNegocio} sobre tu cita del ${fechaLegible} a las ${horaLegible}.`);
  const botonContactarCliente = telCliente ? { emoji: "💬", texto: `Contactar a ${cita.cliente_nombre || "cliente"} por WhatsApp`, url: `https://wa.me/${telCliente}?text=${mensajeWaCliente}`, color: "#20c66a" } : null;

  if (tipo === "nueva") {
    return {
      asunto: `Nueva cita agendada: ${cita.cliente_nombre || "Cliente"} — ${nombreNegocio}`,
      html: armarPlantillaCorreo({
        nombreNegocio, tagline, colorAcento, emojiHeader: "📅",
        titulo: "¡Nueva cita agendada!", saludo: "", subtitulo: "Tienes una nueva cita en tu agenda.",
        filas,
        botones: [{ emoji: "📆", texto: "Agregar a Google Calendar", url: linkCalendario, color: "#4285F4" }, botonContactarCliente].filter(Boolean),
        notaTitulo: notaAbonoDueno ? "Sobre el abono" : "Recuerda preparar todo para su visita",
        notaTexto: notaAbonoDueno || "Tu cliente tiene una nueva cita en la agenda.",
        direccion: negocio.direccion
      })
    };
  }
  if (tipo === "reprogramada") {
    return {
      asunto: `Cita reprogramada: ${cita.cliente_nombre || "Cliente"} — ${nombreNegocio}`,
      html: armarPlantillaCorreo({
        nombreNegocio, tagline, colorAcento, emojiHeader: "🔄",
        titulo: "Cita reprogramada", saludo: "", subtitulo: "Un cliente cambió el horario de su cita.",
        filas,
        botones: [{ emoji: "📆", texto: "Agregar a Google Calendar", url: linkCalendario, color: "#4285F4" }, botonContactarCliente].filter(Boolean),
        notaTitulo: notaAbonoDueno ? "Sobre el abono" : null,
        notaTexto: notaAbonoDueno || null,
        direccion: negocio.direccion
      })
    };
  }
  return {
    asunto: `Cita cancelada: ${cita.cliente_nombre || "Cliente"} — ${nombreNegocio}`,
    html: armarPlantillaCorreo({
      nombreNegocio, tagline, colorAcento: "#C2695A", emojiHeader: "✕",
      titulo: "Cita cancelada", saludo: "", subtitulo: "Un cliente canceló su cita.",
      filas,
      botones: [botonContactarCliente].filter(Boolean),
      direccion: negocio.direccion
    })
  };
}

// ---------- Arma los correos de CERTIFICADOS (llamada directa vía fetch, no webhook) ----------
function armarCorreoCertificado(tipo, negocio, datos) {
  const nombreNegocio = negocio.nombre || "Tu negocio";
  const tagline = negocio.categoria ? negocio.categoria.toUpperCase() : "";
  const colorAcento = negocio.color_primario || "#a47c48";

  if (tipo === "certificado_comprador") {
    const filas = [
      { emoji: "🎁", etiqueta: "CÓDIGO", valor: datos.codigo || "" },
      { emoji: "$", etiqueta: "MONTO", valor: `$${Number(datos.monto || 0).toFixed(2)}` },
      { emoji: "👤", etiqueta: "PARA", valor: datos.nombreDestinatario || "—" },
      { emoji: "📅", etiqueta: "VENCE", valor: datos.fechaVencimiento || "—" }
    ];
    return {
      asunto: `Tu certificado de regalo está listo — ${nombreNegocio}`,
      html: armarPlantillaCorreo({
        nombreNegocio, tagline, colorAcento, emojiHeader: "🎁",
        titulo: "¡Gracias por tu compra!", saludo: `Hola, ${datos.nombreComprador || ""}!`,
        subtitulo: `Tu certificado ya está en camino a ${datos.nombreDestinatario || "su destinatario"}.`,
        filas, botones: [], direccion: negocio.direccion
      })
    };
  }

  if (tipo === "certificado_destinatario") {
    const filas = [
      { emoji: "💝", etiqueta: "DE PARTE DE", valor: datos.nombreComprador || "Alguien especial" },
      { emoji: "$", etiqueta: "MONTO", valor: `$${Number(datos.monto || 0).toFixed(2)}` }
    ];
    if (datos.mensaje) filas.push({ emoji: "💬", etiqueta: "MENSAJE", valor: datos.mensaje, negrita: false });
    return {
      asunto: `Tienes un regalo de ${nombreNegocio}`,
      html: armarPlantillaCorreo({
        nombreNegocio, tagline, colorAcento, emojiHeader: "🎁",
        titulo: "¡Alguien pensó en ti!", saludo: "",
        subtitulo: `${datos.nombreComprador || "Alguien"} quiere regalarte una experiencia especial en ${nombreNegocio}.`,
        filas,
        botones: datos.linkCertificado ? [{ emoji: "🎁", texto: "Abrir mi regalo", url: datos.linkCertificado, color: colorAcento }] : [],
        direccion: negocio.direccion
      })
    };
  }

  if (tipo === "certificado_pendiente_pago") {
    const filas = [
      { emoji: "$", etiqueta: "MONTO", valor: `$${Number(datos.monto || 0).toFixed(2)}` },
      { emoji: "👤", etiqueta: "COMPRADOR", valor: datos.nombreComprador || "" },
      { emoji: "💳", etiqueta: "MÉTODO DE PAGO", valor: datos.metodoPago === "bank" ? "Transferencia" : "Yappy", negrita: false },
      { emoji: "🧾", etiqueta: "COMPROBANTE", valor: datos.comprobante || "—", negrita: false }
    ];
    return {
      asunto: `Nueva compra de certificado — $${Number(datos.monto || 0).toFixed(2)}`,
      html: armarPlantillaCorreo({
        nombreNegocio, tagline, colorAcento, emojiHeader: "🔔",
        titulo: "Nuevo certificado por confirmar", saludo: "",
        subtitulo: "Un cliente compró un certificado — revisa el pago para activarlo.",
        filas, botones: [],
        notaTitulo: "¿Dónde lo confirmo?",
        notaTexto: "Panel de administración → Certificados → Pendientes de pago.",
        direccion: negocio.direccion
      })
    };
  }

  // certificado_activado
  return {
    asunto: `Certificado activado — ${datos.codigo || ""}`,
    html: armarPlantillaCorreo({
      nombreNegocio, tagline, colorAcento, emojiHeader: "✅",
      titulo: "Certificado activado", saludo: "",
      subtitulo: `El certificado ${datos.codigo || ""} quedó activo y se le notificó al comprador y al destinatario.`,
      filas: [], botones: [], direccion: negocio.direccion
    })
  };
}

async function manejarCertificado(req) {
  const { tipo, businessId, datos } = await req.json();
  if (!tipo || !businessId) {
    return new Response(JSON.stringify({ ok: false, error: "Faltan tipo o businessId" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { data: negocio, error: errNegocio } = await sb.from("businesses").select("*").eq("id", businessId).maybeSingle();
  if (errNegocio || !negocio) {
    return new Response(JSON.stringify({ ok: false, error: "Negocio no encontrado" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  let correoDueno = null;
  if (negocio.owner_user_id) {
    const { data: userData } = await sb.auth.admin.getUserById(negocio.owner_user_id);
    correoDueno = userData?.user?.email || null;
  }

  const dirigidoAlNegocio = tipo === "certificado_pendiente_pago" || tipo === "certificado_activado";
  const destinatario = dirigidoAlNegocio ? correoDueno : (datos?.correoComprador || datos?.correoDestinatario);
  if (!destinatario) {
    return new Response(JSON.stringify({ ok: false, error: "Sin destinatario para este correo" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { asunto, html } = armarCorreoCertificado(tipo, negocio, datos || {});
  const resultado = await enviarCorreo(destinatario, negocio.nombre || "Tu negocio", asunto, html);

  return new Response(JSON.stringify({ ok: !!resultado.ok || !!resultado.skipped }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function manejarWebhookCita(payload) {
  const cita = payload.record;
  const anterior = payload.old_record;
  const tipoEvento = payload.type; // 'INSERT' | 'UPDATE'

  if (!cita) return new Response(JSON.stringify({ skipped: true, reason: "sin registro" }), { status: 200 });

  let tipo = null;
  if (tipoEvento === "INSERT") {
    tipo = "nueva";
  } else if (tipoEvento === "UPDATE") {
    if (cita.estado === "cancelada" && anterior?.estado !== "cancelada") {
      tipo = "cancelada";
    } else if (anterior && (cita.fecha !== anterior.fecha || cita.hora !== anterior.hora)) {
      tipo = "reprogramada";
    } else {
      return new Response(JSON.stringify({ skipped: true, reason: "cambio no relevante para correo" }), { status: 200 });
    }
  } else {
    return new Response(JSON.stringify({ skipped: true, reason: "tipo de evento desconocido" }), { status: 200 });
  }

  const { data: negocio, error: errNegocio } = await sb.from("businesses").select("*").eq("id", cita.business_id).maybeSingle();
  if (errNegocio || !negocio) {
    console.error("No se encontró el negocio para business_id:", cita.business_id, errNegocio);
    return new Response(JSON.stringify({ skipped: true, reason: "negocio no encontrado" }), { status: 200 });
  }

  let correoDueno = null;
  if (negocio.owner_user_id) {
    const { data: userData, error: errUser } = await sb.auth.admin.getUserById(negocio.owner_user_id);
    if (errUser) console.error("No se pudo leer el correo del dueño:", errUser);
    correoDueno = userData?.user?.email || null;
  }

  const envios = [];
  if (cita.cliente_correo) {
    const { asunto, html } = armarCorreoCita("cliente", tipo, cita, negocio);
    envios.push(enviarCorreo(cita.cliente_correo, negocio.nombre || "Tu negocio", asunto, html));
  }
  if (correoDueno) {
    const { asunto, html } = armarCorreoCita("dueno", tipo, cita, negocio);
    envios.push(enviarCorreo(correoDueno, "Annly", asunto, html));
  }

  await Promise.all(envios);
  return new Response(JSON.stringify({ sent: true, tipo }), { status: 200 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.clone().json();

    // Llamada directa (certificados): trae tipo + businessId, no record.
    if (payload.tipo && payload.businessId) {
      return await manejarCertificado(req);
    }

    // Si no, es el Database Webhook de appointments.
    return await manejarWebhookCita(payload);

  } catch (err) {
    console.error("Error en la función:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
