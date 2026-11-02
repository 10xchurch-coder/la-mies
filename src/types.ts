// Filas de la base como las devuelve Supabase.
export type Role = 'member' | 'captain' | 'secretary' | 'admin';
export type OutingKind = 'soulwinning' | 'flyers';

export type Church = {
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
};

export type Contact = {
  id: string;
  church_id: string;
  created_by: string;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  name: string;
  age: number | null;
  sex: 'm' | 'f' | null;
  marital: 'single' | 'married' | 'partner' | 'widowed' | null;
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
  dni: string | null;
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

export type ContactChild = { id: string; contact_id: string; name: string; age: number | null };

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
};
export type ClassAttendance = { id: string; class_id: string; on_date: string; contact_id: string; present: boolean; note: string | null };

export type Material = {
  id: string; church_id: string; series: string; title: string; chapter_order: number; body: string | null;
  file_path: string | null; file_name: string | null; created_by: string | null; created_at: string;
};

export type Ministry = {
  id: string; church_id: string; name: string; description: string | null; icon: string; leader_id: string | null;
  can_take_attendance: boolean; is_teaching: boolean; sort_order: number;
};
export type MinistryMember = { ministry_id: string; profile_id: string; is_leader: boolean; joined_at: string };
export type MinistryMessage = {
  id: string; church_id: string; ministry_id: string; user_id: string; kind: 'message' | 'recommendation' | 'announcement'; body: string; created_at: string;
};
export type Duty = {
  id: string; church_id: string; ministry_id: string; on_date: string; profile_id: string | null; contact_id: string | null;
  task: string; arrive_time: string | null; note: string | null;
};

export type NotificationRow = { id: string; kind: string; title: string; body: string; link: string | null; created_at: string; read_at: string | null };

export type Sermon = {
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
  background: string;
  created_by: string | null;
  created_at: string;
};

export type ReadingReward = { days: number; label: string; earned: boolean };
export type ReadingStreak = { current: number; best: number; total: number; read_today: boolean; rewards: ReadingReward[] };
export type ReadingBoardRow = { user_id: string; display_name: string; photo_path: string | null; current_streak: number; best_streak: number };

export type AccountRow = { id: string; display_name: string; email: string; role: Role; disabled_at: string | null; has_mfa: boolean; last_sign_in: string | null };
