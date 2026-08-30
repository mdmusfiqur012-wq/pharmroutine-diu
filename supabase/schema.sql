-- ============================================================================
-- DIU Pharmacy — Class & Laboratory Routine Portal
-- Supabase PostgreSQL schema: tables, constraints, conflict trigger, RLS.
--
-- Run this in the Supabase SQL Editor (or `psql -f schema.sql`).
-- The app works with zero backend config in demo mode; connect it by setting
-- VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.
-- ============================================================================

-- ---------------------------------------------------------------- extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type faculty_type as enum ('regular','guest','ged','nfe','external');
exception when duplicate_object then null; end $$;
do $$ begin
  create type course_mode as enum ('theory','lab','theory_lab');
exception when duplicate_object then null; end $$;
do $$ begin
  create type course_department as enum ('pharmacy','ged','nfe','agriculture');
exception when duplicate_object then null; end $$;
do $$ begin
  create type room_type as enum ('theory','lab','multipurpose');
exception when duplicate_object then null; end $$;
do $$ begin
  create type class_type as enum ('theory','lab');
exception when duplicate_object then null; end $$;
do $$ begin
  create type entry_status as enum ('active','cancelled','rescheduled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type user_role as enum ('admin','faculty','student');
exception when duplicate_object then null; end $$;
do $$ begin
  create type announcement_category as enum ('notice','urgent','event','routine');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- semesters
create table if not exists semesters (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,                    -- "Fall 2026"
  code        text not null unique,             -- "FA26"
  is_active   boolean not null default false,
  start_date  date,
  end_date    date
);

-- ---------------------------------------------------------------- batches
create table if not exists batches (
  id              uuid primary key default uuid_generate_v4(),
  batch_no        int  not null unique check (batch_no between 1 and 999),
  name            text not null,                -- "Batch 34"
  admission_year  int  not null,
  current_level   int  not null default 1 check (current_level between 1 and 8),
  is_active       boolean not null default true
);

-- ---------------------------------------------------------------- sections
create table if not exists sections (
  id        uuid primary key default uuid_generate_v4(),
  name      text not null check (name in ('A','B')),
  batch_id  uuid not null references batches(id) on delete cascade,
  unique (batch_id, name)
);

-- ---------------------------------------------------------------- lab groups (A1, A2, B1, B2)
create table if not exists lab_groups (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null check (name in ('A1','A2','B1','B2')),
  section_id  uuid not null references sections(id) on delete cascade,
  unique (section_id, name)
);

-- ---------------------------------------------------------------- faculty
create table if not exists faculty (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  initials      text not null,
  designation   text,
  department    text not null default 'Pharmacy',
  faculty_type  faculty_type not null default 'regular',
  email         text,
  is_active     boolean not null default true
);

-- ---------------------------------------------------------------- courses
create table if not exists courses (
  id            uuid primary key default uuid_generate_v4(),
  code          text not null unique,
  title         text not null,
  credit        numeric(3,1) not null default 3 check (credit > 0),
  course_mode   course_mode not null default 'theory',
  department    course_department not null default 'pharmacy',
  level         int not null default 1 check (level between 1 and 8),
  is_active     boolean not null default true
);

-- ---------------------------------------------------------------- rooms
create table if not exists rooms (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null unique,
  name        text not null,
  building    text,
  room_type   room_type not null default 'theory',
  capacity    int not null default 60,
  is_active   boolean not null default true
);

-- ---------------------------------------------------------------- time slots (all classes = 1h 30m)
create table if not exists time_slots (
  id          uuid primary key default uuid_generate_v4(),
  label       text not null,                    -- "8:30 AM – 10:00 AM"
  start_time  time not null,
  end_time    time not null,
  sequence    int  not null unique,
  is_active   boolean not null default true,
  check (end_time > start_time)
);

-- ---------------------------------------------------------------- class days
create table if not exists class_days (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,             -- "Saturday"
  short_name  text not null,                    -- "Sat"
  sequence    int  not null unique,
  is_active   boolean not null default true
);

-- ---------------------------------------------------------------- routine entries
-- Theory classes have lab_group_id = NULL; laboratory classes MUST have one.
create table if not exists routine_entries (
  id            uuid primary key default uuid_generate_v4(),
  semester_id   uuid not null references semesters(id) on delete cascade,
  batch_id      uuid not null references batches(id) on delete cascade,
  section_id    uuid not null references sections(id) on delete cascade,
  lab_group_id  uuid references lab_groups(id) on delete cascade,
  course_id     uuid not null references courses(id),
  faculty_id    uuid not null references faculty(id),
  room_id       uuid not null references rooms(id),
  day_id        uuid not null references class_days(id),
  time_slot_id  uuid not null references time_slots(id),
  class_type    class_type not null,
  status        entry_status not null default 'active',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- integrity: theory ⇔ no group, lab ⇔ group
  constraint chk_theory_no_group check (class_type = 'lab' OR lab_group_id is null),
  constraint chk_lab_has_group  check (class_type = 'lab' XOR lab_group_id is null),
  -- the lab group must belong to the entry's section
  constraint chk_group_belongs_to_section
    foreign key (lab_group_id) references lab_groups(id)
    -- enforced by trigger below (cross-table)
);

-- ---------------------------------------------------------------- batch off days (Semester + Batch + Day — independent per batch)
create table if not exists batch_off_days (
  id           uuid primary key default uuid_generate_v4(),
  semester_id  uuid not null references semesters(id) on delete cascade,
  batch_id     uuid not null references batches(id) on delete cascade,
  day_id       uuid not null references class_days(id) on delete cascade,
  reason       text,
  is_active    boolean not null default true,
  unique (semester_id, batch_id, day_id)
);

-- ---------------------------------------------------------------- announcements
create table if not exists announcements (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  body            text not null,
  category        announcement_category not null default 'notice',
  semester_id     uuid references semesters(id) on delete set null,
  batch_id        uuid references batches(id) on delete set null,
  pinned          boolean not null default false,
  is_active       boolean not null default true,
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- settings (JSON)
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

-- ---------------------------------------------------------------- profiles (auth-linked)
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      text,
  role       user_role not null default 'student',
  department text,
  faculty_id uuid references faculty(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- updated_at trigger
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists trg_routine_updated on routine_entries;
create trigger trg_routine_updated before update on routine_entries
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- auto profile
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'student')
  on conflict (id) do nothing;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- integrity trigger: lab group ↔ section
create or replace function check_group_section() returns trigger as $$
declare
  sec_of_group uuid;
begin
  select section_id into sec_of_group from lab_groups where id = new.lab_group_id;
  if sec_of_group is distinct from new.section_id then
    raise exception 'The laboratory group does not belong to the selected section (group section = %, entry section = %)',
      sec_of_group, new.section_id;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_group_section on routine_entries;
create trigger trg_group_section before insert or update on routine_entries
  for each row when (new.lab_group_id is not null)
  execute function check_group_section();

-- ============================================================================
-- CONFLICT PREVENTION — server-side hard rules.
-- 1. one faculty, one class per day+slot     2. one class per room per slot
-- 3. one class per section per slot          4. one lab per group per slot
-- ============================================================================
create or replace function enforce_routine_conflicts() returns trigger as $$
declare
  clash record;
  who text;
begin
  if new.status = 'cancelled' and tg_op = 'UPDATE' then
    return new; -- cancelled rows may overlap
  end if;

  if tg_op = 'UPDATE' and new.status = 'cancelled' then
    return new;
  end if;

  -- 1. faculty
  select e.id, c.title, f.name, b.name as bname, s.name as sname, g.name as gname, r.code as rcode, d.short_name as dname, ts.label as tlabel
    into clash
    from routine_entries e
    join courses c on c.id = e.course_id
    join faculty f on f.id = e.faculty_id
    join batches b on b.id = e.batch_id
    join sections s on s.id = e.section_id
    left join lab_groups g on g.id = e.lab_group_id
    join rooms r on r.id = e.room_id
    join class_days d on d.id = e.day_id
    join time_slots ts on ts.id = e.time_slot_id
   where e.faculty_id = new.faculty_id
     and e.day_id = new.day_id
     and e.time_slot_id = new.time_slot_id
     and e.status <> 'cancelled'
     and e.id is distinct from new.id
   limit 1;
  if found then
    raise exception 'CONFLICT [faculty]: % is already teaching "%" (% Section %%) in % on % (%) — faculty double-booking is not allowed.',
      clash.name, clash.title, clash.bname, clash.sname, coalesce(clash.gname,''), clash.rcode, clash.dname, clash.tlabel;
  end if;

  -- 2. room
  select e.id, c.title, f.name, b.name as bname, s.name as sname, g.name as gname, r.code as rcode, d.short_name as dname, ts.label as tlabel
    into clash
    from routine_entries e
    join courses c on c.id = e.course_id
    join faculty f on f.id = e.faculty_id
    join batches b on b.id = e.batch_id
    join sections s on s.id = e.section_id
    left join lab_groups g on g.id = e.lab_group_id
    join rooms r on r.id = e.room_id
    join class_days d on d.id = e.day_id
    join time_slots ts on ts.id = e.time_slot_id
   where e.room_id = new.room_id
     and e.day_id = new.day_id
     and e.time_slot_id = new.time_slot_id
     and e.status <> 'cancelled'
     and e.id is distinct from new.id
   limit 1;
  if found then
    raise exception 'CONFLICT [room]: % is already occupied by "%" (% Section %%) with % — room double-booking is not allowed.',
      clash.rcode, clash.title, clash.bname, clash.sname, coalesce(clash.gname,''), clash.name;
  end if;

  -- 3. section (any class of the same batch+section)
  select e.id, c.title, b.name as bname, s.name as sname, g.name as gname, f.name as fname, d.short_name as dname, ts.label as tlabel
    into clash
    from routine_entries e
    join courses c on c.id = e.course_id
    join batches b on b.id = e.batch_id
    join sections s on s.id = e.section_id
    left join lab_groups g on g.id = e.lab_group_id
    join faculty f on f.id = e.faculty_id
    join class_days d on d.id = e.day_id
    join time_slots ts on ts.id = e.time_slot_id
   where e.batch_id = new.batch_id
     and e.section_id = new.section_id
     and e.day_id = new.day_id
     and e.time_slot_id = new.time_slot_id
     and e.status <> 'cancelled'
     and e.id is distinct from new.id
   limit 1;
  if found then
    raise exception 'CONFLICT [section]: % Section % already has "%"% on % (%) with % — a section cannot have two classes at the same time.',
      clash.bname, clash.sname, clash.title, coalesce(' (Group '||clash.gname||')',''), clash.fname, clash.dname, clash.tlabel;
  end if;

  -- 4. lab group
  if new.lab_group_id is not null then
    select e.id, c.title, g.name as gname, b.name as bname, s.name as sname, d.short_name as dname, ts.label as tlabel
      into clash
      from routine_entries e
      join courses c on c.id = e.course_id
      join batches b on b.id = e.batch_id
      join sections s on s.id = e.section_id
      join lab_groups g on g.id = e.lab_group_id
      join class_days d on d.id = e.day_id
      join time_slots ts on ts.id = e.time_slot_id
     where e.lab_group_id = new.lab_group_id
       and e.day_id = new.day_id
       and e.time_slot_id = new.time_slot_id
       and e.status <> 'cancelled'
       and e.id is distinct from new.id
     limit 1;
    if found then
      raise exception 'CONFLICT [lab_group]: Group % (% Section %) already has "%" on % (%) — a lab group cannot attend two sessions at once.',
        clash.gname, clash.bname, clash.sname, clash.title, clash.dname, clash.tlabel;
    end if;
  end if;

  return new;
end $$ language plpgsql;

drop trigger if exists trg_routine_conflicts on routine_entries;
create trigger trg_routine_conflicts before insert or update on routine_entries
  for each row execute function enforce_routine_conflicts();

-- ---------------------------------------------------------------- RPC: dry-run conflict check (used by the admin form)
create or replace function check_routine_conflict(
  p_batch_id uuid, p_section_id uuid, p_lab_group_id uuid, p_course_id uuid,
  p_faculty_id uuid, p_room_id uuid, p_day_id uuid, p_time_slot_id uuid,
  p_class_type class_type, p_exclude_id uuid default null
) returns jsonb language plpgsql stable as $$
declare
  result jsonb := '[]'::jsonb;
  row record;
begin
  for row in
    select 'faculty' as kind, e.id, c.title, f.name, r.code, d.short_name, ts.label
      from routine_entries e join courses c on c.id=e.course_id join faculty f on f.id=e.faculty_id
      join rooms r on r.id=e.room_id join class_days d on d.id=e.day_id join time_slots ts on ts.id=e.time_slot_id
     where e.faculty_id=p_faculty_id and e.day_id=p_day_id and e.time_slot_id=p_time_slot_id
       and e.status<>'cancelled' and e.id is distinct from p_exclude_id limit 1
  loop
    result := result || jsonb_build_object('kind','faculty','message',
      format('%s is already assigned to "%s" in %s on %s (%s)', row.name, row.title, row.code, row.short_name, row.label));
  end loop;
  for row in
    select 'room' as kind, e.id, c.title, f.name, r.code, d.short_name, ts.label
      from routine_entries e join courses c on c.id=e.course_id join faculty f on f.id=e.faculty_id
      join rooms r on r.id=e.room_id join class_days d on d.id=e.day_id join time_slots ts on ts.id=e.time_slot_id
     where e.room_id=p_room_id and e.day_id=p_day_id and e.time_slot_id=p_time_slot_id
       and e.status<>'cancelled' and e.id is distinct from p_exclude_id limit 1
  loop
    result := result || jsonb_build_object('kind','room','message',
      format('%s is already occupied by "%s" with %s', row.code, row.title, row.name));
  end loop;
  return result;
end $$;

-- ============================================================================
-- ROW LEVEL SECURITY — anonymous + authenticated users can read catalog and
-- routine data (public interface); ONLY admins can write; faculty can edit
-- their own entries; everyone reads published announcements.
-- ============================================================================
alter table semesters       enable row level security;
alter table batches         enable row level security;
alter table sections        enable row level security;
alter table lab_groups      enable row level security;
alter table faculty         enable row level security;
alter table courses         enable row level security;
alter table rooms           enable row level security;
alter table time_slots      enable row level security;
alter table class_days      enable row level security;
alter table routine_entries enable row level security;
alter table batch_off_days  enable row level security;
alter table announcements   enable row level security;
alter table settings        enable row level security;
alter table profiles        enable row level security;

-- helper: current user is admin
create or replace function is_admin() returns boolean language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- helper: current user role
create or replace function my_role() returns user_role language sql stable security definer as $$
  select role from profiles where id = auth.uid();
$$;

-- public read (anon + authenticated)
create policy "public read semesters"       on semesters       for select using (true);
create policy "public read batches"         on batches         for select using (true);
create policy "public read sections"        on sections        for select using (true);
create policy "public read lab_groups"      on lab_groups      for select using (true);
create policy "public read faculty"         on faculty         for select using (true);
create policy "public read courses"         on courses         for select using (true);
create policy "public read rooms"           on rooms           for select using (true);
create policy "public read time_slots"      on time_slots      for select using (true);
create policy "public read class_days"      on class_days      for select using (true);
create policy "public read routine"         on routine_entries for select using (true);
create policy "public read off days"        on batch_off_days  for select using (true);
create policy "public read announcements"   on announcements   for select using (is_active = true);
create policy "public read settings"        on settings        for select using (true);

-- admin write
create policy "admin write semesters"       on semesters       for all using (is_admin()) with check (is_admin());
create policy "admin write batches"         on batches         for all using (is_admin()) with check (is_admin());
create policy "admin write sections"        on sections        for all using (is_admin()) with check (is_admin());
create policy "admin write lab_groups"      on lab_groups      for all using (is_admin()) with check (is_admin());
create policy "admin write faculty"         on faculty         for all using (is_admin()) with check (is_admin());
create policy "admin write courses"         on courses         for all using (is_admin()) with check (is_admin());
create policy "admin write rooms"           on rooms           for all using (is_admin()) with check (is_admin());
create policy "admin write time_slots"      on time_slots      for all using (is_admin()) with check (is_admin());
create policy "admin write class_days"      on class_days      for all using (is_admin()) with check (is_admin());
create policy "admin write routine"         on routine_entries for all using (is_admin()) with check (is_admin());
create policy "admin write off days"        on batch_off_days  for all using (is_admin()) with check (is_admin());
create policy "admin write announcements"   on announcements   for all using (is_admin()) with check (is_admin());
create policy "admin write settings"        on settings        for all using (is_admin()) with check (is_admin());
create policy "admin write own profiles"    on profiles        for all using (is_admin() or id = auth.uid()) with check (is_admin() or id = auth.uid());

-- faculty may edit their own routine entries (e.g. mark cancelled / reschedule)
create policy "faculty edit own entries" on routine_entries
  for update using (faculty_id = (select faculty_id from profiles where id = auth.uid()));
create policy "faculty edit own profile" on profiles
  for update using (id = auth.uid());

-- ============================================================================
-- OPTIONAL: demo admin account + seed data
-- Create a user in Authentication → Users first, then promote it:
-- ============================================================================
-- update profiles set role = 'admin', full_name = 'Routine Administrator'
--  where id = '<the-admin-uuid>';
-- (Insert any catalog/seed rows here — see scripts/generate-seed.mjs for a
--  ready-made deterministic dataset you can replay against this schema.)
