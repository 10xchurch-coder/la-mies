import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_CONTACT_URL, DEMO_ERROR_CODE, demoViewFromParam, demoViewOfSession, failedRequestIsDemoBlock, isDemoError, isDemoSession, isOutboundContactUrl, looksLikeDemoBlock,
} from '../src/lib/demoCore';

test('la vista pedida en la dirección', () => {
  assert.equal(demoViewFromParam(undefined), 'pastor');
  assert.equal(demoViewFromParam('pastor'), 'pastor');
  assert.equal(demoViewFromParam('miembro'), 'miembro');
  assert.equal(demoViewFromParam(['Miembro']), 'miembro');
  assert.equal(demoViewFromParam('cualquier cosa'), 'pastor');
});

test('una sesión es de ejemplo solo si la base le puso la marca', () => {
  assert.equal(isDemoSession(null), false);
  assert.equal(isDemoSession({ user: { email: 'pastor@demo.lamies.invalid', app_metadata: {} } }), false);
  assert.equal(isDemoSession({ user: { email: 'x@y.com', app_metadata: { lamies_demo: 'true' } } }), false);
  assert.equal(isDemoSession({ user: { email: 'pastor@demo.lamies.invalid', app_metadata: { lamies_demo: true } } }), true);
  assert.equal(demoViewOfSession({ user: { email: 'miembro@demo.lamies.invalid' } }), 'miembro');
  assert.equal(demoViewOfSession({ user: { email: 'pastor@demo.lamies.invalid' } }), 'pastor');
});

test('el error de la base se reconoce por el código o por el texto', () => {
  assert.equal(isDemoError({ code: DEMO_ERROR_CODE, message: 'x' }), true);
  assert.equal(isDemoError({ message: 'Esto es una demostración: acá no se guardan cambios.' }), true);
  assert.equal(isDemoError('Esto es una demostración: esta cuenta no se puede cambiar.'), true);
  assert.equal(isDemoError({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isDemoError(null), false);
});

test('qué pedidos fallidos son el candado de la demostración', () => {
  const rest = 'https://x.supabase.co/rest/v1/prayer_requests';
  assert.equal(failedRequestIsDemoBlock('POST', rest, 400, '{"code":"DM001","message":"Esto es una demostración: acá no se guardan cambios."}'), true);
  assert.equal(failedRequestIsDemoBlock('POST', rest, 201, ''), false);
  assert.equal(failedRequestIsDemoBlock('POST', rest, 400, '{"code":"23505","message":"duplicate"}'), false);
  assert.equal(failedRequestIsDemoBlock('GET', rest, 401, '{"message":"JWT expired"}'), false);
  // archivos: la regla de la base no trae el código
  assert.equal(failedRequestIsDemoBlock('POST', 'https://x.supabase.co/storage/v1/object/photos/a/b.jpg', 400, '{"message":"new row violates row-level security policy"}'), true);
  assert.equal(failedRequestIsDemoBlock('DELETE', 'https://x.supabase.co/storage/v1/object/photos', 400, '{}'), true);
  assert.equal(failedRequestIsDemoBlock('POST', 'https://x.supabase.co/storage/v1/object/sign/photos/a/b.jpg', 400, '{}'), false);
  // la cuenta
  assert.equal(failedRequestIsDemoBlock('PUT', 'https://x.supabase.co/auth/v1/user', 500, '{"msg":"Database error updating user"}'), true);
  assert.equal(failedRequestIsDemoBlock('POST', 'https://x.supabase.co/auth/v1/factors', 500, '{}'), true);
  assert.equal(failedRequestIsDemoBlock('POST', 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token', 400, '{}'), false);
});

test('mensajes que en la demostración son el candado', () => {
  assert.equal(looksLikeDemoBlock('new row violates row-level security policy'), true);
  assert.equal(looksLikeDemoBlock('Unexpected failure, please check server logs for more information'), true);
  assert.equal(looksLikeDemoBlock('Falta el nombre'), false);
  assert.equal(looksLikeDemoBlock(null), false);
});

test('en la demostración no se abre WhatsApp ni el teléfono, pero sí el correo de La Mies', () => {
  assert.equal(isOutboundContactUrl('https://wa.me/5491005550012?text=Hola'), true);
  assert.equal(isOutboundContactUrl('https://api.whatsapp.com/send?phone=549'), true);
  assert.equal(isOutboundContactUrl('whatsapp://send?phone=549'), true);
  assert.equal(isOutboundContactUrl('tel:+5491005550012'), true);
  assert.equal(isOutboundContactUrl('sms:+549100'), true);
  assert.equal(isOutboundContactUrl('mailto:alguien@ejemplo.com'), true);
  assert.equal(isOutboundContactUrl(DEMO_CONTACT_URL), false);
  assert.equal(isOutboundContactUrl('https://www.openstreetmap.org/'), false);
  assert.equal(isOutboundContactUrl('https://www.google.com/maps/search/?api=1&query=-37.45,-66.6'), false);
  assert.equal(isOutboundContactUrl(''), false);
});
