\set ON_ERROR_STOP on
-- 0035: marcar calles a mano a nombre de otro, equipo en la misma vereda y punto de encuentro.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', false);
do $$ begin
  begin perform public.mark_sides_for('00000000-0000-0000-0000-0000000000c3', public.church_today(), 'flyers', '[{"road_id":990001,"seg":0,"side":1}]');
    raise exception 'FALLO: un miembro marcó calles a nombre de otro';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform public.mark_sides_for(auth.uid(), public.church_today() - 30, 'flyers', '[{"road_id":990001,"seg":0,"side":1}]');
    raise exception 'FALLO: un miembro cargó una salida vieja';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform public.mark_sides_for(auth.uid(), public.church_today() - 1, 'flyers', '[{"road_id":990001,"seg":0,"side":1}]');
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
do $$ declare s uuid; d float8; begin
  s := public.mark_sides_for('00000000-0000-0000-0000-0000000000c3', public.church_today() - 1, 'flyers', '[{"road_id":990001,"seg":0,"side":1},{"road_id":990001,"seg":1,"side":1}]');
  select distance_m into d from public.sessions where id = s;
  if not (d > 0) then raise exception 'FALLO: la salida a mano no sumó metros'; end if;
  if (select blocks from public.sessions where id = s) <> 2 then raise exception 'FALLO: cuadras de la salida a mano'; end if;
  if not exists (select 1 from public.coverage_in_bbox(-27.6, -56.0, -27.45, -55.85) where road_id = 990001 and seg = 0 and side = 1 and team_names like '%+%') then
    raise exception 'FALLO: no muestra a los dos que la hicieron juntos'; end if;
  if (select times from public.coverage where road_id = 990001 and seg = 0 and side = 1 and kind = 'flyers') <> 1 then
    raise exception 'FALLO: el equipo contó como dos visitas'; end if;
end $$;
-- punto de encuentro
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', false);
insert into public.meeting_points (lat, lng, meet_at, note) values (-27.37, -55.9, now() + interval '30 minutes', 'En la esquina del kiosco');
do $$ begin
  if not exists (select 1 from public.meeting_points) then raise exception 'FALLO: no se ve el punto de encuentro'; end if;
end $$;
reset role;
