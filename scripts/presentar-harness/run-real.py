#!/usr/bin/env python3
"""Prueba el Modo presentación en la app web DE VERDAD (lo que arma `expo export`), con una sesión de mentira.

Toda la red hacia Supabase se contesta acá adentro (nada llega a la base real) y el tiempo real entre aparatos
se corta a propósito: se prueba lo que pasa en una misma computadora (operador, salida, escenario y control).

    npx expo export --platform web --output-dir /tmp/presentar-web
    python3 scripts/presentar-harness/run-real.py /tmp/presentar-web

OJO: exportar desde una carpeta con node_modules de verdad. Con node_modules como link (los worktrees),
el export "anda" pero sale sin ninguna pantalla ("No routes found").
"""
import base64
import http.server
import json
import os
import sys
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/presentar-web'
BASE = '/la-mies'
REF = 'kntylzdronpglqqgroqv'
results, errors, calls = [], [], []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('  ok   ' if ok else '  FALLA ') + name + (f'  [{detail}]' if detail and not ok else ''), flush=True)


class Pages(http.server.SimpleHTTPRequestHandler):
    """Como GitHub Pages: la app vive en /la-mies y una dirección que no es un archivo devuelve la app (404.html)."""
    def log_message(self, *a, **k):
        pass

    def translate_path(self, path):
        path = path.split('?')[0].split('#')[0]
        if path.startswith(BASE):
            path = path[len(BASE):] or '/'
        full = os.path.join(ROOT, path.lstrip('/'))
        if os.path.isdir(full):
            full = os.path.join(full, 'index.html')
        return full if os.path.exists(full) else os.path.join(ROOT, 'index.html')


def b64(o):
    return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')


EXP = int(time.time()) + 5 * 3600
JWT = f"{b64({'alg': 'HS256', 'typ': 'JWT'})}.{b64({'sub': 'u1', 'role': 'authenticated', 'exp': EXP, 'aud': 'authenticated', 'email': 'prueba@ejemplo.test'})}.firma"
USER = {'id': 'u1', 'aud': 'authenticated', 'role': 'authenticated', 'email': 'prueba@ejemplo.test', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}
SESSION = {'access_token': JWT, 'token_type': 'bearer', 'expires_in': 18000, 'expires_at': EXP, 'refresh_token': 'r', 'user': USER}
ITEMS = [
    {'id': 'cancion', 'type': 'song', 'title': 'Canción de prueba', 'songId': None, 'lyrics': 'Primera estrofa\nsegunda línea\n\n[Coro]\nAleluya\nAleluya\n\nEstrofa final', 'auto': False, 'secs': 15, 'speed': 1, 'audio': None},
    {'id': 'pasaje', 'type': 'passage', 'title': '', 'ref': 'Juan 3:16-17', 'version': 'rv1909', 'perSlide': 1},
    {'id': 'predica', 'type': 'sermon', 'title': 'Prédica', 'outline': 'El amor de Dios\n1. Dios ama a todos (Ro 5:8)', 'version': 'rv1909', 'perSlide': 1},
]
saved = {'n': 0}


def supabase(route):
    req = route.request
    path = req.url.split('.supabase.co')[1].split('?')[0]
    calls.append(f'{req.method} {path}')
    single = 'vnd.pgrst.object' in (req.headers.get('accept') or '')

    def ok(body, status=200):
        route.fulfill(status=status, content_type='application/json', body=json.dumps(body))
    if path.startswith('/auth/v1/user'):
        return ok(USER)
    if path.startswith('/auth/v1/'):
        return ok(SESSION)
    if path == '/rest/v1/rpc/my_profile':
        return ok({'id': 'u1', 'church_id': 'c1', 'display_name': 'Persona de Prueba', 'role': 'pastor', 'roles': ['pastor'], 'group_id': None, 'rules_accepted_at': '2026-01-01T00:00:00Z'})
    if path == '/rest/v1/rpc/my_permissions':
        return ok(['personas.ver_todas', 'inf.panel', 'presentar.usar'])
    if path == '/rest/v1/churches':
        return ok({'id': 'c1', 'name': 'Iglesia de Prueba', 'disabled_features': [], 'logo_path': None})
    if path == '/rest/v1/present_sets':
        if req.method != 'GET':
            saved['n'] += 1
            return ok({'id': 'set1'} if single else [])
        row = {'id': 'set1', 'name': 'Culto de prueba', 'items': ITEMS, 'updated_at': '2026-11-24T10:00:00Z'}
        return ok(row if single else [row])
    if path == '/rest/v1/service_plans':
        return ok({'code': '42P01', 'message': 'relation "public.service_plans" does not exist'}, 404)
    if path.startswith('/rest/v1/rpc/'):
        return ok(None)
    if single:
        return ok({'code': 'PGRST116', 'message': '0 rows'}, 406)
    return ok([])


CHROME = ['Pantalla completa', 'Salir de pantalla completa', 'Cerrar']


def shown(page):
    lines = [l.strip() for l in page.inner_text('body').split('\n') if l.strip()]
    return '\n'.join(l for l in lines if l not in CHROME)


def wait_text(page, text, timeout=5000):
    try:
        page.wait_for_function('t => document.body.innerText.includes(t)', arg=text, timeout=timeout)
        return True
    except Exception:
        return False


def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Pages)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{srv.server_address[1]}{BASE}'
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={'width': 1400, 'height': 900})
        ctx.route('**/*.supabase.co/**', supabase)
        # Nada de tiempo real contra la base de verdad: el WebSocket de esta página nunca conecta.
        ctx.add_init_script('''window.WebSocket = class {
          constructor() { this.readyState = 3; setTimeout(() => { this.onerror && this.onerror(new Event("error")); this.onclose && this.onclose({ code: 1006, reason: "prueba" }); }, 20); }
          send() {} close() {} addEventListener() {} removeEventListener() {}
        };''')
        ctx.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(SESSION))});")

        def watch(page, who):
            page.on('pageerror', lambda e: errors.append(f'{who}: {str(e)[:300]}'))
            return page

        op = watch(ctx.new_page(), 'operador')
        op.goto(base + '/presentar')
        check('la app real abre el Modo presentación (con sesión de mentira)', wait_text(op, 'Nueva lista del culto', 15000), op.url)
        op.get_by_text('Culto de prueba').first.click(timeout=8000)
        check('abre la lista en el operador', wait_text(op, 'EN PANTALLA'))
        check('sin la tabla del orden del culto, el botón no aparece y nada se rompe', op.get_by_text('Traer el orden del culto').count() == 0)
        with ctx.expect_page() as pop:
            op.get_by_text('Abrir pantalla de salida', exact=True).first.click()
        out = watch(pop.value, 'salida')
        out.wait_for_load_state()
        check('la salida se abre en /la-mies/presentar/salida (otra ventana, dirección directa)', out.url.rstrip('/').endswith('/la-mies/presentar/salida'), out.url)
        check('la salida carga y espera', wait_text(out, 'Acá va a aparecer', 15000), shown(out)[:100])
        check('el título de la ventana es "Pantalla de salida"', out.title() == 'Pantalla de salida', out.title())

        op.get_by_test_id('presentar-parte').filter(has_text='Canción de prueba').first.click()
        op.get_by_label('Mostrar diapositiva 1', exact=True).first.click()
        check('la letra llega a la salida', wait_text(out, 'Primera estrofa'))
        op.locator('body').click(position={'x': 5, 'y': 5})
        op.keyboard.press('ArrowRight')
        check('flecha derecha', wait_text(out, 'Aleluya'))
        op.keyboard.press('b')
        out.wait_for_timeout(400)
        check('B: negro', shown(out) == '', shown(out))
        op.keyboard.press('b')
        check('B: vuelve', wait_text(out, 'Aleluya'))
        op.keyboard.press('l')
        check('L: logo (nombre de la iglesia)', wait_text(out, 'Iglesia de Prueba'))
        op.keyboard.press('l')
        wait_text(out, 'Aleluya')
        out.bring_to_front()
        out.locator('body').click(position={'x': 600, 'y': 500})
        out.keyboard.press('ArrowRight')
        check('teclado en la ventana de salida', wait_text(out, 'Estrofa final'))
        out.keyboard.press('ArrowRight')
        check('pasaje con el texto de la Biblia', wait_text(out, 'Juan 3:16 (RV1909)') and 'de tal manera amó Dios' in shown(out))
        out.keyboard.press('ArrowRight')
        out.keyboard.press('ArrowRight')
        check('prédica: título', wait_text(out, 'El amor de Dios'))
        out.keyboard.press('ArrowRight')
        out.keyboard.press('ArrowRight')
        check('prédica: cita abreviada abierta', wait_text(out, 'Romanos 5:8 (RV1909)'))

        op.bring_to_front()
        with ctx.expect_page() as pop:
            op.get_by_text('Abrir vista de escenario', exact=True).first.click()
        st = watch(pop.value, 'escenario')
        st.wait_for_load_state()
        check('la vista de escenario abre en /la-mies/presentar/escenario', st.url.rstrip('/').endswith('/la-mies/presentar/escenario'), st.url)
        check('escenario: muestra lo que hay y que no hay más', wait_text(st, 'AHORA EN PANTALLA', 15000) and wait_text(st, 'No hay más diapositivas'), st.inner_text('body')[:200])
        op.keyboard.press('ArrowLeft')
        check('escenario: lo que sigue', wait_text(st, 'SIGUE') and wait_text(st, 'Porque Dios encarece') or wait_text(st, 'Mas Dios encarece'), st.inner_text('body')[:300])

        ctl = watch(ctx.new_page(), 'control')
        ctl.goto(base + '/presentar/control')
        ctl.get_by_label('Anterior', exact=True).first.wait_for(timeout=15000)
        ctl.wait_for_timeout(500)
        ctl.get_by_label('Anterior', exact=True).first.click()
        check('control remoto (dirección directa): "Anterior" da un paso', wait_text(out, 'El amor de Dios') and 'Romanos 5:8 (RV1909)' not in shown(out), shown(out))
        ctl.close()

        out.reload()
        check('recargar la salida (dirección directa): vuelve con lo último', wait_text(out, 'El amor de Dios', 15000))

        # Los carteles de toda la app no van al proyector.
        ctx.set_offline(True)
        for page in (op, out, st):
            page.evaluate("window.dispatchEvent(new Event('offline'))")
        badge = wait_text(op, 'Sin conexión ·', 20000)
        check('sin internet, el operador ve el cartel "Sin conexión"', badge, op.inner_text('body')[-200:])
        out.wait_for_timeout(1500)
        check('...pero el cartel NO sale en la pantalla de salida', 'Sin conexión ·' not in out.inner_text('body'), shown(out))
        check('...ni en la vista de escenario', 'Sin conexión ·' not in st.inner_text('body'))
        op.keyboard.press('ArrowRight')
        check('sin internet, la misma computadora sigue andando', wait_text(out, '1. Dios ama a todos'))
        ctx.set_offline(False)
        browser.close()
    srv.shutdown()
    for e in errors:
        print('  ERROR de la página:', e)
    check('ninguna pantalla tiró errores', not errors, f'{len(errors)}')
    bad = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(bad)} de {len(results)} pruebas bien. La lista se guardó {saved["n"]} veces. Pedidos a la base (de mentira): {sorted(set(calls))}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
