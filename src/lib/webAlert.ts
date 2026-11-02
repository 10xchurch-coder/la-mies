// En la web, React Native no muestra Alert.alert (no hace nada). Acá lo reemplazamos por una
// ventanita propia con los mismos botones, así confirmaciones y errores se ven igual que en el teléfono.
import { Alert, Platform, type AlertButton } from 'react-native';

function show(title: string, message?: string, buttons?: AlertButton[]): void {
  if (typeof document === 'undefined') return;
  const list = buttons && buttons.length ? buttons : [{ text: 'OK' }];
  const back = document.createElement('div');
  back.setAttribute('role', 'dialog');
  back.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:20px;max-width:360px;width:calc(100% - 32px);box-shadow:0 12px 40px rgba(0,0,0,.25)';
  const h = document.createElement('div');
  h.textContent = title;
  h.style.cssText = 'font-size:17px;font-weight:800;color:#1A1D1A;margin-bottom:6px';
  box.appendChild(h);
  if (message) {
    const m = document.createElement('div');
    m.textContent = message;
    m.style.cssText = 'font-size:14px;line-height:20px;color:#3E443F;margin-bottom:14px;white-space:pre-wrap';
    box.appendChild(m);
  }
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:10px';
  const close = () => back.remove();
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  for (const b of list) {
    const btn = document.createElement('button');
    btn.textContent = b.text ?? 'OK';
    const destructive = b.style === 'destructive';
    const cancel = b.style === 'cancel';
    btn.style.cssText = `height:46px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;border:2px solid ${destructive ? '#B3261E' : cancel ? '#CFD4CF' : '#1F6B45'};background:${cancel || destructive ? '#fff' : '#1F6B45'};color:${destructive ? '#B3261E' : cancel ? '#3E443F' : '#fff'}`;
    btn.addEventListener('click', () => {
      close();
      b.onPress?.();
    });
    row.appendChild(btn);
  }
  box.appendChild(row);
  back.appendChild(box);
  document.body.appendChild(back);
}

if (Platform.OS === 'web') {
  (Alert as unknown as { alert: typeof show }).alert = show;
}
