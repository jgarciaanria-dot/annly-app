// =========================================================
// Supabase Edge Function: send-confirmation-email (multi-tenant)
//
// Tiene DOS formas de dispararse:
//
// 1) Database Webhook de Supabase sobre `appointments` (INSERT y UPDATE) —
//    Postgres llama esta función solo, sin que ningún código JS la invoque.
//    Manda correo al cliente Y al dueño cuando hay cita nueva, reprogramada
//    o cancelada. Si el negocio tiene más de una sucursal activa, el correo
//    muestra la sucursal de la cita (nombre, dirección, "Cómo llegar") y usa
//    su WhatsApp y su dirección.
//    En la cancelación explica qué pasó con el abono (saldo a favor,
//    penalidad o reembolso) y con el certificado (devuelto al saldo).
//    En la cancelación NO se muestra "total a pagar" (ya no hay nada que pagar).
//
// 2) Llamada directa desde el navegador (fetch con {tipo, businessId, datos})
//    para los correos de Certificados, que no tienen una tabla con webhook
//    propio: comprador, destinatario, negocio (pendiente de pago / activado).
//    Cualquier otro tipo que llegue por esta vía se ignora (los correos de
//    citas los manda solo el webhook).
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

const TIPOS_CERTIFICADO = ["certificado_comprador", "certificado_destinatario", "certificado_pendiente_pago", "certificado_activado"];

// Número de WhatsApp: solo dígitos; un número panameño de 8 dígitos recibe el 507
function normalizarWhatsApp(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length === 8) d = "507" + d;
  return d;
}

function construirLinkGoogleCalendar(cita, negocio, direccion) {
  const horaCorta = (cita.hora || "00:00").split(":").slice(0, 2).join(":");
  const fecha = new Date(cita.fecha + "T" + horaCorta + ":00-05:00"); // hora de Panamá
  const fin = new Date(fecha.getTime() + (cita.duracion_min || 60) * 60000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Cita: ${cita.servicio_nombre}`,
    dates: `${fmt(fecha)}/${fmt(fin)}`,
    details: `Cita en ${negocio.nombre || "tu negocio"}. Servicio: ${cita.servicio_nombre}`,
    location: direccion || ""
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function linkGoogleMaps(direccion) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion + ", Panamá")}`;
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

// Correos del negocio: el de acceso al panel (dueño) y, si lo configuró, el correo extra de avisos.
// Siempre llegan a los dos (sin repetir si son el mismo).
function correosDelNegocio(negocio, correoDueno) {
  const lista = [];
  for (const c of [correoDueno, negocio?.correo_avisos]) {
    const limpio = String(c || "").trim();
    if (/^\S+@\S+\.\S+$/.test(limpio) && !lista.some((x) => x.toLowerCase() === limpio.toLowerCase())) lista.push(limpio);
  }
  return lista;
}

async function enviarCorreo(destinatario, nombreRemitente, asunto, html, claveUnica) {
  if (!destinatario) return { skipped: true };
  const headers = { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" };
  // Con la misma clave, Resend no vuelve a enviar el mismo correo (24 h): protege contra
  // webhooks duplicados o repetidos.
  if (claveUnica) headers["Idempotency-Key"] = String(claveUnica).slice(0, 250);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({ from: `${nombreRemitente} <notificaciones@annly.app>`, to: destinatario, subject: asunto, html })
  });
  const result = await res.json();
  if (!res.ok) {
    // 409 = ese mismo correo ya se envió: no es un error
    if (res.status === 409) return { ok: true, duplicado: true };
    console.error("Error de Resend:", result);
  }
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

// Fila con el saldo que le queda al certificado tras esta cita (se guarda en la cita al reservar)
function filaSaldoCertificado(cita) {
  if (cita.certificado_saldo_restante === null || cita.certificado_saldo_restante === undefined || cita.certificado_saldo_restante === "") return null;
  return { emoji: "🎁", etiqueta: "SALDO RESTANTE DEL CERTIFICADO", valor: `$${Number(cita.certificado_saldo_restante).toFixed(2)}`, negrita: false };
}

// Certificado que el cliente validó al reservar pero que aún no se descontó (precio no fijo):
// se aplica el día de la cita, cuando se confirma el precio final.
function filaCertificadoPorAplicar(cita, audiencia) {
  const monto = Number(cita.certificado_monto) || 0;
  if (!cita.certificado_codigo || monto > 0) return null;
  if (audiencia === "dueno") {
    return { emoji: "🎁", etiqueta: "CERTIFICADO POR APLICAR", valor: `${cita.certificado_codigo} · el cliente lo presentará; se descuenta al completar la cita, según el precio final`, negrita: false };
  }
  return { emoji: "🎁", etiqueta: "CERTIFICADO", valor: `${cita.certificado_codigo} · validado. No se ha descontado nada: se aplicará el día de tu cita, cuando se confirme el precio`, negrita: false };
}

// Fila de sucursal (solo cuando el negocio tiene más de una)
function filaSucursal(sucursal, tachado) {
  if (!sucursal) return [];
  const valor = sucursal.direccion ? `${sucursal.nombre}<br><span style="font-size:14px;font-weight:400;color:#626b7d;">${sucursal.direccion}</span>` : sucursal.nombre;
  return [{ emoji: "📍", etiqueta: "SUCURSAL", valor, tachado }];
}

// Qué pasó con el abono y el certificado al cancelar (lo guarda el panel en la cita)
function filasCancelacion(cita, audiencia) {
  const f = [];
  const cli = audiencia === "cliente";
  const abono = Number(cita.abono_monto) || 0;
  const dev = Number(cita.certificado_devuelto) || 0;
  if (abono > 0 && cita.abono_destino) {
    let valor = "";
    if (cita.abono_destino === "credito") {
      const vence = cita.credito_vence
        ? new Date(cita.credito_vence + "T00:00:00").toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" })
        : "";
      valor = cli
        ? `$${abono.toFixed(2)} quedó como saldo a favor. Úsalo al reservar con el código <strong>${cita.credito_codigo || ""}</strong>${vence ? ", válido hasta el " + vence : ""}.`
        : `$${abono.toFixed(2)} pasó a saldo a favor del cliente (${cita.credito_codigo || ""}${vence ? ", vence el " + vence : ""}).`;
    } else if (cita.abono_destino === "penalidad") {
      const porque = cita.cancelacion_caso === "no_show"
        ? (cli ? "no te presentaste a la cita" : "no se presentó")
        : "la cancelación fue con menos aviso del mínimo";
      valor = cli ? `$${abono.toFixed(2)} no es reembolsable porque ${porque}.` : `$${abono.toFixed(2)} queda como penalidad: ${porque}.`;
    } else if (cita.abono_destino === "reembolso") {
      const medio = { yappy: "Yappy", transferencia: "transferencia", efectivo: "efectivo" }[cita.reembolso_metodo] || "el medio acordado";
      valor = cli ? `Te devolveremos $${abono.toFixed(2)} por ${medio}.` : `Hay que devolverle $${abono.toFixed(2)} por ${medio}.`;
    }
    if (valor) f.push({ emoji: "💳", etiqueta: cli ? "TU ABONO" : "ABONO", valor, negrita: false });
  }
  if (dev > 0) {
    f.push({ emoji: "🎁", etiqueta: "CERTIFICADO", valor: `${cli ? "Te devolvimos" : "Se devolvieron"} $${dev.toFixed(2)} al certificado ${cita.certificado_codigo || ""}.`, negrita: false });
  } else if (cita.certificado_codigo && Number(cita.certificado_monto) > 0 && cita.cancelacion_caso === "no_show") {
    f.push({ emoji: "🎁", etiqueta: "CERTIFICADO", valor: cli ? "El certificado de cortesía se consumió al no presentarte a la cita." : "El certificado de cortesía se consumió (no se presentó).", negrita: false });
  }
  return f;
}

function subtituloCancelacion(cita, audiencia) {
  const c = cita.cancelacion_caso, cli = audiencia === "cliente";
  if (c === "abono_rechazado") return cli ? "No pudimos validar tu abono, así que tu reserva fue cancelada. Si fue un error, escríbenos y lo revisamos." : "Cancelaste la reserva porque el abono no llegó.";
  if (c === "no_show") return cli ? "No te presentaste a tu cita. Si quieres reservar de nuevo, contáctanos." : "El cliente no se presentó a su cita.";
  if (c === "negocio") return cli ? "Lamentamos tener que cancelar tu cita. Contáctanos para reservar de nuevo." : "Cancelaste esta cita desde el negocio.";
  if (c === "tarde") return cli ? "Tu cita fue cancelada con menos aviso del mínimo." : "El cliente canceló con menos aviso del mínimo.";
  return cli ? "Si fue un error o quieres reservar de nuevo, contáctanos." : "Un cliente canceló su cita.";
}

// ---------- Arma los datos (filas/botones/texto) según destinatario + tipo de CITA ----------
// sucursal: { nombre, direccion, telefono } o null (negocio con una sola sucursal)
function armarCorreoCita(audiencia, tipo, cita, negocio, profesional, sucursal) {
  const nombreNegocio = negocio.nombre || "Tu negocio";
  const tagline = negocio.categoria ? negocio.categoria.toUpperCase() : "";
  const colorAcento = negocio.color_primario || "#a47c48";
  const { fechaLegible, horaLegible } = formatearFechaHora(cita);
  // Dirección y WhatsApp: los de la sucursal de la cita, con los del negocio como respaldo
  const direccion = (sucursal && sucursal.direccion) || negocio.direccion || "";
  const linkCalendario = construirLinkGoogleCalendar(cita, negocio, direccion);
  const tachado = tipo === "cancelada";
  const whatsappNegocio = (sucursal && sucursal.telefono) ? normalizarWhatsApp(sucursal.telefono) : (negocio.whatsapp || "").replace(/\D/g, "");
  const telCliente = (cita.cliente_telefono || "").replace(/\D/g, "");
  const nombreLugar = sucursal ? `${nombreNegocio} · ${sucursal.nombre}` : nombreNegocio;
  const pie = sucursal ? `${sucursal.nombre}${direccion ? " · " + direccion : ""}` : direccion;

  if (audiencia === "cliente") {
    const filas = [
      { emoji: "👤", etiqueta: "CLIENTE", valor: cita.cliente_nombre || "" },
      { emoji: "🏷️", etiqueta: "SERVICIO", valor: cita.servicio_nombre || "", tachado },
      ...(profesional ? [{ emoji: "💆", etiqueta: "PROFESIONAL", valor: profesional, tachado }] : []),
      ...filaSucursal(sucursal, tachado),
      { emoji: "📅", etiqueta: "FECHA", valor: fechaLegible, tachado },
      { emoji: "🕘", etiqueta: "HORA", valor: horaLegible, tachado }
    ];
    const abono = Number(cita.abono_monto) || 0;
    const certMontoCliente = Number(cita.certificado_monto) || 0;
    let notaAbono = null;
    if (cita.precio_es_consultar) {
      filas.push({ emoji: "$", etiqueta: "PRECIO", valor: "Por confirmar" });
      { const pend = filaCertificadoPorAplicar(cita, audiencia); if (pend && tipo !== "cancelada") filas.push(pend); }
      if (certMontoCliente > 0 && tipo !== "cancelada") {
        filas.push({ emoji: "🎁", etiqueta: "CERTIFICADO APLICADO", valor: `-$${certMontoCliente.toFixed(2)} (${cita.certificado_codigo || ""})`, negrita: false });
        const saldoCert = filaSaldoCertificado(cita);
        if (saldoCert) filas.push(saldoCert);
      }
      if (abono > 0 && tipo !== "cancelada") {
        filas.push({ emoji: "✓", etiqueta: "ABONO PAGADO", valor: `$${abono.toFixed(2)}` });
        notaAbono = "El precio final se confirma el día de tu cita según el servicio acordado — tu abono y tu certificado (si aplicaste uno) se descuentan del total.";
      }
    } else {
      const precioServicio = Number(cita.precio_total) || 0;
      const totalAntesDeAbono = Math.max(0, precioServicio - certMontoCliente);
      const porPagar = Math.max(0, totalAntesDeAbono - abono);
      filas.push({ emoji: "$", etiqueta: "PRECIO DEL SERVICIO", valor: `$${precioServicio.toFixed(2)}`, negrita: false });
      { const pend = filaCertificadoPorAplicar(cita, audiencia); if (pend && tipo !== "cancelada") filas.push(pend); }
      if (certMontoCliente > 0 && tipo !== "cancelada") {
        filas.push({ emoji: "🎁", etiqueta: "CERTIFICADO APLICADO", valor: `-$${certMontoCliente.toFixed(2)} (${cita.certificado_codigo || ""})`, negrita: false });
        const saldoCert = filaSaldoCertificado(cita);
        if (saldoCert) filas.push(saldoCert);
      }
      if (abono > 0 && tipo !== "cancelada") {
        filas.push({ emoji: "✓", etiqueta: "ABONO PAGADO", valor: `-$${abono.toFixed(2)}`, negrita: false });
      }
      // En una cita cancelada ya no hay nada que pagar ese día
      if (tipo !== "cancelada") filas.push({ emoji: "$", etiqueta: "TOTAL A PAGAR EL DÍA DE LA CITA", valor: `$${porPagar.toFixed(2)}` });
    }
    const mensajeWa = encodeURIComponent(`Hola, quisiera hacer un cambio en mi cita del ${fechaLegible} a las ${horaLegible} (${cita.servicio_nombre})${sucursal ? " en " + sucursal.nombre : ""}.`);
    const botonWaNegocio = whatsappNegocio ? { emoji: "💬", texto: `Escribir a ${nombreLugar}`, url: `https://wa.me/${whatsappNegocio}?text=${mensajeWa}`, color: "#20c66a" } : null;
    // "Cómo llegar": solo con varias sucursales, para que el cliente vaya a la correcta
    const botonComoLlegar = (sucursal && direccion) ? { emoji: "📍", texto: `Cómo llegar a ${sucursal.nombre}`, url: linkGoogleMaps(direccion), color: "#6B7280" } : null;

    if (tipo === "por_confirmar") {
      return {
        asunto: `Recibimos tu reserva — ${nombreLugar}`,
        html: armarPlantillaCorreo({
          nombreNegocio, tagline, colorAcento, emojiHeader: "⏳",
          titulo: "¡Recibimos tu reserva!", saludo: `Hola, ${cita.cliente_nombre || ""}!`,
          subtitulo: "Tu horario quedó apartado. Estamos validando tu abono y te avisaremos por correo apenas quede confirmada.",
          filas,
          botones: [botonWaNegocio].filter(Boolean),
          notaTitulo: "¿Qué sigue?",
          notaTexto: `Revisaremos tu comprobante${cita.comprobante ? " (" + cita.comprobante + ")" : ""}. Si hay algún problema con el pago, te escribiremos.`,
          direccion: pie
        })
      };
    }
    if (tipo === "nueva" || tipo === "abono_confirmado") {
      return {
        asunto: `Tu cita ha sido confirmada — ${nombreLugar}`,
        html: armarPlantillaCorreo({
          nombreNegocio, tagline, colorAcento, emojiHeader: "📅",
          titulo: "¡Tu cita está confirmada!", saludo: `Hola, ${cita.cliente_nombre || ""}!`,
          subtitulo: "Tu cita ha sido agendada con éxito. Aquí tienes toda la información.",
          filas,
          botones: [{ emoji: "📆", texto: "Agregar a Google Calendar", url: linkCalendario, color: "#4285F4" }, botonComoLlegar, botonWaNegocio].filter(Boolean),
          notaTitulo: notaAbono ? "Sobre tu abono" : "¿Necesitas hacer algún cambio?",
          notaTexto: notaAbono || "Puedes contactarnos por WhatsApp. Estamos para ayudarte.",
          direccion: pie
        })
      };
    }
    if (tipo === "reprogramada") {
      return {
        asunto: `Tu cita cambió de horario — ${nombreLugar}`,
        html: armarPlantillaCorreo({
          nombreNegocio, tagline, colorAcento, emojiHeader: "🔄",
          titulo: "¡Tu cita cambió de horario!", saludo: `Hola, ${cita.cliente_nombre || ""}!`,
          subtitulo: "Estos son los datos actualizados de tu cita.",
          filas,
          botones: [{ emoji: "📆", texto: "Agregar a Google Calendar", url: linkCalendario, color: "#4285F4" }, botonComoLlegar, botonWaNegocio].filter(Boolean),
          notaTitulo: notaAbono ? "Sobre tu abono" : "¿Necesitas hacer algún cambio?",
          notaTexto: notaAbono || "Puedes contactarnos por WhatsApp. Estamos para ayudarte.",
          direccion: pie
        })
      };
    }
    return {
      asunto: `Tu cita fue cancelada — ${nombreLugar}`,
      html: armarPlantillaCorreo({
        nombreNegocio, tagline, colorAcento: "#C2695A", emojiHeader: "✕",
        titulo: "Tu cita fue cancelada", saludo: `Hola, ${cita.cliente_nombre || ""}!`,
        subtitulo: subtituloCancelacion(cita, "cliente"),
        filas: [...filas, ...filasCancelacion(cita, "cliente")],
        botones: [botonWaNegocio ? { ...botonWaNegocio, texto: "Reservar otra cita" } : null].filter(Boolean),
        direccion: pie
      })
    };
  }

  // audiencia === "dueno"
  const abonoDueno = Number(cita.abono_monto) || 0;
  const certMontoDueno = Number(cita.certificado_monto) || 0;
  const filas = [
    { emoji: "👤", etiqueta: "CLIENTE", valor: cita.cliente_nombre || "" },
    { emoji: "💬", etiqueta: "WHATSAPP", valor: cita.cliente_telefono || "—", negrita: false },
    { emoji: "🏷️", etiqueta: "SERVICIO", valor: cita.servicio_nombre || "", tachado },
    ...(profesional ? [{ emoji: "💆", etiqueta: "PROFESIONAL", valor: profesional, tachado }] : []),
    ...filaSucursal(sucursal, tachado),
    { emoji: "📅", etiqueta: "FECHA", valor: fechaLegible, tachado },
    { emoji: "🕘", etiqueta: "HORA", valor: horaLegible, tachado }
  ];
  let notaAbonoDueno = null;
  if (cita.precio_es_consultar) {
    filas.push({ emoji: "$", etiqueta: "PRECIO", valor: "Por confirmar" });
    { const pend = filaCertificadoPorAplicar(cita, audiencia); if (pend && tipo !== "cancelada") filas.push(pend); }
    if (certMontoDueno > 0 && tipo !== "cancelada") {
      filas.push({ emoji: "🎁", etiqueta: "CERTIFICADO APLICADO", valor: `-$${certMontoDueno.toFixed(2)} (${cita.certificado_codigo || ""})`, negrita: false });
      const saldoCert = filaSaldoCertificado(cita);
      if (saldoCert) filas.push(saldoCert);
    }
    if (abonoDueno > 0 && tipo !== "cancelada") {
      filas.push({ emoji: "✓", etiqueta: "ABONO YA PAGADO", valor: `$${abonoDueno.toFixed(2)}` });
      notaAbonoDueno = `El precio es "desde", así que el total se confirma con el cliente el día de la cita. Ya pagó $${abonoDueno.toFixed(2)} de abono${certMontoDueno > 0 ? ` y aplicó un certificado de $${certMontoDueno.toFixed(2)}` : ''} — descuéntalo(s) del total acordado.`;
    }
  } else {
    const precioServicioDueno = Number(cita.precio_total) || 0;
    const totalAntesDeAbonoDueno = Math.max(0, precioServicioDueno - certMontoDueno);
    const porPagarDueno = Math.max(0, totalAntesDeAbonoDueno - abonoDueno);
    filas.push({ emoji: "$", etiqueta: "PRECIO DEL SERVICIO", valor: `$${precioServicioDueno.toFixed(2)}`, negrita: false });
    { const pend = filaCertificadoPorAplicar(cita, audiencia); if (pend && tipo !== "cancelada") filas.push(pend); }
    if (certMontoDueno > 0 && tipo !== "cancelada") {
      filas.push({ emoji: "🎁", etiqueta: "CERTIFICADO APLICADO", valor: `-$${certMontoDueno.toFixed(2)} (${cita.certificado_codigo || ""})`, negrita: false });
      const saldoCert = filaSaldoCertificado(cita);
      if (saldoCert) filas.push(saldoCert);
    }
    if (abonoDueno > 0 && tipo !== "cancelada") {
      filas.push({ emoji: "✓", etiqueta: "ABONO YA PAGADO", valor: `-$${abonoDueno.toFixed(2)}`, negrita: false });
    }
    // En una cita cancelada ya no hay nada pendiente de cobrar
    if (tipo !== "cancelada") filas.push({ emoji: "$", etiqueta: "LE FALTA PAGAR", valor: `$${porPagarDueno.toFixed(2)}` });
  }
  const mensajeWaCliente = encodeURIComponent(`Hola ${cita.cliente_nombre || ""}, te escribo de ${nombreLugar} sobre tu cita del ${fechaLegible} a las ${horaLegible}.`);
  const botonContactarCliente = telCliente ? { emoji: "💬", texto: `Contactar a ${cita.cliente_nombre || "cliente"} por WhatsApp`, url: `https://wa.me/${telCliente}?text=${mensajeWaCliente}`, color: "#20c66a" } : null;
  const enSucursal = sucursal ? ` en ${sucursal.nombre}` : "";

  if (tipo === "por_confirmar") {
    return {
      asunto: `Abono por confirmar${enSucursal}: ${cita.cliente_nombre || "Cliente"} — ${nombreNegocio}`,
      html: armarPlantillaCorreo({
        nombreNegocio, tagline, colorAcento, emojiHeader: "🔔",
        titulo: "Nueva reserva por confirmar", saludo: "",
        subtitulo: `Un cliente reservó${enSucursal} y pagó el abono a mano. Revisa que el dinero haya llegado y confírmala.`,
        filas: [...filas, { emoji: "🧾", etiqueta: "COMPROBANTE", valor: cita.comprobante || "—", negrita: false }],
        botones: [botonContactarCliente].filter(Boolean),
        notaTitulo: "¿Dónde la confirmo?",
        notaTexto: "Panel de administración → Citas → Por confirmar abono. Hasta que la confirmes, el cliente no recibe la confirmación y el horario queda apartado.",
        direccion: pie
      })
    };
  }
  if (tipo === "nueva") {
    return {
      asunto: `Nueva cita agendada${enSucursal}: ${cita.cliente_nombre || "Cliente"} — ${nombreNegocio}`,
      html: armarPlantillaCorreo({
        nombreNegocio, tagline, colorAcento, emojiHeader: "📅",
        titulo: "¡Nueva cita agendada!", saludo: "", subtitulo: `Tienes una nueva cita en tu agenda${enSucursal}.`,
        filas,
        botones: [{ emoji: "📆", texto: "Agregar a Google Calendar", url: linkCalendario, color: "#4285F4" }, botonContactarCliente].filter(Boolean),
        notaTitulo: notaAbonoDueno ? "Sobre el abono" : "Recuerda preparar todo para su visita",
        notaTexto: notaAbonoDueno || "Tu cliente tiene una nueva cita en la agenda.",
        direccion: pie
      })
    };
  }
  if (tipo === "reprogramada") {
    return {
      asunto: `Cita reprogramada${enSucursal}: ${cita.cliente_nombre || "Cliente"} — ${nombreNegocio}`,
      html: armarPlantillaCorreo({
        nombreNegocio, tagline, colorAcento, emojiHeader: "🔄",
        titulo: "Cita reprogramada", saludo: "", subtitulo: "Un cliente cambió el horario de su cita.",
        filas,
        botones: [{ emoji: "📆", texto: "Agregar a Google Calendar", url: linkCalendario, color: "#4285F4" }, botonContactarCliente].filter(Boolean),
        notaTitulo: notaAbonoDueno ? "Sobre el abono" : null,
        notaTexto: notaAbonoDueno || null,
        direccion: pie
      })
    };
  }
  return {
    asunto: `Cita cancelada${enSucursal}: ${cita.cliente_nombre || "Cliente"} — ${nombreNegocio}`,
    html: armarPlantillaCorreo({
      nombreNegocio, tagline, colorAcento: "#C2695A", emojiHeader: "✕",
      titulo: "Cita cancelada", saludo: "", subtitulo: subtituloCancelacion(cita, "dueno"),
      filas: [...filas, ...filasCancelacion(cita, "dueno")],
      botones: [botonContactarCliente].filter(Boolean),
      direccion: pie
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
    // El monto NO se muestra aquí: el destinatario lo ve al abrir su regalo.
    // (El comprador sí recibe el monto en su propio correo.)
    const filas = [
      { emoji: "💝", etiqueta: "DE PARTE DE", valor: datos.nombreComprador || "Alguien especial" }
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
  const destinatarios = dirigidoAlNegocio
    ? correosDelNegocio(negocio, correoDueno)
    : [datos?.correoComprador || datos?.correoDestinatario].filter(Boolean);
  if (!destinatarios.length) {
    return new Response(JSON.stringify({ ok: false, error: "Sin destinatario para este correo" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { asunto, html } = armarCorreoCertificado(tipo, negocio, datos || {});
  const resultados = await Promise.all(destinatarios.map((d) => enviarCorreo(d, negocio.nombre || "Tu negocio", asunto, html)));
  const resultado = { ok: resultados.some((r) => r.ok), skipped: resultados.every((r) => r.skipped) };

  return new Response(JSON.stringify({ ok: !!resultado.ok || !!resultado.skipped }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Sucursal de la cita: solo se muestra si el negocio tiene más de una sucursal activa
async function leerSucursalCita(cita) {
  if (!cita.location_id) return null;
  const { count, error: errCount } = await sb.from("locations").select("id", { count: "exact", head: true })
    .eq("business_id", cita.business_id).eq("is_active", true);
  if (errCount) { console.error("No se pudo contar las sucursales:", errCount); return null; }
  if (!count || count < 2) return null;
  const { data: loc, error } = await sb.from("locations").select("name, address, phone").eq("id", cita.location_id).maybeSingle();
  if (error || !loc) { if (error) console.error("No se pudo leer la sucursal:", error); return null; }
  return { nombre: loc.name, direccion: loc.address || "", telefono: loc.phone || "" };
}

async function manejarWebhookCita(payload) {
  const cita = payload.record;
  const anterior = payload.old_record;
  const tipoEvento = payload.type; // 'INSERT' | 'UPDATE'

  if (!cita) return new Response(JSON.stringify({ skipped: true, reason: "sin registro" }), { status: 200 });

  let tipo = null;
  if (tipoEvento === "INSERT") {
    // Abono pagado a mano: todavía no es una cita confirmada
    tipo = cita.estado === "por_confirmar" ? "por_confirmar" : "nueva";
  } else if (tipoEvento === "UPDATE") {
    if (anterior?.estado === "por_confirmar" && cita.estado === "confirmada") {
      // El negocio confirmó el abono: ahora sí sale la confirmación (solo al cliente)
      tipo = "abono_confirmado";
    } else if (cita.estado === "cancelada" && anterior?.estado !== "cancelada") {
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

  // Profesional con quien se reservó (garantía para el cliente y aviso para el negocio)
  let profesional = null;
  if (cita.employee_id) {
    const { data: emp, error: errEmp } = await sb.from("employees").select("nombre").eq("id", cita.employee_id).maybeSingle();
    if (errEmp) console.error("No se pudo leer el profesional:", errEmp);
    profesional = emp?.nombre || null;
  }

  const sucursal = await leerSucursalCita(cita);

  // Clave única por cita, tipo de aviso y horario: si el webhook llega repetido, no se duplican los correos
  const base = [tipo, cita.id, anterior ? `${anterior.fecha}-${anterior.hora}` : "", `${cita.fecha}-${cita.hora}`, cita.estado].join("|");
  const envios = [];
  if (cita.cliente_correo) {
    const { asunto, html } = armarCorreoCita("cliente", tipo, cita, negocio, profesional, sucursal);
    envios.push(enviarCorreo(cita.cliente_correo, negocio.nombre || "Tu negocio", asunto, html, `cliente|${base}|${cita.cliente_correo}`));
  }
  if (tipo !== "abono_confirmado") {
    const { asunto, html } = armarCorreoCita("dueno", tipo, cita, negocio, profesional, sucursal);
    for (const correo of correosDelNegocio(negocio, correoDueno)) {
      envios.push(enviarCorreo(correo, "Annly", asunto, html, `dueno|${base}|${correo}`));
    }
  }

  await Promise.all(envios);
  return new Response(JSON.stringify({ sent: true, tipo }), { status: 200 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.clone().json();

    // Llamada directa: solo se atienden los correos de certificados.
    // Los de citas los manda el webhook de appointments; cualquier otro tipo se ignora.
    if (payload.tipo && payload.businessId) {
      if (!TIPOS_CERTIFICADO.includes(payload.tipo)) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "tipo atendido por el webhook de citas" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
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
