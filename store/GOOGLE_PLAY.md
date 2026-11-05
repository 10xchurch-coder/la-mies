# Google Play · todo lo que pide la ficha de La Mies

Archivos en esta carpeta: `icono-512.png` (ícono de la tienda) y `grafico-destacado-1024x500.png` (imagen destacada).
Capturas de pantalla: sacarlas del teléfono Android (mínimo 2, mejor 4–6): Mapa, Devocional, Personas, Asistencia.

## Ficha de la tienda (Store listing)

**Nombre de la app:** La Mies

**Descripción breve** (máx. 80 caracteres):
```
Evangelismo casa por casa y la vida de tu iglesia, en una sola app.
```

**Descripción completa** (máx. 4000 caracteres):
```
La Mies es la app de Iglesia Bautista Victoria (Posadas, Misiones) para organizar el trabajo de la iglesia.

EVANGELISMO CASA POR CASA
• Iniciá una salida y la app marca en el mapa las cuadras que recorrés, vereda por vereda, aunque el teléfono esté bloqueado.
• Ves qué calles ya se visitaron y cuándo, con un color por período.
• Anotá a las personas con las que hablaste, con su consentimiento, para volver a visitarlas.
• Equipo en vivo: ves dónde está cada hermano durante la salida.
• Salidas de volantes con su propio mapa.

LA IGLESIA
• Personas: miembros, visitas y contactos con foto.
• Asistencia a las reuniones y a las clases, tocando las caras.
• Clases de niños, maestros, material de cada semana.
• Ministerios con chat, anuncios y turnos.
• Prédicas en video y audio.
• Avisos y recordatorios.

CADA DÍA
• Versículo del día (Reina-Valera 1960) como tarjeta para compartir en WhatsApp e Instagram.
• Devocional diario con lectura, estudio y oración.
• Racha de lectura con premios a la semana, al mes y al año.

SEGURIDAD
• Verificación en dos pasos y bloqueo con huella o Face ID.
• Cada iglesia ve solo sus datos.

Para usarla necesitás el código de tu iglesia. Si tu iglesia todavía no usa La Mies, escribinos a info@iglesiavictoria.com.
```

**Categoría:** Estilo de vida (o "Social"). **Etiquetas:** iglesia, evangelismo, devocional.
**Correo de contacto:** info@iglesiavictoria.com
**Sitio web:** https://iglesiavictoria.com
**Política de privacidad:** https://10xchurch-coder.github.io/la-mies/privacidad.html

## Contenido de la app (Policy → App content)

**Política de privacidad:** la URL de arriba.

**Acceso a la app (App access):** "Toda o parte de la funcionalidad está restringida" → agregar instrucciones:
```
La app requiere cuenta. Para probar: crear una cuenta en la pantalla "¿Primera vez?" con el código de iglesia que se indica abajo, o entrar con la cuenta de prueba.
```
(Ahí mismo, en los campos de usuario y contraseña del formulario de Google, poner una cuenta de prueba creada para el revisor y el código de la iglesia. No escribir el código ni la contraseña en este archivo: el proyecto es público.)

**Anuncios:** No contiene anuncios.

**Clasificación de contenido:** cuestionario → categoría "Utilidad, productividad, comunicación u otros"; responder No a todo (sin violencia, sin apuestas, etc.). Resultado esperado: PEGI 3 / Todos.

**Público objetivo:** 18 años o más. No está dirigida a niños.

**Aplicaciones de noticias:** No. **COVID-19:** No. **Aplicación gubernamental:** No. **Préstamos:** No.

**Seguridad de los datos (Data safety):**
- ¿Recopila o comparte datos del usuario? **Sí.**
- ¿Los datos se cifran en tránsito? **Sí.**
- ¿Pueden pedir que se borren los datos? **Sí** → URL: https://10xchurch-coder.github.io/la-mies/eliminar-cuenta.html
- Tipos de datos (todos "recopilados", ninguno "compartido", todos "opcionales" salvo nombre y correo):
  - Ubicación → Ubicación precisa: finalidad "Funciones de la app". Recopilación en segundo plano: sí (solo durante una salida).
  - Información personal → Nombre, Correo electrónico, Número de teléfono, Dirección, Otra info (DNI, fecha de nacimiento): "Funciones de la app", "Administración de la cuenta".
  - Fotos y videos → Fotos: "Funciones de la app".
  - Actividad en la app → Otras acciones del usuario (asistencia, lectura del devocional): "Funciones de la app".
  - Identificadores del dispositivo → sí (identificador de notificaciones push): "Funciones de la app".
- Prácticas de seguridad: cifrado en tránsito sí; eliminación a pedido sí.

**Permiso de ubicación en segundo plano (formulario de permisos):**
Motivo (pegar):
```
La Mies registra las cuadras que la iglesia recorre mientras evangeliza casa por casa. El usuario inicia y detiene cada salida; la ubicación se usa solo durante una salida activa, también con la pantalla apagada, para que el recorrido quede completo y no se corte al bloquear el teléfono. Fuera de una salida la app no usa la ubicación.
```
Video (YouTube no listado, 30–60 s), grabado con el Android:
1. Abrir La Mies → pestaña Mapa → tocar "Iniciar salida" → elegir Evangelismo.
2. Se ve el pedido de permiso de ubicación "todo el tiempo"; aceptar.
3. Bloquear el teléfono, caminar media cuadra (se puede mostrar un reloj o contar en voz alta).
4. Desbloquear: la cuadra aparece pintada en el mapa.
5. Tocar "Terminar salida" → se ve el resumen.

**Servicio en primer plano (Foreground service):** tipo "location"; mismo motivo y mismo video.

## Prueba cerrada (12 personas, 14 días)
1. Testing → Closed testing → Create track "Iglesia".
2. Testers → lista con los Gmail de 15–20 hermanos con Android.
3. Subir el archivo .aab (en GitHub: Actions → "App Android" → Run workflow → tienda).
4. Mandar por WhatsApp el link de inscripción; cada uno toca "Become a tester" y luego instala desde Play.
5. Que la usen 14 días seguidos (abrir, mirar el devocional, tomar asistencia). Después: Dashboard → "Apply for production".
