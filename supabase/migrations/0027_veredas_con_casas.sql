-- 0027: "Ver sin visitar" solo muestra veredas que tienen casas.
-- Así no aparecen las veredas de plazas y parques, ni las del medio de las avenidas de doble mano
-- (las casas quedan del lado de afuera), ni caminos internos.

create or replace function public.house_sides_in_bbox(p_min_lat double precision, p_min_lng double precision,
                                                      p_max_lat double precision, p_max_lng double precision)
returns table (road_id bigint, seg integer, side smallint, houses integer)
language sql stable security definer set search_path = public as $$
  select h.road_id, h.seg, h.side, count(*)::integer
  from public.houses h
  where h.road_id is not null
    and (p_max_lat - p_min_lat) <= 0.1 and (p_max_lng - p_min_lng) <= 0.1
    and h.lat between p_min_lat and p_max_lat and h.lng between p_min_lng and p_max_lng
  group by 1, 2, 3
  limit 20000
$$;
grant execute on function public.house_sides_in_bbox(double precision, double precision, double precision, double precision) to authenticated;
