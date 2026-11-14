// La Mies para la computadora (Mac y Windows).
// Es una ventana propia que abre la misma app de la web, así siempre está al día sin volver a instalar.
// La sesión queda guardada en la computadora, igual que en el navegador.
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

const APP_URL = 'https://10xchurch-coder.github.io/la-mies/';
const APP_ORIGIN = new URL(APP_URL).origin;
const APP_PATH = new URL(APP_URL).pathname;
// Lo que la app necesita cargar además de sí misma (base de datos, mapas, fotos, videos) se abre adentro;
// cualquier otro enlace (WhatsApp, la web de la iglesia, Google Maps) se abre en el navegador de siempre.
const isApp = (url) => {
  try {
    const u = new URL(url);
    return u.origin === APP_ORIGIN && u.pathname.startsWith(APP_PATH);
  } catch {
    return false;
  }
};

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'La Mies',
    backgroundColor: '#FFFFFF',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  const wc = win.webContents;
  // Enlaces que abren ventana nueva: los de la app, adentro; los demás, en el navegador.
  wc.setWindowOpenHandler(({ url }) => {
    if (isApp(url)) { wc.loadURL(url); return { action: 'deny' }; }
    if (/^(https?:|mailto:|tel:|whatsapp:)/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Que la ventana no se vaya a otro sitio.
  wc.on('will-navigate', (e, url) => {
    if (isApp(url) || url.startsWith('file:')) return;
    e.preventDefault();
    if (/^(https?:|mailto:|tel:|whatsapp:)/i.test(url)) shell.openExternal(url);
  });
  // Sin internet: una página propia con un botón para reintentar.
  wc.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: carga cancelada (no es un error)
    if (isApp(url)) wc.loadFile(path.join(__dirname, 'sin-conexion.html'));
  });

  wc.loadURL(APP_URL);
}

function buildMenu() {
  const mac = process.platform === 'darwin';
  const template = [
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'Archivo', submenu: [mac ? { role: 'close', label: 'Cerrar ventana' } : { role: 'quit', label: 'Salir' }] },
    { label: 'Edición', submenu: [
      { role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' },
      { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' },
    ] },
    { label: 'Ver', submenu: [
      { label: 'Inicio', accelerator: 'CmdOrCtrl+Shift+H', click: () => win && win.webContents.loadURL(APP_URL) },
      { label: 'Atrás', accelerator: 'CmdOrCtrl+[', click: () => win && win.webContents.canGoBack() && win.webContents.goBack() },
      { label: 'Adelante', accelerator: 'CmdOrCtrl+]', click: () => win && win.webContents.canGoForward() && win.webContents.goForward() },
      { role: 'reload', label: 'Actualizar' }, { type: 'separator' },
      { role: 'zoomIn', label: 'Agrandar' }, { role: 'zoomOut', label: 'Achicar' }, { role: 'resetZoom', label: 'Tamaño normal' }, { type: 'separator' },
      { role: 'togglefullscreen', label: 'Pantalla completa' },
    ] },
    { role: 'windowMenu', label: 'Ventana' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Una sola ventana de La Mies a la vez.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    // Permisos (avisos, ubicación, cámara para fotos): solo se le dan a La Mies, a ningún otro sitio.
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
      const ok = isApp(wc.getURL()) && ['notifications', 'geolocation', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'].includes(permission);
      cb(ok);
    });
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
