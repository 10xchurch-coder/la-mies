import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticksFor, type Receipt } from '../src/lib/chatTicks';

const R = (d: string | null, r: string | null): Receipt => ({ user_id: 'x', name: 'x', photo_path: null, delivered_at: d, read_at: r });
const T = '2026-11-10T10:00:00Z', AFTER = '2026-11-10T10:05:00Z', BEFORE = '2026-11-10T09:00:00Z';

test('sin nadie más en el chat: un tilde', () => assert.equal(ticksFor(T, []), 'sent'));
test('nadie lo recibió todavía: un tilde', () => assert.equal(ticksFor(T, [R(BEFORE, BEFORE), R(null, null)]), 'sent'));
test('le llegó a todos: dos tildes', () => assert.equal(ticksFor(T, [R(AFTER, null), R(AFTER, BEFORE)]), 'delivered'));
test('a uno le llegó y a otro no: un tilde', () => assert.equal(ticksFor(T, [R(AFTER, null), R(BEFORE, BEFORE)]), 'sent'));
test('lo vieron todos: azul', () => assert.equal(ticksFor(T, [R(AFTER, AFTER), R(AFTER, AFTER)]), 'read'));
test('uno lo vio y otro no (o oculta su visto): no es azul', () => assert.equal(ticksFor(T, [R(AFTER, AFTER), R(AFTER, null)]), 'delivered'));
