-- 07_devocionales_y_cierre · datos de ejemplo (generado por scripts/demo-seed.mjs; no editar a mano)
begin;
set local session_replication_role = replica;
insert into public.daily_content (id, church_id, on_date, reference, verse, message, devotional, background, created_by, study, prayer)
select demo_id('dv' || g::text), demo_c(), current_date - g, v.reference, v.verse, v.message, v.devotional, 'auto', demo_p(1), v.study, v.prayer
from generate_series(0, 20) g join (values
  (0, 'Mateo 9:37-38', 'Entonces dijo a sus discípulos: A la verdad la mies es mucha, mas los obreros pocos. Rogad, pues, al Señor de la mies, que envíe obreros a su mies.', 'Hay mucho por hacer, y Dios quiere usarte.', 'Jesús miró a la gente y vio una cosecha lista. No vio un problema: vio personas que necesitaban a Dios.

Lo primero que pidió no fue salir corriendo. Pidió orar. El que ora por obreros termina siendo uno.', 'Pensá en tu cuadra. ¿Cuántos vecinos conocen el evangelio? Jesús dijo: "Por tanto, id, y haced discípulos a todas las naciones, bautizándolos en el nombre del Padre, y del Hijo, y del Espíritu Santo" (Mateo 28:19). Empezá por orar por una persona con nombre y apellido, y esta semana contale lo que Cristo hizo por vos.', 'Señor de la mies, mandá obreros. Y empezá conmigo. Amén.'),
  (1, 'Salmos 23:1', 'Jehová es mi pastor; nada me faltará.', 'Si él te cuida, no te va a faltar lo que de verdad necesitás.', 'Una oveja no se cuida sola. Necesita un pastor que la guíe, la alimente y la defienda.

David había sido pastor. Sabía de qué hablaba. Y dijo: el Señor es MI pastor.', 'No dice "nada voy a querer". Dice "nada me faltará". Dios no promete darte todo lo que pedís, pero sí todo lo que te hace falta. Hoy, cuando aparezca una preocupación, decilo en voz alta: "Jehová es mi pastor".', 'Señor, gracias por cuidarme. Hoy confío en vos. Amén.'),
  (2, 'Filipenses 4:6-7', 'Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias. Y la paz de Dios, que sobrepasa todo entendimiento, guardará vuestros corazones y vuestros pensamientos en Cristo Jesús.', 'Cambiá la preocupación por oración.', 'La preocupación da vueltas en la cabeza y no arregla nada. La oración lleva el problema a quien sí puede.

Dios no promete sacarte el problema hoy. Promete darte su paz mientras tanto.', 'Fijate en el orden: primero orar, con gracias, y después llega la paz. Hacé una lista corta de lo que hoy te quita el sueño. Contale cada cosa a Dios y dale gracias por algo concreto. La Biblia dice: "echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros" (1 Pedro 5:7).', 'Padre, te dejo mis cargas. Dame tu paz. Amén.'),
  (3, 'Juan 3:16', 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.', 'Dios te amó primero, y lo demostró.', 'El amor de Dios no fue una palabra: fue un regalo. Dio a su Hijo.

"Todo aquel" te incluye a vos. No hay que ganárselo. Hay que creer.', 'La salvación es un regalo: "Porque por gracia sois salvos por medio de la fe; y esto no de vosotros, pues es don de Dios; no por obras, para que nadie se gloríe" (Efesios 2:8-9). Si ya creíste, dale gracias. Y pensá a quién le podés contar este versículo hoy.', 'Gracias, Señor, por amarme así. Ayudame a contarlo. Amén.'),
  (4, 'Proverbios 3:5-6', 'Fíate de Jehová de todo tu corazón, Y no te apoyes en tu propia prudencia. Reconócelo en todos tus caminos, Y él enderezará tus veredas.', 'Confiá en Dios más que en lo que a vos te parece.', 'Muchas veces creemos saber qué conviene. Pero no vemos todo el camino. Dios sí.

Reconocerlo en todos los caminos es preguntarle antes de decidir, no después.', '¿Hay una decisión que venís tomando solo? El trabajo, la plata, los hijos. Hoy ponela delante de Dios. Buscá qué dice su Palabra y pedí consejo a un hermano maduro. Él promete enderezar el camino.', 'Señor, no quiero apoyarme en mi idea. Guiame vos. Amén.'),
  (5, 'Mateo 11:28', 'Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.', 'El descanso no es un lugar: es una Persona.', 'Jesús no dijo "vayan a descansar". Dijo "vengan a mí".

Hay un cansancio que no se va durmiendo: el de la culpa, el de cargar todo solo. Ese cansancio se lo llevás a él.', 'Si estás cansado, no esperes a estar mejor para orar. Vení como estás. Contale qué te pesa. Jesús no rechaza al que viene. Hoy apartá diez minutos, apagá el teléfono y hablá con él.', 'Señor Jesús, vengo a vos cansado. Dame tu descanso. Amén.'),
  (6, 'Josué 1:9', 'Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo en dondequiera que vayas.', 'No sos valiente porque sos fuerte, sino porque Dios va con vos.', 'Josué tenía una tarea enorme y un pueblo difícil. Dios no le dijo que iba a ser fácil. Le dijo que iba a estar con él.

El valor del creyente no sale de mirarse a sí mismo. Sale de saber quién lo acompaña.', '¿Qué te da miedo esta semana? Una charla, un estudio médico, un trabajo nuevo. Dios promete lo mismo: "No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo; siempre te ayudaré, siempre te sustentaré con la diestra de mi justicia" (Isaías 41:10).', 'Señor, gracias porque vas conmigo. Dame valor. Amén.'),
  (7, 'Salmos 119:105', 'Lámpara es a mis pies tu palabra, Y lumbrera a mi camino.', 'La Biblia alumbra el paso de hoy.', 'Una lámpara no muestra todo el camino. Muestra dónde poner el pie ahora.

Dios no siempre te muestra el año entero. Pero su Palabra alcanza para el paso de hoy.', 'El que no lee camina a oscuras. Elegí una hora fija para leer, aunque sean diez minutos. Empezá por un Evangelio. "Toda la Escritura es inspirada por Dios, y útil para enseñar, para redargüir, para corregir, para instruir en justicia" (2 Timoteo 3:16).', 'Señor, abrí mis ojos cuando leo tu Palabra. Amén.'),
  (8, 'Romanos 8:28', 'Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien, esto es, a los que conforme a su propósito son llamados.', 'Dios usa hasta lo que duele.', 'No dice que todo es bueno. Dice que Dios hace que todo ayude a bien.

Como en una receta: la harina sola no es rica, pero el que cocina sabe para qué la usa.', 'Quizás hoy no entendés lo que te pasa. José tampoco entendía cuando lo vendieron sus hermanos, y años después vio el plan de Dios. Dale gracias aunque todavía no veas el final, y seguí haciendo lo correcto.', 'Padre, confío en que vos sabés lo que hacés. Amén.'),
  (9, '1 Juan 1:9', 'Si confesamos nuestros pecados, él es fiel y justo para perdonar nuestros pecados, y limpiarnos de toda maldad.', 'No escondas el pecado: confesalo.', 'Esconder el pecado es como tapar una herida sucia. No se cura.

Confesar es decirle a Dios lo mismo que él ya sabe, sin excusas.', 'Dios promete dos cosas: perdonar y limpiar. No te perdona de mala gana: es fiel y justo, porque Cristo ya pagó. Si hay algo sin arreglar, hacelo hoy. Y si ofendiste a alguien, andá y pedile perdón.', 'Señor, te confieso mi pecado. Gracias por perdonarme. Amén.'),
  (10, 'Mateo 6:33', 'Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.', 'Poné a Dios primero y él se ocupa de lo demás.', 'Jesús hablaba de la comida y de la ropa: lo de todos los días. No dijo que no importan. Dijo qué va primero.

Cuando Dios ocupa el primer lugar, lo demás se ordena.', 'Mirá tu semana. ¿Qué lugar tienen la reunión, la oración, servir a otros? Lo primero se nota en la agenda y en la billetera. Hacé un cambio concreto: uno solo, pero hoy.', 'Señor, quiero buscarte primero. Ordená mi vida. Amén.'),
  (11, 'Hebreos 10:25', 'no dejando de congregarnos, como algunos tienen por costumbre, sino exhortándonos; y tanto más, cuanto veis que aquel día se acerca.', 'No estás hecho para vivir la fe solo.', 'Una brasa sola se apaga. Junto a otras, sigue encendida.

Ir a la reunión no es un trámite. Es donde te animan y donde vos animás a otro.', 'David dijo: "Yo me alegré con los que me decían: A la casa de Jehová iremos" (Salmos 122:1). Este domingo no vayas solo a recibir. Buscá a alguien que faltó, mandale un mensaje e invitalo a volver.', 'Señor, gracias por mi iglesia. Usame para animar a alguien. Amén.'),
  (12, '2 Corintios 5:17', 'De modo que si alguno está en Cristo, nueva criatura es; las cosas viejas pasaron; he aquí todas son hechas nuevas.', 'En Cristo no sos una versión mejorada: sos nuevo.', 'Dios no remienda la vida vieja. Da una nueva.

Tu pasado ya no te define. Lo que te define es estar en Cristo.', 'Si el enemigo te recuerda lo que fuiste, recordale lo que Cristo hizo. Y viví como nuevo: dejá hoy un hábito de la vida vieja y empezá uno de la nueva, como leer la Biblia o pedir perdón rápido.', 'Gracias, Señor, por hacerme nuevo. Ayudame a vivir así. Amén.'),
  (13, 'Isaías 40:31', 'pero los que esperan a Jehová tendrán nuevas fuerzas; levantarán alas como las águilas; correrán, y no se cansarán; caminarán, y no se fatigarán.', 'Esperar en Dios no es perder tiempo: es cargar fuerzas.', 'Hasta los jóvenes se cansan. Pero hay una fuerza que no sale de nosotros.

Esperar a Jehová es confiar en él mientras seguís caminando.', 'A veces Dios te hace volar, a veces correr y muchas veces solo caminar sin aflojar. Las tres cosas son su fuerza. Si hoy solo podés caminar, caminá. "Jehová es mi luz y mi salvación; ¿de quién temeré? Jehová es la fortaleza de mi vida; ¿de quién he de atemorizarme?" (Salmos 27:1).', 'Señor, espero en vos. Renová mis fuerzas hoy. Amén.')
) v(i, reference, verse, message, devotional, study, prayer) on v.i = (20 - g) % 14
on conflict (church_id, on_date) do nothing;
update public.demo_churches set seeded_at = now() where church_id = demo_c() and seeded_at is null;
select public.demo_echo(demo_c(), current_date);
commit;
