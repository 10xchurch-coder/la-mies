// Lee la foto de un recibo (total, comercio, fecha, categoría) o la captura del banco (saldo disponible).
// Solo para quien puede cargar finanzas. Necesita el secreto ANTHROPIC_API_KEY; sin él responde { error: 'sin_clave' } y la app sigue sin leer.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'sin_clave' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') ?? '';
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: level } = await user.rpc('finance_level');
  if (!level || Number(level) < 2) return json({ error: 'sin_permiso' }, 403);

  const body = await req.json().catch(() => ({}));
  const path = String(body.path ?? '');
  const mode = body.mode === 'bank' ? 'bank' : 'receipt';
  const categories: string[] = Array.isArray(body.categories) ? body.categories.slice(0, 80).map(String) : [];
  const { data: churchId } = await user.rpc('current_church_id');
  if (!churchId || !path.startsWith(`finance/${churchId}/`) || /\.pdf$/i.test(path)) return json({ error: 'archivo' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: file, error } = await admin.storage.from('finance').download(path);
  if (error || !file) return json({ error: 'archivo' }, 404);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b64 = btoa(bin);

  const ask = mode === 'bank'
    ? 'Esta es una captura de la app de un banco de Argentina. Devolvé SOLO un JSON: {"balance": número o null, "currency": "ARS" o "USD" o null}. "balance" es el saldo disponible de la cuenta en pesos (si hay varias, la cuenta en pesos principal). Usá punto decimal y sin separador de miles. Si no se ve el saldo, null.'
    : `Este es un ticket, factura o recibo de Argentina. Devolvé SOLO un JSON: {"total": número o null, "currency": "ARS" o "USD" o null, "vendor": "nombre del comercio" o null, "date": "AAAA-MM-DD" o null, "category": una de [${categories.map((c) => JSON.stringify(c)).join(', ')}] o null}. "total" es el importe total pagado (no el subtotal). Usá punto decimal y sin separador de miles.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('RECEIPT_MODEL') ?? 'claude-haiku-5-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: b64 } },
        { type: 'text', text: ask },
      ] }],
    }),
  });
  if (!r.ok) return json({ error: 'lectura' }, 502);
  const out = await r.json();
  const text: string = out?.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return json({ error: 'lectura' }, 502);
  try {
    const p = JSON.parse(m[0]);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
    if (mode === 'bank') return json({ balance: num(p.balance), currency: p.currency === 'USD' ? 'USD' : p.currency === 'ARS' ? 'ARS' : null });
    return json({
      total: num(p.total), currency: p.currency === 'USD' ? 'USD' : p.currency === 'ARS' ? 'ARS' : null,
      vendor: typeof p.vendor === 'string' ? p.vendor.slice(0, 120) : null,
      date: typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null,
      category: typeof p.category === 'string' && categories.includes(p.category) ? p.category : null,
    });
  } catch { return json({ error: 'lectura' }, 502); }
});
