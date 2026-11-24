// Modo presentación: lo que se trae de otras partes de la app (anuncios, calendario y orden del culto).
import { listAnnouncements, listEvents } from './api';
import { supabase } from './supabase';
import type { AnnouncementsItem, NoticeCard } from './present';
import { announcementCards, cleanPlanEntries, type PlanEntry } from './presentExtras';

/** Arma de nuevo las diapositivas de anuncios con lo que hay ahora en Anuncios y en el Calendario. */
export async function loadAnnouncementCards(item: AnnouncementsItem): Promise<NoticeCard[]> {
  const [anns, events] = await Promise.all([
    item.anns ? listAnnouncements() : Promise.resolve([]),
    item.events ? listEvents() : Promise.resolve([]),
  ]);
  return announcementCards(anns, events, item, new Date());
}

export type ServicePlanRow = { id: string; service_date: string; title: string | null };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Los órdenes del culto cargados (de ayer en adelante). null si esa parte de la app todavía no existe
 * o no se puede leer: en ese caso el botón no se muestra.
 */
export async function listServicePlans(churchId: string): Promise<ServicePlanRow[] | null> {
  try {
    const from = new Date();
    from.setDate(from.getDate() - 1);
    const { data, error } = await supabase.from('service_plans').select('id, service_date, title')
      .eq('church_id', churchId).gte('service_date', iso(from)).order('service_date').limit(12);
    if (error || !Array.isArray(data)) return null;
    return (data as Record<string, unknown>[])
      .filter((r) => typeof r.id === 'string' && typeof r.service_date === 'string')
      .map((r) => ({ id: r.id as string, service_date: r.service_date as string, title: typeof r.title === 'string' ? r.title : null }));
  } catch { return null; }
}

/** Las partes de un orden del culto. null si no se pudo leer. */
export async function getServicePlanEntries(id: string): Promise<PlanEntry[] | null> {
  try {
    const { data, error } = await supabase.from('service_plans').select('items').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return cleanPlanEntries((data as { items?: unknown }).items);
  } catch { return null; }
}
