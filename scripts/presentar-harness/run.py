#!/usr/bin/env python3
"""Prueba el Modo presentación en un navegador de verdad (Playwright + Chromium), con datos de mentira.

    python3 scripts/presentar-harness/run.py            # arma el banco de pruebas, lo sirve y corre todo
    python3 scripts/presentar-harness/run.py --fotos    # además deja capturas en /tmp/presentar-harness-fotos

No entra a la app ni toca la base: ver build.mjs. Sale con 1 si algo falla.
"""
import base64
import functools
import http.server
import json
import os
import subprocess
import sys
import threading
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = '/tmp/presentar-harness'
SHOTS = '/tmp/presentar-harness-fotos'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
results = []
errors = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('  ok   ' if ok else '  FALLA ') + name + (f'  [{detail}]' if detail and not ok else ''), flush=True)


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass
    handler = functools.partial(Quiet, directory=OUT)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}'


def watch(page, who):
    page.on('pageerror', lambda e: errors.append(f'{who}: {str(e)[:300]}'))
    page.on('console', lambda m: errors.append(f'{who} consola: {m.text[:300]}') if m.type == 'error' and 'archivos.prueba' not in m.text and 'net::ERR' not in m.text else None)
    return page


CHROME = ['Pantalla completa', 'Salir de pantalla completa', 'Cerrar']


def shown(page):
    """Lo que se lee en la pantalla de salida, sin los botones de ayuda."""
    lines = [l.strip() for l in page.inner_text('body').split('\n') if l.strip()]
    return '\n'.join(l for l in lines if l not in CHROME)


def wait_text(page, text, timeout=4000):
    try:
        page.wait_for_function('t => document.body.innerText.includes(t)', arg=text, timeout=timeout)
        return True
    except Exception:
        return False


def wait_gone(page, text, timeout=4000):
    try:
        page.wait_for_function('t => !document.body.innerText.includes(t)', arg=text, timeout=timeout)
        return True
    except Exception:
        return False


def button(page, title):
    return page.get_by_role('button', name=title, exact=True).first


def open_set(page, base, path='/presentar/'):
    page.goto(base + path)
    page.get_by_text('Culto de prueba').first.click()
    page.get_by_text('EN PANTALLA').first.wait_for()


def row(page, title):
    """Una parte de la lista del culto, por su nombre."""
    return page.get_by_test_id('presentar-parte').filter(has_text=title).first


def thumb(page, n):
    return page.get_by_label(f'Mostrar diapositiva {n}', exact=True).first


def new_context(browser, size=(1400, 900)):
    ctx = browser.new_context(viewport={'width': size[0], 'height': size[1]})
    ctx.route('https://archivos.prueba/**', lambda r: r.fulfill(body=PNG, content_type='image/png') if r.request.url.endswith('.png') else r.abort())
    return ctx


def wrapped_lines(page):
    """Cuántos renglones de la letra se cortaron en dos (0 = cada renglón entra entero)."""
    return page.evaluate("""() => {
      let n = 0;
      for (const el of document.querySelectorAll('#root div[dir="auto"]')) {
        if (!el.textContent.trim() || el.closest('[role=button]')) continue;
        const cs = getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight);
        if (!lh) continue;
        const want = el.textContent.split('\\n').length;
        n += Math.max(0, Math.round(el.getBoundingClientRect().height / lh) - want);
      }
      return n;
    }""")


def overflow(page):
    """¿Algún texto se sale de la pantalla? Devuelve cuántos píxeles (0 = entra todo)."""
    return page.evaluate('''() => {
      let worst = 0;
      const w = window.innerWidth, h = window.innerHeight;
      for (const el of document.querySelectorAll('#root div[dir="auto"]')) {
        if (!el.textContent.trim() || el.closest('[role=button]')) continue;
        const r = el.getBoundingClientRect();
        worst = Math.max(worst, r.bottom - h, r.right - w, -r.top, -r.left);
      }
      return Math.round(worst);
    }''')


def main():
    fotos = '--fotos' in sys.argv
    subprocess.run(['node', os.path.join(HERE, 'build.mjs'), OUT], cwd=ROOT, check=True)
    if fotos:
        os.makedirs(SHOTS, exist_ok=True)
    srv, base = serve()

    def foto(page, name):
        if fotos:
            page.screenshot(path=os.path.join(SHOTS, name + '.png'))

    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        # ------------------------------------------------------------------ 1. Operador -> pantalla de salida
        print('1. Operador y pantalla de salida (dos ventanas)')
        ctx = new_context(browser)
        op = watch(ctx.new_page(), 'operador')
        open_set(op, base)
        check('sin orden del culto en la base, el botón no aparece', op.get_by_text('Traer el orden del culto').count() == 0)
        with ctx.expect_page() as pop:
            button(op, 'Abrir pantalla de salida').click()
        out = watch(pop.value, 'salida')
        out.wait_for_load_state()
        out.set_viewport_size({'width': 1280, 'height': 720})
        check('la salida se abre en /presentar/salida', out.url.rstrip('/').endswith('/presentar/salida'), out.url)
        check('la salida arranca con el cartel de ayuda', wait_text(out, 'Acá va a aparecer'))

        row(op, 'Canción de prueba').click()
        thumb(op, 1).click()
        check('la primera estrofa llega a la salida', wait_text(out, 'Primera estrofa'))
        check('el cartel de ayuda se va', wait_gone(out, 'Acá va a aparecer'))
        foto(out, '01-salida-cancion')

        # Teclado en el operador
        op.locator('body').click(position={'x': 5, 'y': 5})
        op.keyboard.press('ArrowRight')
        check('flecha derecha: pasa al coro', wait_text(out, 'Aleluya'))
        op.keyboard.press('Space')
        check('espacio: pasa a la estrofa final', wait_text(out, 'Estrofa final'))
        op.keyboard.press('ArrowLeft')
        check('flecha izquierda: vuelve al coro', wait_text(out, 'Aleluya') and 'Estrofa final' not in shown(out))
        op.keyboard.press('b')
        check('B: la salida queda en negro', wait_gone(out, 'Aleluya') and shown(out) == '', shown(out))
        op.keyboard.press('b')
        check('B otra vez: vuelve lo que estaba', wait_text(out, 'Aleluya'))
        op.keyboard.press('l')
        check('L: el logo (nombre de la iglesia)', wait_text(out, 'Iglesia de Prueba') and 'Aleluya' not in shown(out))
        op.keyboard.down('l')
        for _ in range(6):
            op.keyboard.down('l')  # tecla apretada: se repite
        op.keyboard.up('l')
        op.wait_for_timeout(300)
        check('L apretada no parpadea (se toma una vez)', 'Aleluya' in shown(out), shown(out))
        op.keyboard.press('l')
        wait_text(out, 'Iglesia de Prueba')
        op.keyboard.press('PageDown')
        check('desde el logo, "siguiente" muestra la diapositiva que sigue', wait_text(out, 'Estrofa final'))
        # Con la música (sin diapositivas) en el medio: pasa de largo hasta el pasaje.
        op.keyboard.press('ArrowRight')
        check('al terminar la canción saltea la música y sigue con el pasaje', wait_text(out, 'Juan 3:16 (RV1909)'))
        check('el versículo trae el texto de la Biblia', 'de tal manera amó Dios' in shown(out), shown(out)[:80])

        # Escribir en un campo no pasa diapositivas
        row(op, 'Texto').click()
        button(op, 'Cambiar').click()
        field = op.locator('textarea').first
        field.click()
        field.press('End')
        op.keyboard.type(' b l ')
        op.keyboard.press('ArrowLeft')
        op.wait_for_timeout(300)
        check('escribir en un campo no mueve la pantalla', 'Juan 3:16 (RV1909)' in shown(out), shown(out)[:60])
        button(op, 'Listo').click()

        # Teclado en la ventana de salida
        out.bring_to_front()
        out.locator('body').click(position={'x': 640, 'y': 400})
        out.keyboard.press('ArrowRight')
        check('teclado en la ventana de salida: también pasa', wait_text(out, 'Juan 3:17 (RV1909)'))
        out.keyboard.press('ArrowRight')
        check('...y pasa de a una', wait_text(out, 'Juan 3:18 (RV1909)'))

        # Foto, video, texto, anuncio
        op.bring_to_front()
        row(op, 'Foto').click()
        thumb(op, 1).click()
        try:
            out.wait_for_selector('img[src="https://archivos.prueba/c1/foto.png"], [style*="archivos.prueba/c1/foto.png"]', timeout=4000, state='attached')
            check('la foto llega a la salida', True)
        except Exception:
            check('la foto llega a la salida', False, out.content()[-400:])
        row(op, 'Video').click()
        thumb(op, 1).click()
        try:
            out.wait_for_selector('video[src="https://archivos.prueba/c1/video.mp4"]', timeout=4000, state='attached')
            check('el video llega a la salida (etiqueta <video>)', True)
        except Exception:
            check('el video llega a la salida (etiqueta <video>)', False)
        check('el operador ve "Video en pantalla" y sus botones', wait_text(op, 'Video en pantalla') and button(op, 'Pausar video').count() == 1)
        button(op, 'Pausar video').click()
        check('pausar video: el operador ve "Video en pausa"', wait_text(op, 'Video en pausa'))
        row(op, 'Reunión de jóvenes').click()
        thumb(op, 1).click()
        check('el anuncio llega con título y detalle', wait_text(out, 'Reunión de jóvenes') and 'Sábado a las 19' in shown(out))
        check('al salir del video ya no hay <video>', out.locator('video').count() == 0)

        # Cuenta regresiva
        row(op, 'Cuenta regresiva').click()
        thumb(op, 1).click()
        check('cuenta regresiva: arranca en 2:00', wait_text(out, '2:00') or wait_text(out, '1:59'))
        out.wait_for_timeout(2300)
        t = shown(out)
        check('cuenta regresiva: baja sola', '1:58' in t or '1:57' in t, t)
        op.keyboard.press('b')
        out.wait_for_timeout(1200)
        op.keyboard.press('b')
        out.wait_for_timeout(400)
        t = shown(out)
        check('cuenta regresiva: pasar por negro no la reinicia', '1:5' in t and '2:00' not in t and '1:59' not in t, t)

        # Música y pista
        row(op, 'Música de fondo').click()
        button(op, 'Reproducir').click()
        check('música: suena en el operador', wait_text(op, 'Sonando: fondo.mp3'))
        log = op.evaluate('window.__audio')
        check('música: se pidió el archivo correcto', any(e['uri'].endswith('c1/fondo.mp3') and e['event'] == 'play' for e in log), json.dumps(log))
        check('música: la pantalla queda como estaba', '1:5' in shown(out) or '1:4' in shown(out), shown(out))
        button(op, 'Parar').first.click()
        check('música: parar', wait_gone(op, 'Sonando: fondo.mp3'))

        # ------------------------------------------------------------------ 2. Control remoto (una orden = un paso)
        print('2. Control remoto')
        row(op, 'Canción de prueba').click()
        thumb(op, 1).click()
        wait_text(out, 'Primera estrofa')
        ctl = watch(ctx.new_page(), 'control')
        ctl.goto(base + '/presentar/control/')
        ctl.get_by_label('Siguiente', exact=True).first.wait_for()
        ctl.wait_for_timeout(400)
        ctl.get_by_label('Siguiente', exact=True).first.click()
        check('control: "Siguiente" pasa una diapositiva', wait_text(out, 'Aleluya'))
        out.wait_for_timeout(500)
        check('control: la orden llega por dos caminos y se toma UNA vez', 'Aleluya' in shown(out) and 'Estrofa final' not in shown(out), shown(out))
        ctl.get_by_label('Anterior', exact=True).first.click()
        check('control: "Anterior"', wait_text(out, 'Primera estrofa'))
        check('control: ve en chico lo que está en pantalla', wait_text(ctl, 'Primera estrofa'))
        button(ctl, 'Negro').click()
        check('control: "Negro"', wait_gone(out, 'Primera estrofa'))
        button(ctl, 'Negro').click()
        check('control: "Negro" otra vez vuelve', wait_text(out, 'Primera estrofa'))
        ctl.close()

        # ------------------------------------------------------------------ 3. Vista de escenario
        print('3. Vista de escenario')
        with ctx.expect_page() as pop:
            button(op, 'Abrir vista de escenario').click()
        st = watch(pop.value, 'escenario')
        st.wait_for_load_state()
        st.set_viewport_size({'width': 1280, 'height': 720})
        check('escenario: se abre en /presentar/escenario', st.url.rstrip('/').endswith('/presentar/escenario'), st.url)
        check('escenario: apenas abre ya muestra lo que hay (sin esperar)', wait_text(st, 'AHORA EN PANTALLA') and wait_text(st, 'Primera estrofa'))
        check('escenario: lo que sigue, con su título', wait_text(st, 'SIGUE · Coro') and 'Aleluya' in st.inner_text('body'))
        check('escenario: dice la parte y el número', 'Canción de prueba · 1 de 3' in st.inner_text('body'), st.inner_text('body'))
        hhmm = st.evaluate("(() => { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); })()")
        check('escenario: la hora', hhmm in st.inner_text('body'), hhmm)
        foto(st, '02-escenario')
        op.bring_to_front()
        op.keyboard.press('ArrowRight')
        op.keyboard.press('ArrowRight')
        check('escenario: al final de la canción avisa la parte que viene', wait_text(st, 'SIGUE · Juan 3:16-18'), st.inner_text('body'))
        op.keyboard.press('b')
        check('escenario: avisa que la pantalla está en negro y sigue mostrando lo que viene', wait_text(st, 'PANTALLA EN NEGRO') and 'SIGUE · Juan 3:16-18' in st.inner_text('body'))
        op.keyboard.press('b')
        check('escenario: nada se sale de la pantalla', overflow(st) <= 0, str(overflow(st)))
        st.set_viewport_size({'width': 420, 'height': 800})
        st.wait_for_timeout(300)
        check('escenario en un teléfono parado: nada se sale', overflow(st) <= 0, str(overflow(st)))
        foto(st, '03-escenario-telefono')
        st.close()

        # ------------------------------------------------------------------ 4. El texto entra en la pantalla
        print('4. Tamaño de la letra')
        row(op, 'Canción larga').click()
        for size in [(1280, 720), (1920, 1080), (1024, 768), (640, 360)]:
            out.set_viewport_size({'width': size[0], 'height': size[1]})
            worst = 0
            for n in (1, 2):
                thumb(op, n).click()
                wait_text(out, 'estrofa número 1' if n == 1 else 'estrofa número 5')
                out.wait_for_timeout(150)
                worst = max(worst, overflow(out))
            row(op, 'Juan 3:16-18').click()
            thumb(op, 1).click()
            wait_text(out, 'Juan 3:16 (RV1909)')
            out.wait_for_timeout(150)
            worst = max(worst, overflow(out))
            row(op, 'Canción en mayúsculas').click()
            thumb(op, 1).click()
            wait_text(out, 'CUÁN GRANDE ES ÉL, MI DIOS')
            out.wait_for_timeout(150)
            caps = overflow(out)
            row(op, 'Texto apretado').click()
            tight = 0
            for n in (1, 2):
                thumb(op, n).click()
                wait_text(out, 'Supercali' if n == 1 else 'Un párrafo largo')
                out.wait_for_timeout(150)
                tight = max(tight, overflow(out))
            row(op, 'Canción larga').click()
            check(f'letra larga y versículo entran en {size[0]}x{size[1]}', worst <= 0, f'se sale {worst}px')
            check(f'letra en MAYÚSCULAS entra en {size[0]}x{size[1]}', caps <= 0, f'se sale {caps}px')
            check(f'palabra larguísima y párrafo largo entran en {size[0]}x{size[1]}', tight <= 0, f'se sale {tight}px')
        row(op, 'Canción de renglones medianos').click()
        thumb(op, 1).click()
        wait_text(out, 'que a un infeliz salvó')
        out.wait_for_timeout(150)
        check('los renglones de la letra no se cortan (se achica un poco la letra)', wrapped_lines(out) == 0, str(wrapped_lines(out)))
        row(op, 'Canción larga').click()
        check('la estrofa de 8 líneas se partió en 2 de 4', op.get_by_label('Mostrar diapositiva 3', exact=True).count() == 0 and thumb(op, 2).count() == 1)
        out.set_viewport_size({'width': 1280, 'height': 720})
        foto(out, '04-salida-letra-larga')

        # ------------------------------------------------------------------ 5. Recargar en medio del culto
        print('5. Recargar el operador en medio del culto')
        row(op, 'Canción de prueba').click()
        thumb(op, 2).click()
        wait_text(out, 'Aleluya')
        op.wait_for_timeout(1600)  # que termine de guardar
        op.reload()
        op.get_by_text('Culto de prueba').first.click()
        op.get_by_text('EN PANTALLA').first.wait_for()
        op.wait_for_timeout(500)
        check('recargar no pone la salida en negro', 'Aleluya' in shown(out), shown(out))
        op.locator('body').click(position={'x': 5, 'y': 5})
        op.keyboard.press('ArrowRight')
        check('después de recargar, "siguiente" sigue desde donde estaba', wait_text(out, 'Estrofa final'), shown(out))
        out.reload()
        check('recargar la salida: vuelve a mostrar lo último enseguida', wait_text(out, 'Estrofa final', 3000))

        # ------------------------------------------------------------------ 6. Anuncios de la app
        print('6. Anuncios de la app (en rueda)')
        button(op, 'Agregar').click()
        op.get_by_text('Anuncios de la app', exact=True).click()
        check('anuncios: trae el anuncio para toda la iglesia y el evento que viene', wait_text(op, 'Ensayo del coro') and wait_text(op, 'Cena de matrimonios'))
        body = op.inner_text('body')
        check('anuncios: NO trae el de líderes, el viejo ni el evento lejano', all(t not in body for t in ['Solo para líderes', 'Anuncio viejo', 'Evento lejano']))
        check('anuncios: 2 diapositivas', '2 diapositivas' in body)
        # Tiempo por diapositiva: de 10 a 2 segundos
        minus = op.get_by_label('Menos: Tiempo por diapositiva', exact=True).first
        for _ in range(8):
            minus.click()
        check('anuncios: segundos configurables (2 seg)', wait_text(op, '2 seg'))
        button(op, 'Listo').click()
        button(op, 'Empezar los anuncios').click()
        check('anuncios: empieza por el primero', wait_text(out, 'Ensayo del coro'))
        t0 = time.time()
        ok2 = wait_text(out, 'Cena de matrimonios', 4000)
        t1 = time.time()
        ok3 = wait_text(out, 'Ensayo del coro', 4000)
        t2 = time.time()
        check('anuncios: pasa solo al segundo a los ~2 s', ok2 and 1.5 <= t1 - t0 <= 2.8, f'{t1 - t0:.2f}s')
        check('anuncios: después del último vuelve al primero (~2 s)', ok3 and 1.5 <= t2 - t1 <= 2.8, f'{t2 - t1:.2f}s')
        check('anuncios: el operador avisa que pasan solos', 'Los anuncios pasan solos cada 2 segundos' in op.inner_text('body'))
        button(op, 'Pausar').click()
        seen = shown(out)
        out.wait_for_timeout(2600)
        check('anuncios: "Pausar" los frena', shown(out) == seen)
        button(op, 'Seguir').click()
        check('anuncios: "Seguir" los retoma', wait_gone(out, seen.split('\n')[0], 3500))
        foto(out, '05-salida-anuncio')
        op.keyboard.press('b')
        out.wait_for_timeout(2600)
        op.keyboard.press('b')
        out.wait_for_timeout(300)
        check('anuncios: en negro no siguen pasando por atrás', shown(out) != '')

        # ------------------------------------------------------------------ 7. Avance automático de una canción
        print('7. Canción con avance automático')
        row(op, 'Canción de prueba').click()
        button(op, 'Cambiar').click()
        op.get_by_role('switch').first.click(force=True)
        check('canción: se prende el avance automático (2 s por diapositiva)', wait_text(op, 'cada diapositiva queda 2 segundos'))
        button(op, 'Listo').click()
        button(op, 'Empezar la canción con la pista').click()
        t0 = time.time()
        check('canción: arranca en la primera estrofa', wait_text(out, 'Primera estrofa'))
        log = op.evaluate('window.__audio')
        check('canción: arranca la pista', any(e['uri'].endswith('c1/pista.mp3') and e['event'] == 'play' for e in log))
        ok2 = wait_text(out, 'Aleluya', 4000)
        t1 = time.time()
        ok3 = wait_text(out, 'Estrofa final', 4000)
        t2 = time.time()
        check('canción: pasa sola cada ~2 s', ok2 and ok3 and 1.5 <= t1 - t0 <= 2.9 and 1.5 <= t2 - t1 <= 2.8, f'{t1 - t0:.2f}s y {t2 - t1:.2f}s')
        out.wait_for_timeout(2800)
        check('canción: la última diapositiva queda quieta (no sigue con otra parte)', 'Estrofa final' in shown(out), shown(out))
        button(op, 'Parar').first.click()

        # ------------------------------------------------------------------ 8. Prédica desde el bosquejo
        print('8. Prédica desde el bosquejo')
        button(op, 'Agregar').click()
        op.get_by_text('Prédica (bosquejo)', exact=True).click()
        area = op.locator('textarea').first
        area.fill('El amor de Dios\n1. Dios ama a todos (Juan 3:16)\n- Nadie queda afuera\n2. Dios lo demostró\nRo 5:8; 1 Jn 4:9-10')
        check('prédica: 8 diapositivas (título, 3 puntos y 4 versículos)', wait_text(op, '8 diapositivas'), op.inner_text('body')[-300:])
        button(op, 'Listo').click()
        check('prédica: en la lista lleva el título del bosquejo', row(op, 'El amor de Dios').count() == 1)
        thumb(op, 1).click()
        check('prédica: diapositiva de título', wait_text(out, 'El amor de Dios'))
        op.keyboard.press('ArrowRight')
        check('prédica: el punto, con su cita abajo', wait_text(out, '1. Dios ama a todos') and 'Juan 3:16' in shown(out))
        op.keyboard.press('ArrowRight')
        check('prédica: la cita abierta con el texto de la Biblia', wait_text(out, 'Juan 3:16 (RV1909)') and 'de tal manera amó Dios' in shown(out))
        op.keyboard.press('ArrowRight')
        check('prédica: el sub-punto lleva arriba su punto', wait_text(out, 'Nadie queda afuera') and '1. Dios ama a todos' in shown(out))
        foto(out, '06-salida-predica')
        for _ in range(4):
            op.keyboard.press('ArrowRight')
        check('prédica: última diapositiva, 1 Juan 4:10', wait_text(out, '1 Juan 4:10 (RV1909)'), shown(out)[-60:])

        # ------------------------------------------------------------------ 9. Cambios que terminan tarde y guardado
        print('9. Guardado')
        op.wait_for_timeout(1600)
        saved = json.loads(op.evaluate("localStorage.getItem('harness-set')"))
        kinds = [i['type'] for i in saved['items']]
        check('la lista se guarda sola con las partes nuevas', kinds.count('announcements') == 1 and kinds.count('sermon') == 1, json.dumps(kinds))
        ann = next(i for i in saved['items'] if i['type'] == 'announcements')
        check('los anuncios quedan guardados en la lista (andan sin conexión)', len(ann['cards']) == 2 and ann['secs'] == 2)
        # Subir un archivo lento y cambiar otra cosa mientras tanto
        texts_before = [i['type'] for i in saved['items']].count('text')
        op.evaluate('window.__slowUpload = 1500')
        row(op, 'Foto').click()
        button(op, 'Cambiar').click()
        button(op, 'Cambiar foto').click()
        op.get_by_label('Nombre de la lista').fill('Culto con otro nombre')
        button(op, 'Agregar').click()
        button(op, 'Texto libre').click()
        op.wait_for_timeout(1900 + 1600)
        saved = json.loads(op.evaluate("localStorage.getItem('harness-set')"))
        foto_item = next(i for i in saved['items'] if i['type'] == 'image')
        check('archivo que termina de subir tarde: queda puesto', foto_item['media']['path'] == 'c1/subido.png', json.dumps(foto_item))
        check('...y NO pisa lo que se cambió mientras tanto', saved['name'] == 'Culto con otro nombre' and [i['type'] for i in saved['items']].count('text') == texts_before + 1, saved['name'])
        # Falla al guardar: avisa y prueba de nuevo solo
        op.evaluate('window.__failSaves = 1')
        op.get_by_label('Nombre de la lista').fill('Culto de prueba')
        check('si no se pudo guardar, avisa', wait_text(op, 'No se guardó', 4000))
        check('...y prueba de nuevo solo', wait_text(op, 'Guardado', 9000))
        check('...y lo guardado es lo último', json.loads(op.evaluate("localStorage.getItem('harness-set')"))['name'] == 'Culto de prueba')

        # ------------------------------------------------------------------ 10. Orden del culto
        print('10. Traer el orden del culto')
        today = op.evaluate("(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()")
        plans = [{'id': 'p1', 'church_id': 'c1', 'service_date': today, 'title': 'Culto de la mañana', 'items': [
            {'id': 'a', 'type': 'prayer', 'title': 'Oración', 'whoName': 'Hermano Ejemplo'},
            {'id': 'b', 'type': 'song', 'title': 'sublime gracia', 'songId': None},
            {'id': 'c', 'type': 'song', 'title': 'Una que no está', 'songId': None},
            {'id': 'd', 'type': 'notices', 'title': 'Anuncios'},
            {'id': 'e', 'type': 'reading', 'title': 'Lectura bíblica', 'ref': 'Salmos 23'},
            {'id': 'f', 'type': 'sermon', 'title': 'Cántaros vacíos', 'note': '2 Reyes 4:1-7'},
        ]}]
        op.evaluate('p => localStorage.setItem("harness-plans", JSON.stringify(p))', plans)
        op.evaluate("localStorage.removeItem('harness-set')")
        op.reload()
        op.get_by_text('Culto de prueba').first.click()
        op.get_by_text('EN PANTALLA').first.wait_for()
        check('con la tabla del orden del culto, aparece el botón', wait_text(op, 'Traer el orden del culto'))
        before = op.get_by_test_id('presentar-parte').count()
        button(op, 'Traer el orden del culto').click()
        check('deja elegir el día', wait_text(op, 'Culto de la mañana'))
        op.get_by_text('Culto de la mañana').first.click()
        check('avisa cuántas partes sumó y la canción que no encontró', wait_text(op, 'Se sumaron 6 partes') and wait_text(op, 'Hay 1 canción que no encontré'))
        op.get_by_role('dialog').get_by_text('OK').click()
        after = op.get_by_test_id('presentar-parte').count()
        check('suma 6 partes al final de la lista', after - before == 6, f'{before} -> {after}')
        row(op, 'Sublime gracia').click()
        check('la canción trae la letra del Cancionero', thumb(op, 2).count() == 1)
        thumb(op, 1).click()
        check('...y se puede mandar a la pantalla', wait_text(out, 'Sublime gracia del Señor'))
        row(op, 'Salmos 23').click()
        check('la lectura trae el pasaje (6 versículos)', thumb(op, 6).count() == 1 and op.get_by_label('Mostrar diapositiva 7', exact=True).count() == 0)
        row(op, 'Cántaros vacíos').click()
        check('la prédica trae el título y su pasaje (1 + 7)', thumb(op, 8).count() == 1 and op.get_by_label('Mostrar diapositiva 9', exact=True).count() == 0)
        row(op, 'Anuncios').click()
        check('la parte de anuncios se llena sola', wait_text(op, 'Ensayo del coro'))
        foto(op, '07-operador')

        # ------------------------------------------------------------------ 11. Cortes de conexión
        print('11. Conexión con otros aparatos')
        st2 = ctx.new_page()
        st2.add_init_script('window.__rtOff = true')
        watch(st2, 'salida sin conexión')
        st2.goto(base + '/presentar/salida/')
        check('sin conexión con otros aparatos, la misma computadora anda igual', wait_text(st2, 'Sublime gracia del Señor'))
        st2.close()
        rt = op.evaluate('window.__rt')
        check('el operador abre UN solo canal', rt['opened'] == 1 and rt['subscribed'] == 1, json.dumps(rt))
        ctx.close()

        # ------------------------------------------------------------------ 12. Una salida que no es de un líder
        print('12. Pantalla de salida de alguien que no es líder')
        ctx = new_context(browser)
        op = watch(ctx.new_page(), 'operador')
        open_set(op, base)
        row(op, 'Canción de prueba').click()
        thumb(op, 1).click()
        mem = watch(ctx.new_page(), 'salida-miembro')
        mem.goto(base + '/presentar/salida/?miembro=1')
        check('un miembro puede ser la pantalla', wait_text(mem, 'Primera estrofa'))
        mem.locator('body').click(position={'x': 300, 'y': 400})
        mem.keyboard.press('ArrowRight')
        mem.wait_for_timeout(500)
        check('...pero su teclado no maneja la presentación', 'Primera estrofa' in shown(mem))
        ctx.close()

        # ------------------------------------------------------------------ 13. Como en una tablet (sin ventanas)
        print('13. Caminos de la tablet / el teléfono (Platform.OS = android)')
        ctx = new_context(browser, (1024, 768))
        tab = watch(ctx.new_page(), 'tablet')
        open_set(tab, base, '/nativo/')
        check('tablet: explica cómo se usa en un solo aparato', 'tocá la derecha para pasar' in tab.inner_text('body'))
        row(tab, 'Canción de prueba').click()
        thumb(tab, 1).click()
        button(tab, 'Abrir pantalla de salida').click()
        top = tab.get_by_test_id('arriba')
        top.wait_for()
        check('tablet: la salida abre arriba del operador y ya muestra la diapositiva', 'Primera estrofa' in top.inner_text(), top.inner_text())
        rt = tab.evaluate('window.__rt')
        check('tablet: operador y salida comparten UN canal (antes se pisaban)', rt['opened'] == 1 and rt['subscribed'] == 1 and rt['removed'] == 0, json.dumps(rt))
        check('tablet: la pantalla no se apaga sola', 'on:lamies-salida' in tab.evaluate('window.__awake || []'))
        tab.mouse.click(950, 400)
        check('tablet: tocar la derecha pasa', wait_text(tab, 'Aleluya') and 'Aleluya' in top.inner_text())
        tab.mouse.click(950, 400)
        tab.wait_for_function("document.querySelector('[data-testid=arriba]').innerText.includes('Estrofa final')", timeout=3000)
        tab.mouse.click(60, 400)
        tab.wait_for_timeout(300)
        check('tablet: tocar la izquierda vuelve', 'Aleluya' in top.inner_text() and 'Estrofa final' not in top.inner_text(), top.inner_text())
        tab.mouse.click(512, 400)
        check('tablet: tocar el medio muestra "Cerrar" (y no pasa)', 'Aleluya' in top.inner_text())
        # Música y cuenta regresiva en la tablet
        tab.evaluate("window.__nav = [...(window.__nav || []), '<atras>']")
        top.wait_for(state='detached')
        tab.wait_for_timeout(600)
        rt = tab.evaluate('window.__rt')
        check('tablet: al cerrar la salida el operador sigue conectado', rt['removed'] == 0, json.dumps(rt))
        check('tablet: suelta la pantalla al cerrar la salida', 'off:lamies-salida' in tab.evaluate('window.__awake || []'))
        row(tab, 'Música de fondo').click()
        button(tab, 'Reproducir').click()
        check('tablet: la música suena', wait_text(tab, 'Sonando: fondo.mp3'))
        row(tab, 'Video').click()
        check('tablet: avisa claro que el video no se ve en la tablet', wait_text(tab, 'En una tablet o un teléfono todavía no se pueden mostrar'))
        thumb(tab, 1).click()
        tab.wait_for_timeout(300)
        button(tab, 'Abrir pantalla de salida').click()
        top = tab.get_by_test_id('arriba')
        top.wait_for()
        check('tablet: en la salida, el video muestra un cartel amable (no queda negro ni se rompe)', 'Acá va un video' in top.inner_text() and 'computadora' in top.inner_text(), top.inner_text())
        check('tablet: el cartel del video entra en la pantalla', overflow(tab) <= 0, str(overflow(tab)))
        foto(tab, '08-tablet-video')
        tab.mouse.click(950, 400)  # siguiente: texto
        check('tablet: después del video sigue lo demás', wait_text(tab, 'Bienvenidos'))
        tab.evaluate("window.__nav = [...(window.__nav || []), '<atras>']")
        top.wait_for(state='detached')
        row(tab, 'Cuenta regresiva').click()
        thumb(tab, 1).click()
        row(tab, 'Foto').click()
        button(tab, 'Abrir vista de escenario').click()
        top = tab.get_by_test_id('arriba')
        top.wait_for()
        check('tablet: la vista de escenario muestra la cuenta y lo que sigue', 'AHORA EN PANTALLA' in top.inner_text() and ('1:5' in top.inner_text() or '2:00' in top.inner_text()) and 'SIGUE · Canción de prueba' in top.inner_text(), top.inner_text())
        ctx.close()

        browser.close()
    srv.shutdown()

    for e in errors:
        print('  ERROR de la página:', e)
    check('ninguna pantalla tiró errores', not errors, f'{len(errors)} errores')
    bad = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(bad)} de {len(results)} pruebas bien.')
    if bad:
        print('Fallaron:')
        for name, _, detail in bad:
            print(f'  - {name}  [{detail}]')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
