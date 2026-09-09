-- ============ ENUMS ============
create type public.appointment_status as enum ('payment_pending','confirmed','cancelled','expired','completed');
create type public.payment_status as enum ('pending','approved','rejected','cancelled','refunded','partially_refunded','expired');
create type public.refund_status as enum ('not_requested','pending','requested','refunded','partial','failed');
create type public.modality as enum ('presencial','virtual');
create type public.consultation_type as enum ('primera_entrevista','seguimiento');
create type public.age_group as enum ('adulto','adolescente','infancia');
create type public.notification_event as enum ('appointment_confirmed','appointment_cancelled','appointment_rescheduled','payment_approved','refund_requested','refund_completed','reminder_24h');
create type public.notification_status as enum ('pending','sent','failed','skipped');

-- ============ PROFILES (admin) ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = _user_id and p.is_admin);
$$;

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and is_admin = (select is_admin from public.profiles x where x.id = auth.uid()));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ touch updated_at ============
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ============ PATIENTS ============
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.patients to service_role;
grant select on public.patients to authenticated;
alter table public.patients enable row level security;
create policy "admin read patients" on public.patients for select to authenticated using (public.is_admin(auth.uid()));
create trigger patients_touch before update on public.patients for each row execute function public.touch_updated_at();

-- ============ APPOINTMENTS ============
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  date date not null,
  start_time time not null,
  end_time time not null,
  modality public.modality not null,
  consultation_type public.consultation_type not null,
  age_group public.age_group not null,
  status public.appointment_status not null default 'payment_pending',
  secure_token text not null unique default encode(gen_random_bytes(32),'hex'),
  expires_at timestamptz,
  created_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Weekend guard at database level
create or replace function public.appointments_business_rules()
returns trigger language plpgsql as $$
begin
  if extract(isodow from new.date) > 5 then
    raise exception 'No se atiende sábados ni domingos';
  end if;
  return new;
end; $$;
create trigger appointments_rules before insert or update of date on public.appointments
  for each row when (new.status in ('payment_pending','confirmed'))
  execute function public.appointments_business_rules();
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_at();
-- Race-condition proof double-booking guard
create unique index appointments_active_slot_uniq on public.appointments (date, start_time)
  where status in ('payment_pending','confirmed');
create index appointments_date_idx on public.appointments (date);
create index appointments_status_idx on public.appointments (status);

grant all on public.appointments to service_role;
grant select, update on public.appointments to authenticated;
alter table public.appointments enable row level security;
create policy "admin read appointments" on public.appointments for select to authenticated using (public.is_admin(auth.uid()));

-- ============ PAYMENTS ============
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  provider text not null default 'mercadopago',
  provider_payment_id text,
  provider_preference_id text,
  amount numeric(12,2) not null,
  currency text not null default 'ARS',
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payments_provider_payment_uniq on public.payments (provider, provider_payment_id) where provider_payment_id is not null;
create index payments_appointment_idx on public.payments (appointment_id);
grant all on public.payments to service_role;
grant select on public.payments to authenticated;
alter table public.payments enable row level security;
create policy "admin read payments" on public.payments for select to authenticated using (public.is_admin(auth.uid()));
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

-- ============ REFUNDS ============
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  provider_refund_id text,
  amount numeric(12,2) not null,
  status public.refund_status not null default 'pending',
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Idempotency: only one non-failed refund per payment
create unique index refunds_one_active_per_payment on public.refunds (payment_id) where status <> 'failed';
grant all on public.refunds to service_role;
grant select on public.refunds to authenticated;
alter table public.refunds enable row level security;
create policy "admin read refunds" on public.refunds for select to authenticated using (public.is_admin(auth.uid()));
create trigger refunds_touch before update on public.refunds for each row execute function public.touch_updated_at();

-- ============ AVAILABILITY ============
create table public.availability (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (weekday, start_time)
);
grant all on public.availability to service_role;
grant select, insert, update, delete on public.availability to authenticated;
alter table public.availability enable row level security;
create policy "admin manage availability" on public.availability for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create trigger availability_touch before update on public.availability for each row execute function public.touch_updated_at();

insert into public.availability (weekday, start_time, is_active) values
 (1,'16:00',true),(1,'17:00',true),(1,'18:00',true),(1,'19:00',true),
 (2,'16:00',true),(2,'17:00',true),(2,'18:00',true),(2,'19:00',true),
 (3,'16:00',true),(3,'17:00',true),(3,'18:00',true),(3,'19:00',true),
 (4,'16:00',true),(4,'17:00',true),(4,'18:00',true),(4,'19:00',true),
 (5,'16:00',true),(5,'17:00',true),(5,'18:00',true),(5,'19:00',true);

-- ============ BLOCKED SLOTS ============
create table public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time,
  reason text,
  created_at timestamptz not null default now()
);
create unique index blocked_slots_full_day_uniq on public.blocked_slots (date) where start_time is null;
create unique index blocked_slots_slot_uniq on public.blocked_slots (date, start_time) where start_time is not null;
grant all on public.blocked_slots to service_role;
grant select, insert, delete on public.blocked_slots to authenticated;
alter table public.blocked_slots enable row level security;
create policy "admin manage blocks" on public.blocked_slots for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ SITE SETTINGS ============
create table public.site_settings (
  id boolean primary key default true check (id),
  professional_name text not null default 'Lic. Ayelen Pajuelo Piccoli',
  license text not null default '1029',
  whatsapp text not null default '+54 9 3704 28-6240',
  email text not null default '',
  instagram text not null default 'https://www.instagram.com/ayelenpajuelo/?hl=es',
  address text not null default 'Necochea 655, Resistencia, Chaco',
  price_presencial numeric(12,2) not null default 0,
  price_virtual numeric(12,2) not null default 0,
  hold_minutes integer not null default 20,
  updated_at timestamptz not null default now()
);
grant all on public.site_settings to service_role;
grant select, update on public.site_settings to authenticated;
alter table public.site_settings enable row level security;
create policy "admin manage settings" on public.site_settings for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create trigger site_settings_touch before update on public.site_settings for each row execute function public.touch_updated_at();
insert into public.site_settings (id) values (true);

-- ============ NOTIFICATIONS ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  event public.notification_event not null,
  channel text not null default 'whatsapp',
  status public.notification_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index notifications_event_uniq on public.notifications (appointment_id, event, channel);
grant all on public.notifications to service_role;
grant select on public.notifications to authenticated;
alter table public.notifications enable row level security;
create policy "admin read notifications" on public.notifications for select to authenticated using (public.is_admin(auth.uid()));
create trigger notifications_touch before update on public.notifications for each row execute function public.touch_updated_at();