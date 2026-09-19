// =========================================================
// Edge Function: yappy-crear-orden
// Valida el comercio y crea la orden de pago en Yappy, usando las
// credenciales propias del negocio (nunca las del navegador).
//
// Deploy: supabase functions deploy yappy-crear-orden
// (No necesita secretos nuevos — las credenciales viven por negocio en
// la tabla yappy_credentials, no en variables de entorno.)
// =========================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YAPPY_API_BASE = 'https://apipagosbg.bgeneral.cloud';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { businessId, orderId: orderIdRaw, total, aliasYappy: aliasRaw, tipo, refId } = await req.json();

    const orderId = String(orderIdRaw || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 15);
    const aliasYappy = String(aliasRaw || '').replace(/[^0-9]/g, '');
    const totalNum = Number(total) || 0;

    if (!businessId || !orderId || totalNum <= 0) {
      return json({ ok: false, error: 'Faltan datos: businessId, orderId o total inválido' }, 400);
    }
    if (!aliasYappy || aliasYappy.length < 7) {
      return json({ ok: false, error: 'Falta el número de teléfono Yappy del cliente' }, 400);
    }

    const { data: cred, error: errCred } = await supabaseAdmin
      .from('yappy_credentials')
      .select('merchant_id, secret_b64, dominio_registrado, activo')
      .eq('business_id', businessId)
      .maybeSingle();

    if (errCred || !cred || !cred.activo) {
      return json({ ok: false, error: 'Este negocio no tiene Yappy Comercial activo' }, 404);
    }

    // Paso 1: validar el comercio con Yappy y obtener el token de sesión.
    const validaResp = await fetch(`${YAPPY_API_BASE}/payments/validate/merchant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantId: cred.merchant_id, urlDomain: cred.dominio_registrado }),
    });
    const validaData = await validaResp.json();
    if (!validaData?.body?.token) {
      console.error('Error validando comercio Yappy:', validaData);
      return json({ ok: false, error: 'No se pudo validar el comercio con Yappy', detalle: validaData }, 502);
    }
    const authToken = validaData.body.token;
    const epochTime = validaData.body.epochTime;

    // Paso 2: crear la orden de pago.
    const ipnUrl = `${SUPABASE_URL}/functions/v1/yappy-ipn`;
    const ordenResp = await fetch(`${YAPPY_API_BASE}/payments/payment-wc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authToken },
      body: JSON.stringify({
        merchantId: cred.merchant_id,
        orderId,
        domain: cred.dominio_registrado,
        paymentDate: String(epochTime),
        aliasYappy,
        ipnUrl,
        discount: '0.00',
        taxes: '0.00',
        subtotal: totalNum.toFixed(2),
        total: totalNum.toFixed(2),
      }),
    });
    const ordenData = await ordenResp.json();
    if (!ordenData?.body?.token) {
      console.error('Error creando orden Yappy:', ordenData);
      return json({ ok: false, error: 'No se pudo crear la orden en Yappy', detalle: ordenData }, 502);
    }

    const { error: errInsert } = await supabaseAdmin.from('yappy_orders').insert([{
      business_id: businessId, order_id: orderId, tipo: tipo || null, ref_id: refId || null,
      total: totalNum, estado: 'pendiente',
    }]);
    if (errInsert) console.error('No se pudo registrar la orden Yappy:', errInsert);

    return json({
      ok: true,
      transactionId: ordenData.body.transactionId,
      token: ordenData.body.token,
      documentName: ordenData.body.documentName,
      orderId,
    });
  } catch (err) {
    console.error('Error en yappy-crear-orden:', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
