// =========================================================
// Edge Function: yappy-ipn
// Yappy llama esto automáticamente (GET) para avisar el estado final del
// pago. Verifica la firma HMAC con el secret del negocio correspondiente
// antes de aceptar el aviso — así nadie puede falsear un "pago ejecutado"
// solo adivinando el orderId.
//
// Deploy: supabase functions deploy yappy-ipn --no-verify-jwt
// (--no-verify-jwt es necesario: Yappy llama este endpoint directo, sin
// mandar ningún token de Supabase)
// =========================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ESTADOS: Record<string, string> = { E: 'ejecutado', R: 'rechazado', C: 'cancelado', X: 'expirado' };

async function hmacSha256Hex(mensaje: string, claveB64: string) {
  // La clave (primera parte del secret_b64 decodificado) es texto plano,
  // no más base64 — se usa tal cual como clave HMAC, igual que en Apps Script.
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(claveB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', key, encoder.encode(mensaje));
  return Array.from(new Uint8Array(firma)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get('orderId') || '';
    const status = url.searchParams.get('status') || '';
    const domain = url.searchParams.get('domain') || '';
    const hash = url.searchParams.get('hash') || '';

    if (!orderId || !status) {
      return new Response(JSON.stringify({ success: false }), { status: 400 });
    }

    const { data: orden } = await supabaseAdmin
      .from('yappy_orders').select('business_id').eq('order_id', orderId).maybeSingle();
    if (!orden) return new Response(JSON.stringify({ success: false }), { status: 404 });

    const { data: cred } = await supabaseAdmin
      .from('yappy_credentials').select('secret_b64').eq('business_id', orden.business_id).maybeSingle();
    if (!cred) return new Response(JSON.stringify({ success: false }), { status: 404 });

    const decoded = atob(cred.secret_b64);
    const claveHmac = decoded.split('.')[0];
    const firmaCalculada = await hmacSha256Hex(orderId + status + domain, claveHmac);

    const success = firmaCalculada === hash;
    if (success) {
      const estadoTxt = ESTADOS[status] || status;
      await supabaseAdmin.from('yappy_orders').update({ estado: estadoTxt }).eq('order_id', orderId);
    } else {
      console.error('Firma HMAC inválida en IPN de Yappy para orderId:', orderId);
    }

    return new Response(JSON.stringify({ success }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error en yappy-ipn:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500 });
  }
});
