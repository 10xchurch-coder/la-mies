# Correos que manda la app (plantillas en español)

Se pegan en Supabase: **Authentication → Email Templates**. Cada plantilla tiene un
**Subject** (asunto) y un **Message body** (cuerpo). Reemplazá los dos y tocá **Save**.
Las palabras entre llaves `{{ ... }}` las completa Supabase solas; dejalas tal cual.

Antes, en **Authentication → URL Configuration**: Site URL `https://10xchurch-coder.github.io/la-mies`
y Redirect URL `https://10xchurch-coder.github.io/la-mies/**`.

Remitente (en **Project Settings → Authentication → SMTP Settings**):
Sender name `La Mies · Iglesia Bautista Victoria`, Sender email el Gmail de la iglesia.

---

## 1. Confirm sign up (confirmar la cuenta)

**Subject**
```
Confirmá tu cuenta en La Mies
```

**Message body**
```html
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1F2A24">
  <h2 style="color:#1F6B45;margin:0 0 12px">¡Bienvenido a La Mies!</h2>
  <p>Hola. Creaste una cuenta en la app de <strong>Iglesia Bautista Victoria</strong>.</p>
  <p>Para terminar, tocá el botón y confirmá que este correo es tuyo:</p>
  <p style="margin:24px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#1F6B45;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Confirmar mi cuenta</a>
  </p>
  <p>Después de confirmar, entrá a la app con tu correo y tu contraseña, y poné el código de la iglesia.</p>
  <p style="color:#6B736D;font-size:13px">Si no fuiste vos, no hagas nada: la cuenta no se activa sin este paso.</p>
  <p style="color:#6B736D;font-size:12px;margin-top:24px">La Mies · Iglesia Bautista Victoria · Posadas</p>
</div>
```

## 2. Reset password (olvidé la contraseña)

**Subject**
```
Cambiar tu contraseña de La Mies
```

**Message body**
```html
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1F2A24">
  <h2 style="color:#1F6B45;margin:0 0 12px">Contraseña nueva</h2>
  <p>Pediste cambiar la contraseña de tu cuenta en la app de <strong>Iglesia Bautista Victoria</strong>.</p>
  <p>Tocá el botón y escribí una contraseña nueva (10 o más caracteres, con letras y números):</p>
  <p style="margin:24px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#1F6B45;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Cambiar mi contraseña</a>
  </p>
  <p style="color:#6B736D;font-size:13px">El link sirve una sola vez y por poco tiempo. Si no pediste esto, ignorá este correo: tu contraseña sigue igual.</p>
  <p style="color:#6B736D;font-size:12px;margin-top:24px">La Mies · Iglesia Bautista Victoria · Posadas</p>
</div>
```

## 3. Change email address (cambiar el correo)

**Subject**
```
Confirmá tu nuevo correo en La Mies
```

**Message body**
```html
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1F2A24">
  <h2 style="color:#1F6B45;margin:0 0 12px">Nuevo correo</h2>
  <p>Pediste cambiar el correo de tu cuenta de <strong>{{ .Email }}</strong> a <strong>{{ .NewEmail }}</strong>.</p>
  <p style="margin:24px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#1F6B45;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Confirmar el cambio</a>
  </p>
  <p style="color:#6B736D;font-size:13px">Si no fuiste vos, ignorá este correo.</p>
  <p style="color:#6B736D;font-size:12px;margin-top:24px">La Mies · Iglesia Bautista Victoria · Posadas</p>
</div>
```

## 4. Magic Link (entrar sin contraseña)

La app no lo usa. Si lo cambiás igual, poné de asunto `Tu link para entrar a La Mies` y el
mismo cuerpo que el de contraseña, cambiando el texto del botón a "Entrar a La Mies".
