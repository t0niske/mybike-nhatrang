-- ============================================================
--  MYBIKE — схема базы для Supabase.
--  Supabase → SQL Editor → вставить целиком → Run.
--  Скрипт можно запускать повторно (idempotent).
-- ============================================================
create extension if not exists pg_net with schema extensions;

-- служебные функции прав — в закрытой схеме, недоступной через API
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------- администраторы ----------
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role text not null default 'manager' check (role in ('owner','manager','viewer')),
  created_at timestamptz not null default now()
);

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and role in ('owner','manager'));
$$;
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and role = 'owner');
$$;

-- Владельцем становится только аккаунт с email из secrets.owner_email (задайте ниже перед регистрацией)
create or replace function bootstrap_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admins where role = 'owner')
     and lower(new.email) = lower(coalesce((select value from secrets where key = 'owner_email'), '')) then
    insert into admins(user_id, email, name, role) values (new.id, new.email, split_part(new.email,'@',1), 'owner')
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function bootstrap_owner();

-- ---------- модели байков (= страницы сайта /arenda/<id>/) ----------
create table if not exists bikes (
  id text primary key,                 -- slug
  name text not null, brand text, grp text not null check (grp in ('50','e','125','150','300','moto')),
  type text, license text not null default 'A' check (license in ('none','A1','A')),
  cc int default 0, power text, year int, seats int default 2, tank text, fuel text, speed int, weight text,
  gearbox text, trunk text, abs boolean default false,
  p1 int not null, p7 int not null, pm int not null,
  popular boolean default false, rank int default 50,
  tags jsonb default '[]', short text, about jsonb default '[]', suits text, pros jsonb default '[]',
  img text, visible boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------- конкретные байки парка (с номерами) ----------
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  bike_id text references bikes(id) on update cascade on delete set null,
  plate text, color text, year int, mileage int default 0,
  status text not null default 'free' check (status in ('free','rented','service','sold')),
  next_service_km int, purchase_price int, purchased_at date, notes text,
  created_at timestamptz not null default now()
);

-- ---------- заявки / брони ----------
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bike_id text, unit_id uuid references units(id) on delete set null,
  date_from date, date_to date, days int, total int,
  name text, contact text, place text, via text,             -- tg | wa | phone | site | walk-in
  status text not null default 'new' check (status in ('new','confirmed','issued','returned','cancelled','lost')),
  price_final int, paid int default 0, comment text,
  source text, medium text, campaign text, referrer text, page text, device text, sid text,
  history jsonb not null default '[]'
);
create index if not exists leads_created on leads(created_at desc);
create index if not exists leads_status on leads(status);

-- ---------- расходы ----------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  unit_id uuid references units(id) on delete set null,
  category text not null default 'other',  -- service | repair | fuel | ads | salary | rent | other
  amount int not null, note text,
  created_at timestamptz not null default now()
);

-- ---------- события аналитики (пишет сайт) ----------
create table if not exists events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  sid text, type text not null, path text, bike_id text,
  source text, medium text, campaign text, referrer text, device text,
  data jsonb
);
create index if not exists events_ts on events(ts desc);
create index if not exists events_type on events(type, ts desc);

-- ---------- контент сайта (настройки, подборки, страницы, отзывы, FAQ) ----------
create table if not exists content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- журнал публикаций и действий ----------
create table if not exists audit (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  actor text, action text, entity text, entity_id text, data jsonb
);

-- ---------- секреты (только владелец) ----------
create table if not exists secrets (
  key text primary key,
  value text
);

-- ============================================================
--  Права доступа (RLS)
-- ============================================================
alter table admins   enable row level security;
alter table bikes    enable row level security;
alter table units    enable row level security;
alter table leads    enable row level security;
alter table expenses enable row level security;
alter table events   enable row level security;
alter table content  enable row level security;
alter table audit    enable row level security;
alter table secrets  enable row level security;

do $$ declare t text; begin
  foreach t in array array['bikes','units','leads','expenses','content','audit'] loop
    execute format('drop policy if exists staff_read on %I', t);
    execute format('create policy staff_read on %I for select to authenticated using (private.is_staff())', t);
    execute format('drop policy if exists admin_write on %I', t);
    execute format('create policy admin_write on %I for all to authenticated using (private.is_admin()) with check (private.is_admin())', t);
  end loop;
end $$;

drop policy if exists staff_read on events;
create policy staff_read on events for select to authenticated using (private.is_staff());
drop policy if exists admin_delete on events;
create policy admin_delete on events for delete to authenticated using (private.is_admin());
-- сайт (anon) может только добавлять события и заявки, читать — нет
drop policy if exists site_insert on events;
create policy site_insert on events for insert to anon, authenticated with check (
  type in ('page_view','bike_view','search','filter','book_open','lead','tg_click','wa_click','phone_click')
  and length(coalesce(path,'')) < 300 and length(coalesce(referrer,'')) < 400 and coalesce(pg_column_size(data),0) < 2000);
drop policy if exists site_insert on leads;
create policy site_insert on leads for insert to anon with check (
  status = 'new' and unit_id is null and coalesce(paid,0) = 0
  and length(coalesce(name,'')) < 200 and length(coalesce(contact,'')) < 200 and length(coalesce(place,'')) < 300
  and coalesce(pg_column_size(history),0) < 4000);

drop policy if exists admins_read on admins;
create policy admins_read on admins for select to authenticated using (private.is_staff());
drop policy if exists admins_owner on admins;
create policy admins_owner on admins for all to authenticated using (private.is_owner()) with check (private.is_owner());

drop policy if exists secrets_owner on secrets;
create policy secrets_owner on secrets for all to authenticated using (private.is_owner()) with check (private.is_owner());

grant usage on schema public to anon, authenticated;
grant insert on events, leads to anon;
grant all on all tables in schema public to authenticated;

-- ============================================================
--  Уведомление о новой заявке в Telegram
--  Владелец задаёт в админке: Настройки → Telegram (tg_bot_token, tg_chat_id)
-- ============================================================
create or replace function notify_new_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare tok text; chat text; bike text; msg text;
begin
  select value into tok from secrets where key = 'tg_bot_token';
  select value into chat from secrets where key = 'tg_chat_id';
  if tok is null or chat is null or tok = '' or chat = '' then return new; end if;
  select name into bike from bikes where id = new.bike_id;
  msg := '🛵 Новая заявка' || chr(10) ||
         coalesce(bike, new.bike_id, '—') || chr(10) ||
         '📅 ' || coalesce(to_char(new.date_from,'DD.MM'),'?') || ' — ' || coalesce(to_char(new.date_to,'DD.MM'),'?') ||
         ' (' || coalesce(new.days::text,'?') || ' дн.)' || chr(10) ||
         '💰 ' || coalesce(regexp_replace(new.total::text, '(\d)(?=(\d{3})+$)', '\1 ', 'g'),'—') || ' ₫' || chr(10) ||
         coalesce('👤 ' || new.name || chr(10), '') ||
         coalesce('📍 ' || new.place || chr(10), '') ||
         coalesce('✉️ ' || new.via || ' ' || coalesce(new.contact,''), '') || chr(10) ||
         coalesce('Источник: ' || new.source, '');
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
    body := jsonb_build_object('chat_id', chat, 'text', msg),
    headers := '{"Content-Type":"application/json"}'::jsonb);
  return new;
end $$;
drop trigger if exists lead_notify on leads;
create trigger lead_notify after insert on leads for each row execute function notify_new_lead();

-- updated_at
create or replace function touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists bikes_touch on bikes;
create trigger bikes_touch before update on bikes for each row execute function touch();
drop trigger if exists content_touch on content;
create trigger content_touch before update on content for each row execute function touch();

-- Хранилище фото байков
insert into storage.buckets (id, name, public) values ('bikes', 'bikes', true) on conflict (id) do nothing;
drop policy if exists bikes_public_read on storage.objects;
create policy bikes_public_read on storage.objects for select using (bucket_id = 'bikes');
drop policy if exists bikes_admin_write on storage.objects;
create policy bikes_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'bikes' and private.is_admin()) with check (bucket_id = 'bikes' and private.is_admin());

-- Владелец добавляет сотрудника по email (сотрудник сначала регистрируется на странице входа админки)
create or replace function add_admin(p_email text, p_role text default 'manager') returns text
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if not private.is_owner() then
    raise exception 'Только владелец может добавлять сотрудников';
  end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if p_role not in ('owner','manager','viewer') then raise exception 'Неизвестная роль'; end if;
  if uid is null then return 'not_found'; end if;
  insert into admins(user_id, email, name, role) values (uid, p_email, split_part(p_email,'@',1), p_role)
  on conflict (user_id) do update set role = excluded.role;
  return 'ok';
end $$;
grant execute on function add_admin(text, text) to authenticated;

-- служебные функции не нужны анонимным посетителям
revoke execute on function bootstrap_owner(), notify_new_lead(), touch() from public, anon, authenticated;
revoke execute on function add_admin(text, text) from public, anon;
revoke execute on function private.is_admin(), private.is_staff(), private.is_owner() from public, anon;
grant execute on function private.is_admin(), private.is_staff(), private.is_owner() to authenticated;

-- ВАЖНО: email будущего владельца админки (замените на свой до регистрации)
insert into secrets(key, value) values ('owner_email', 'owner@example.com') on conflict (key) do nothing;

-- индексы для связей
create index if not exists expenses_unit on expenses(unit_id);
create index if not exists leads_unit on leads(unit_id);
create index if not exists units_bike on units(bike_id);
