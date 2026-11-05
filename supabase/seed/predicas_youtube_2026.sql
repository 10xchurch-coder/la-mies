-- Prédicas del canal de YouTube (youtube.com/@IglesiaVictoriaPosadas), mayo a noviembre de 2026.
-- Título limpio, pasaje separado cuando el título lo trae, la frase del título como descripción
-- y la fecha de publicación del video como fecha de la prédica. No duplica: saltea los links que ya están.
-- Aplicado en vivo el 2026-11-05 (30 prédicas).
insert into public.sermons (church_id, title, preacher, preached_on, passage, description, youtube_url, created_by)
select '2c35b2a1-494d-475d-8a87-b7df18974838', v.title, v.preacher, v.d::date, v.passage, v.descr,
       'https://www.youtube.com/watch?v=' || v.vid, '993a18f6-0986-44b5-8c03-296ae3512fa3'
from (values
  ('QtGO1ch7PLQ', '2026-11-04', 'La voluntad de Dios', 'Romanos 12', null, null),
  ('qLf4QLbh4U8', '2026-10-30', 'El servicio de Jesús', 'Juan 13', null, null),
  ('EuHgySjT7r4', '2026-10-28', 'Permanecer en Cristo', 'Colosenses 2:6', null, null),
  ('FCpVq6C3FkA', '2026-10-23', 'Jesús toca al intocable', 'Marcos 1:40', null, null),
  ('4gw__c17-T4', '2026-10-14', 'El perdón de Jesucristo', 'Lucas 23:33', null, null),
  ('Mqsm_jAwwiU', '2026-09-20', 'La mansedumbre de Jesús', null, 'Es la máxima expresión de fuerza bajo control.', null),
  ('eVsbiYJXYnw', '2026-09-19', 'El ataque de Tobías', 'Nehemías 6', null, null),
  ('4RO_IoLwYU0', '2026-09-16', 'No mirar atrás', 'Lucas 9:57', null, null),
  ('ueQ4Tjl2Fss', '2026-09-14', 'El ataque de Sanbalat', 'Nehemías 4:2', null, null),
  ('BqfA43L9xFk', '2026-07-22', 'La gracia', 'Efesios 2:8-9', 'Y esto no de vosotros, pues es don de Dios; no por obras, para que nadie se gloríe.', null),
  ('YWwcT9UbQK0', '2026-07-21', 'El costo de seguir a Jesús', 'Lucas 14:26', 'Si no aborrece hasta su propia vida, no puede ser su discípulo.', null),
  ('p2UXSvLuXnw', '2026-07-16', 'Ser más como Jesús', '1 Juan 2:6', 'El que dice que permanece en él, debe andar como él anduvo.', null),
  ('w8_P75DLEjU', '2026-07-14', 'Vivir para la eternidad', 'Mateo 6:21', 'Porque donde esté vuestro tesoro, allí estará también vuestro corazón.', null),
  ('SJWeMl1P7pY', '2026-07-08', 'La fe', 'Hebreos 11:1-2', 'La certeza de lo que se espera, la convicción de lo que no se ve. Alcanzaron buen testimonio.', null),
  ('BNtIsfvS2Jw', '2026-07-07', 'No sé por qué vivir', null, 'Encuentra hoy la esperanza redentora.', null),
  ('gX6jsGqTteE', '2026-07-02', 'El camino para que Dios obre en su pueblo', '2 Crónicas 7:14', 'Perdonaré sus pecados y sanaré su tierra.', null),
  ('Xr8l6CN_rqg', '2026-07-01', '¿Qué es la fe?', 'Santiago 2:19', 'Tú crees que Dios es uno; bien haces. También los demonios creen, y tiemblan.', null),
  ('E3f8SV9-gOU', '2026-06-25', 'El orgullo que no se ve', null, 'El que se enaltece será humillado, y el que se humilla será enaltecido.', null),
  ('tTnqv1HUGZU', '2026-06-23', 'Dios no soporta a los orgullosos', null, 'Una cosa es segura: no los dejará sin castigo.', null),
  ('erfhBVl3oaM', '2026-06-19', 'Un regalo y el gran precio', null, null, null),
  ('T8Qqg56LKRI', '2026-06-18', '¿Qué dice Dios sobre la prosperidad?', null, null, null),
  ('_Ex0hYo8JXY', '2026-06-10', '¿Cómo cuidar nuestra mente?', null, null, null),
  ('_WZ6Jmig_Gg', '2026-06-09', 'Jonás', 'Jonás', null, 'Pastor Brian George'),
  ('9D9JhWcZET4', '2026-06-03', '¿Cómo podemos agradar a Dios?', null, null, null),
  ('7ceMJF3m5Iw', '2026-06-02', 'Hábitos en el trabajo', null, null, null),
  ('JlDEA4YMW0c', '2026-05-30', 'El infierno', null, null, null),
  ('FbETtoNvntQ', '2026-05-28', 'Estancamiento: ¿qué hacer?', null, null, null),
  ('0-mJQXogGgI', '2026-05-21', '¿Cómo saber si Dios escucha mi oración?', null, null, null),
  ('nmWiCGbVd4g', '2026-05-19', '¿Cómo atravesar los momentos difíciles?', null, null, null),
  ('u4bBgPXBryg', '2026-05-13', 'La senda a la cruz', null, null, null)
) as v(vid, d, title, passage, descr, preacher)
where not exists (select 1 from public.sermons s where s.youtube_url = 'https://www.youtube.com/watch?v=' || v.vid);
