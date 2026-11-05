-- Fotos elegidas según el versículo (noviembre 2026). Fondo "u:<id de Unsplash>"; licencia libre de Unsplash.
-- Los días que no tienen una imagen clara (11, 13 y 19) siguen con la foto del día ("auto").
-- Solo cambia los días que todavía están en "auto" (no pisa un fondo elegido a mano por la iglesia).
update public.daily_content d set background = 'u:photo-' || v.photo
from (values
  ('2026-11-05', '1766773725488-1a56bb11f4b1'), -- Salmos 119:105 · farol en un sendero
  ('2026-11-06', '1533000971552-6a962ff0b9f9'), -- Josué 1:8 · Biblia abierta al amanecer
  ('2026-11-07', '1509021436665-8f07dbf5bf1d'), -- Hebreos 4:12 · Biblia abierta
  ('2026-11-08', '1762342843208-9885e3a4960b'), -- Mateo 9:37-38 · campo de trigo
  ('2026-11-09', '1533757879476-8f4a3cb1ae4b'), -- Filipenses 4:6-7 · lago en calma
  ('2026-11-10', '1437603568260-1950d3ca6eab'), -- 1 Tesalonicenses 5:16-18 · manos orando sobre la Biblia
  ('2026-11-12', '1528353518104-dbd48bee7bc4'), -- Jeremías 33:3 · cielo estrellado
  ('2026-11-14', '1450558415837-1f5e21a17709'), -- Romanos 1:16 · la cruz
  ('2026-11-15', '1614730321146-b6fa6a46bcb4'), -- Marcos 16:15 · el mundo
  ('2026-11-16', '1494783367193-149034c05e8f'), -- Hechos 1:8 · camino hasta el horizonte
  ('2026-11-17', '1437252611977-07f74518abd7'), -- Juan 4:35 · campos listos para la siega
  ('2026-11-18', '1575014912260-91c2b5ad7441'), -- Lucas 19:10 · oveja sola
  ('2026-11-20', '1767457108672-79c6dd48a165'), -- Gálatas 6:9 · brote
  ('2026-11-21', '1515276427842-f85802d514a2'), -- Salmos 126:5-6 · gavillas
  ('2026-11-22', '1759127481171-30a27de310ad'), -- Hebreos 10:24-25 · la iglesia reunida
  ('2026-11-23', '1779031242469-ef2e794987b0'), -- Colosenses 3:23-24 · trabajo hecho de corazón
  ('2026-11-24', '1649585311318-f855eb785fd2'), -- Salmos 100:4-5 · puerta abierta
  ('2026-11-25', '1470115636492-6d2b56f9146d'), -- Proverbios 3:5-6 · vereda derecha con luz
  ('2026-11-26', '1598312276291-6cb6c0a70cc7'), -- Isaías 41:10 · mano hacia la luz
  ('2026-11-27', '1514241516423-6c0a5e031aa2'), -- Lamentaciones 3:22-23 · amanecer
  ('2026-11-28', '1764377850162-62faa4ddda62'), -- 1 Corintios 15:58 · roca firme ante las olas
  ('2026-11-29', '1623612374192-bb28178ed476'), -- Romanos 12:1-2 · mariposa (transformación)
  ('2026-11-30', '1589051088132-06f36a22012a')  -- Filipenses 1:6 · el alfarero
) as v(d, photo)
where d.church_id = '2c35b2a1-494d-475d-8a87-b7df18974838' and d.on_date = v.d::date
  and coalesce(d.background, 'auto') = 'auto';
