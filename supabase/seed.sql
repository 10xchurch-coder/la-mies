-- ============================================================================
-- La Mies · datos iniciales. Correr UNA vez después de las migraciones,
-- en Supabase → SQL Editor.
-- ============================================================================

-- El código para unirse se genera al azar (nadie lo puede adivinar). Se muestra al final.
insert into public.churches (name, city, country, join_code, timezone, grouping)
select 'Iglesia Bautista Victoria', 'Posadas', 'AR',
       'VICTORIA-' || upper(substr(md5(gen_random_uuid()::text), 1, 5)),
       'America/Argentina/Buenos_Aires', 'bus_routes'
where not exists (select 1 from public.churches where name = 'Iglesia Bautista Victoria');

-- Material de capacitación de ejemplo (para todas las iglesias). Editalo o borralo.
insert into public.training_items (church_id, category, title, kind, summary, body, minutes, sort_order) values
(null, 'Antes de salir', 'Qué llevar y cómo prepararse', 'article',
 'Diez minutos de preparación hacen que la salida rinda el doble.',
 '# Antes de salir
- Orá por las casas que vas a visitar y por tu compañero.
- Llevá tratados, una Biblia chica, lapicera y el teléfono con batería.
- Revisá en el mapa qué veredas ya están cubiertas y elegí un sector nuevo.
- Salí de a dos siempre que puedas.

## Cuando llegás a la cuadra
- Tocá "Iniciar salida" recién cuando empezás a caminar la cuadra, no desde la iglesia.
- Fijate que la app diga la vereda correcta; si no, tocá el cartel y la cambia.', 3, 10),
(null, 'Al tocar la puerta', 'Cómo presentarte en 20 segundos', 'article',
 'Sonreí, decí tu nombre y el de la iglesia, y hacé una pregunta sencilla.',
 '# Cómo presentarte
"Buenas tardes, mi nombre es ___ y soy de la Iglesia Bautista ___, acá a unas cuadras. Estamos pasando por el barrio para invitar a las familias y dejarles este folleto. ¿Puedo hacerle una pregunta rápida?"

## Consejos
- No te pares pegado a la puerta: un paso atrás, manos a la vista.
- Si hay perro, esperá en la vereda y llamá desde ahí.
- Si no tienen tiempo, dejá el tratado y preguntá si podés volver otro día. Anotalo en la app.', 4, 20),
(null, 'Preguntas difíciles', '"Yo ya soy católico / evangélico"', 'article',
 'No discutas la religión; hablá de la relación con Dios.',
 '# "Yo ya tengo mi religión"
- Agradecé y afirmá: "Qué bueno que cree en Dios".
- Pasá de la religión a la persona: "¿Puedo hacerle una pregunta? Si hoy falleciera, ¿está seguro de que iría al cielo?"
- Si duda, ofrecé mostrarle en la Biblia cómo se puede estar seguro:

## Romanos 10:9-13
que si confesares con tu boca que Jesús es el Señor, y creyeres en tu corazón que Dios le levantó de los muertos, serás salvo. Porque con el corazón se cree para justicia, pero con la boca se confiesa para salvación. Pues la Escritura dice: Todo aquel que en él creyere, no será avergonzado. Porque no hay diferencia entre judío y griego, pues el mismo que es Señor de todos, es rico para con todos los que le invocan; porque todo aquel que invocare el nombre del Señor, será salvo

- Si no quiere seguir, dejá la invitación con cariño. Lo importante es la puerta abierta para la próxima.', 5, 30);

-- Resultado: anotá este código. Lo vas a usar para crear tu cuenta en la app.
select name as iglesia, join_code as codigo_para_unirse from public.churches;
