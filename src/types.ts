// Filas de la base como las devuelve Supabase.
export type Role = 'member' | 'captain' | 'evangelism' | 'deacon' | 'secretary' | 'assistant_pastor' | 'app_admin' | 'admin';
export type OutingKind = 'soulwinning' | 'flyers';

export type Church = {
  logo_path?: string | null;
  website?: string | null;
  youtube_channel?: string | null;
  absence_recipients?: string[] | null;
  report_recipients?: string[] | null;
  id: string;
  name: string;
  city: string | null;
  country: string;
  join_code: string;
  timezone: string;
  grouping: 'bus_routes' | 'groups' | 'none';
  giving: Giving | null;
};

export type Giving = { titular?: string; banco?: string; alias?: string; cbu?: string; cuit?: string; nota?: string };

export type Group = { id: string; church_id: string; name: string; captain_id: string | null };

export type Profile = {
  rules_accepted_at?: string | null;
  finance_role?: 'manager' | 'treasurer' | 'secretary' | 'viewer' | 'none' | null;
  title?: string | null;
  directory_visible?: boolean;
  id: string;
  church_id: string | null;
  group_id: string | null;
  role: Role;
  is_network_admin: boolean;
  display_name: string;
  phone: string | null;
  home_lat: number | null;
  home_lng: number | null;
  home_address: string | null;
  share_default: 'group' | 'me' | 'ask';
  biometric_lock: boolean;
  push_token?: string | null;
  takes_attendance?: boolean;
  disabled_at?: string | null;
};

export type Session = {
  id: string;
  church_id: string;
  user_id: string;
  kind: OutingKind;
  started_at: string;
  ended_at: string | null;
  distance_m: number;
  blocks: number;
  presentations: number;
  promises: number;
  contacts: number;
  auto_stopped: boolean;
  trimmed_at: string | null;
};

export type TrackPointRow = {
  id: number;
  session_id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
};

export type RoadRow = {
  id: number;
  name: string | null;
  highway: string | null;
  coords: [number, number][];
  min_lat: number;
  min_lng: number;
  max_lat: number;
  max_lng: number;
};

export type CoverageRow = {
  road_id: number;
  seg: number;
  side: 1 | -1;
  kind: OutingKind;
  last_covered_at: string;
  last_user_name: string | null;
  times: number;
  last_session_id?: string | null;
  last_user_id?: string | null;
  team_names?: string | null;
};

export type Contact = {
  saved_on?: string | null;
  id: string;
  church_id: string;
  created_by: string;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  name: string;
  age: number | null;
  sex: 'm' | 'f' | null;
  marital: 'single' | 'married' | 'partner' | 'widowed' | 'separated' | 'divorced' | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  address_hint: string | null;
  road_id: number | null;
  side: 1 | -1 | null;
  interest: 'very' | 'some' | 'little' | 'none';
  promise_day: 'sat' | 'sun' | null;
  pickup: boolean;
  pickup_time: string | null;
  gospel_presented: boolean;
  discipleship_since: string | null;
  baptized_on: string | null;
  /** Bautismo después de creer en Cristo (no cuenta el de bebé). */
  baptized: boolean;
  /** true: se bautizó en esta iglesia (con fecha). false: ya venía bautizado de antes. */
  baptized_here: boolean;
  dni: string | null;
  /** Cónyuge: otra ficha de la iglesia, o solo el nombre. */
  spouse_id: string | null;
  spouse_name: string | null;
  share_mode: 'group' | 'me' | 'custom';
  follow_up_user_id: string | null;
  archived: boolean;
  status: PersonStatus;
  member_since: string | null;
  photo_path: string | null;
  birthdate: string | null;
  address: string | null;
  email: string | null;
  group_id: string | null;
  profile_id: string | null;
  auto_created: boolean;
};

export type PersonStatus = 'contact' | 'visitor' | 'member';

export type ContactChild = { id: string; contact_id: string; name: string; age: number | null; birthdate: string | null; child_contact_id?: string | null; photo_path?: string | null };

export type ContactVisit = {
  id: string;
  contact_id: string;
  user_id: string;
  session_id: string | null;
  visited_at: string;
  note: string | null;
  gospel_presented: boolean;
  promise_day: 'sat' | 'sun' | null;
};

export type Attendance = { id: string; contact_id: string; attended_on: string; service: 'sat' | 'sun' | 'other'; service_id: string };

export type TeamLiveRow = {
  user_id: string;
  display_name: string;
  session_id: string;
  kind: OutingKind;
  started_at: string;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  updated_at: string | null;
  presentations: number;
  promises: number;
  contacts: number;
};

export type ScoreRow = {
  user_id: string;
  display_name: string;
  group_id: string | null;
  group_name: string | null;
  presentations: number;
  promises: number;
  came: number;
  points: number;
};

export type TeamTotals = {
  /** Casas frente a las veredas recorridas (según el mapa de edificios). */
  houses?: number | null;
  sessions: number;
  members: number;
  minutes: number;
  km: number;
  blocks: number;
  presentations: number;
  promises: number;
  came: number;
  discipleship: number;
  baptisms: number;
  contacts: number;
};

export type ChurchReport = {
  from: string;
  to: string;
  totals: TeamTotals & { pending_pickups: number };
  members: { user_id: string; display_name: string; sessions: number; presentations: number; promises: number; last_session: string | null }[];
  sessions: (Session & { display_name: string })[];
};

export type TrainingItem = {
  id: string;
  church_id: string | null;
  category: string;
  title: string;
  kind: 'article' | 'video';
  summary: string | null;
  body: string | null;
  video_url: string | null;
  minutes: number | null;
  sort_order: number;
};

// ---------- Parte 2: la iglesia ----------
export type ChurchService = { id: string; church_id: string; name: string; dow: number; time: string; main: boolean; active: boolean; sort_order: number };

export type ClassRow = { id: string; church_id: string; name: string; age_min: number | null; age_max: number | null; days: string[]; active: boolean; sort_order: number };
export type ClassTeacher = { class_id: string; profile_id: string; is_helper: boolean };
export type ClassSchedule = {
  id: string; church_id: string; class_id: string; on_date: string; teacher_id: string | null; helper_id: string | null; material_id: string | null; note: string | null;
  /** Maestro y ayudante por ficha de persona (no necesitan cuenta). */
  teacher_contact_id: string | null; helper_contact_id: string | null;
  teacher_contact?: { id: string; name: string } | null; helper_contact?: { id: string; name: string } | null;
};
export type ClassAttendance = { id: string; class_id: string; on_date: string; contact_id: string; present: boolean; note: string | null };

export type Material = {
  id: string; church_id: string; series: string; title: string; chapter_order: number; body: string | null;
  file_path: string | null; file_name: string | null; created_by: string | null; created_at: string;
  class_id?: string | null;
};

export type Ministry = {
  id: string; church_id: string; name: string; description: string | null; icon: string; leader_id: string | null;
  can_take_attendance: boolean; is_teaching: boolean; sort_order: number;
};
export type MinistryMember = { ministry_id: string; profile_id: string; is_leader: boolean; joined_at: string };
/** Integrante de un ministerio por ficha (puede no tener la app). */
export type MinistryPerson = { contact_id: string; name: string; photo_path: string | null; profile_id: string | null; is_leader: boolean; joined_at: string };
export type MinistryPersonRow = { ministry_id: string; contact_id: string; is_leader: boolean; joined_at: string };
export type MinistryMessage = {
  id: string; church_id: string; ministry_id: string; user_id: string; kind: 'message' | 'recommendation' | 'announcement'; body: string; created_at: string;
};
export type Duty = {
  id: string; church_id: string; ministry_id: string; on_date: string; profile_id: string | null; contact_id: string | null;
  task: string; arrive_time: string | null; note: string | null;
};

export type NotificationRow = { id: string; kind: string; title: string; body: string; link: string | null; created_at: string; read_at: string | null };

export type Sermon = {
  summary?: string | null;
  notes_outline?: string | null;
  id: string; church_id: string; title: string; preacher: string | null; preached_on: string; passage: string | null; description: string | null;
  youtube_url: string | null; audio_path: string | null; audio_name: string | null; created_at: string;
};

export type Engagement = {
  contact_id: string; name: string; photo_path: string | null; status: PersonStatus; group_id: string | null;
  attended: number; possible: number; pct: number; category: FaithCategory; last_attended: string | null; class_days: number;
};
export type FaithCategory = 'fiel' | 'constante' | 'frecuente' | 'ocasional' | 'esporadico' | 'inactivo' | 'sin_asistencia' | 'nuevo';

export type JourneyStep = { step: string; label: string; at: string; by?: string | null };

export type UpcomingItem = {
  kind: 'duty' | 'class' | 'class_helper'; id: string; on_date: string; title: string; detail: string;
  ministry_id: string | null; class_id: string | null; material_id: string | null;
};

export type SheetRow = { contact_id: string; name: string; photo_path: string | null; status: PersonStatus; group_id: string | null; present: boolean };

export type AbsenceRow = {
  contact_id: string; name: string; photo_path: string | null; phone: string | null; status: PersonStatus;
  group_id: string | null; group_name: string | null; last_attended: string | null;
  /** Fines de semana seguidos sin venir (1, 2 o 3 = tres o más). */
  weeks_missed?: number; last_visit?: string | null;
};

// ---------- Parte 3: versículo del día, devocional, racha ----------
export type DailyContent = {
  id: string;
  church_id: string | null;
  on_date: string;
  reference: string;
  verse: string;
  message: string | null;
  devotional: string | null;
  /** Estudio completo (5–10 min, con pasajes en texto completo). */
  study: string | null;
  /** Oración breve para cerrar. */
  prayer: string | null;
  background: string;
  created_by: string | null;
  created_at: string;
};

export type ReadingReward = { days: number; label: string; earned: boolean };
export type ReadingStreak = { current: number; best: number; total: number; read_today: boolean; rewards: ReadingReward[] };
export type ReadingBoardRow = { user_id: string; display_name: string; photo_path: string | null; current_streak: number; best_streak: number };

export type AccountRow = { id: string; display_name: string; email: string; role: Role; disabled_at: string | null; has_mfa: boolean; last_sign_in: string | null; deletion_requested_at: string | null };

// ---------- Devocional: comentarios del día y me gusta ----------
export type DailyComment = { id: string; user_id: string; name: string; photo_path: string | null; body: string; created_at: string; mine: boolean };
/** Cuántos comentarios y corazones tiene un día; "open" = todavía se puede comentar (es hoy). */
export type DailySocial = { comments: number; likes: number; liked: boolean; open: boolean };

// ---- v0.7 ----
export type OutingRow = {
  id: string; user_id: string; display_name: string; kind: OutingKind; started_at: string; ended_at: string | null;
  distance_m: number; contacts: number; presentations: number; promises: number; auto_stopped: boolean;
  trimmed_at: string | null; last_point: string | null;
};
export type SessionSummary = {
  id: string; user_id: string; name: string; kind: OutingKind; started_at: string; ended_at: string | null; minutes: number;
  distance_m: number; sidewalks: number; blocks: number; houses: number; contacts: number; presentations: number; promises: number;
};
export type HouseRow = { id: number; lat: number; lng: number; road_id: number | null; seg: number | null; side: number | null };
export type Zone = {
  id: string; church_id: string; name: string; color: string; polygon: [number, number][]; assigned: string[];
  on_date: string | null; note: string | null; archived: boolean; created_by: string | null; created_at: string;
};
export type ZoneProgress = { sidewalks: number; done: number; houses: number; houses_done: number };
export type FollowupRow = {
  id: string; name: string; phone: string | null; photo_path: string | null; status: string; interest: string | null; promise_day: string | null;
  created_at: string; last_visit: string | null; last_attended: string | null; address_hint: string | null; saved_on: string | null;
};
export type PipelineRow = { month: string; contacts: number; gospel: number; visited: number; came: number; saved: number; baptized: number; members: number };
export type ChurchEvent = {
  id: string; church_id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean; place: string | null;
  description: string | null; weekly: boolean; source_id: string | null; yearly?: boolean;
  photo_path?: string | null; image_key?: string | null; cost?: string | null; transport?: string | null; bring?: string | null;
  program?: string | null; contact_name?: string | null; contact_phone?: string | null;
  registration?: boolean; reg_price?: number | null; reg_capacity?: number | null; reg_deadline?: string | null;
  reg_ask_ride?: boolean; reg_ask_lodging?: boolean;
};
export type EventRegistration = {
  id: string; event_id: string; occurs_on: string; user_id: string | null; name: string; phone: string | null; people: number;
  needs_ride: boolean; needs_lodging: boolean; notes: string | null; paid_amount: number; paid_note: string | null; created_at: string;
};
export type PrayerRow = {
  id: string; user_id: string; author: string | null; body: string; visibility: 'church' | 'pastor' | 'people'; people: string[];
  anonymous: boolean; answered_at: string | null; answer_note: string | null; created_at: string; prayed: number; i_prayed: boolean; mine: boolean;
};
export type Announcement = {
  id: string; church_id: string; author_id: string | null; title: string; body: string;
  audience: 'all' | 'staff' | 'leaders' | 'teachers' | 'ministry' | 'group'; ministry_id: string | null; group_id: string | null; sent_to: number; created_at: string;
};
export type SuggestionRow = { id: string; author: string | null; mine: boolean; body: string; anonymous: boolean; status: 'new' | 'seen' | 'done'; reply: string | null; created_at: string };
export type DirectoryRow = { id: string; display_name: string; phone: string | null; title: string | null; photo_path: string | null; contact_id: string | null };
export type WeeklyReport = {
  from: string; to: string; outings: number; people_out: number; minutes: number; km: number; houses: number; contacts: number; gospel: number;
  promises: number; visits: number; attendance: number; first_time: number; saved: number; baptisms: number; new_members: number; absent: number;
  services?: { name: string; dow: number; count: number; visitors: number }[];
  classes?: { name: string; present: number; absent: number; enrolled: number; days: number }[];
};

export type ProgressRow = {
  month: string; avg_attendance: number; people: number; first_time: number; members: number; new_members: number; saved: number; baptisms: number;
  class_present: number; contacts: number; gospel: number; promises: number; outings: number; people_out: number; hours: number; km: number; houses: number;
};

// ---------- Finanzas ----------
export type FinFund = { id: string; name: string; kind: 'general' | 'missions' | 'designated' | 'vehicle' | 'other'; description: string | null; currency: string; opening_balance: number; opening_date: string | null; active: boolean; sort_order: number };
export type FinAccount = { id: string; name: string; kind: 'cash' | 'bank' | 'digital'; currency: string; active: boolean; sort_order: number };
export type FinCategory = { id: string; name: string; direction: 'in' | 'out'; active: boolean; sort_order: number };
export type FinKind = 'income' | 'expense' | 'transfer';
export type FinMethod = 'cash' | 'transfer' | 'card' | 'check' | 'other';
export type FinEntry = {
  id: string; on_date: string; kind: FinKind; fund_id: string; to_fund_id: string | null; account_id: string | null; to_account_id?: string | null; category_id: string | null;
  amount: number; currency: string; method: FinMethod; description: string | null; counterpart: string | null; source: string | null;
  created_by: string | null; created_at: string; voided_at: string | null; void_reason: string | null;
};
export type FinAttachment = { id: string; entry_id: string | null; month: string; path: string; kind: 'receipt' | 'bank_screen' | 'other'; file_name: string | null; note: string | null; created_at: string };
export type FinBalance = { fund_id: string; fund: string; kind: string; currency: string; opening: number; income: number; expense: number; transfers_in: number; transfers_out: number; closing: number };
export type FinMonthly = { month: string; fund_id: string; fund: string; income: number; expense: number; net: number };
export type FinByCategory = { direction: 'in' | 'out'; category: string; fund: string; total: number; entries: number };
export type FinAccountBalance = { account_id: string; account: string; fund_id: string; fund: string; currency: string; balance: number };

export type MeetingPoint = { id: string; church_id: string; created_by: string | null; lat: number; lng: number; meet_at: string; note: string | null; created_at: string };
