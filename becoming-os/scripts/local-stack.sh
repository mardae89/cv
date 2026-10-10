#!/usr/bin/env bash
# Local Supabase-compatible stack for testing without the Supabase CLI:
# system PostgreSQL + GoTrue + PostgREST + Storage API (Docker) + a path proxy.
# Usage: bash scripts/local-stack.sh up|down|reset
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-becoming}
PW=${PW:-localpass}
export JWT_SECRET=${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters}
eval "$(node scripts/local-jwt.mjs)"
PSQL="sudo -u postgres psql -v ON_ERROR_STOP=1 -q"
command -v sudo >/dev/null || PSQL="su postgres -c 'psql -v ON_ERROR_STOP=1 -q'"
psql_as_super() { su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $1" ; }

down() {
  docker rm -f bos-gotrue bos-rest bos-storage >/dev/null 2>&1 || true
  [ -f /tmp/bos-proxy.pid ] && kill "$(cat /tmp/bos-proxy.pid)" >/dev/null 2>&1 || true
}

bootstrap_db() {
  su postgres -c "psql -q -c 'drop database if exists $DB with (force)'"
  su postgres -c "psql -q -c 'create database $DB'"
  psql_as_super "$DB" <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password '$PW'; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin login createrole password '$PW'; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin login createrole bypassrls password '$PW'; end if;
  if not exists (select 1 from pg_roles where rolname = 'dashboard_user') then create role dashboard_user nologin; end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to supabase_storage_admin;
create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists storage authorization supabase_storage_admin;
create schema if not exists extensions;
grant usage on schema auth, storage, extensions, public to anon, authenticated, service_role;
grant all on schema public to service_role;
alter database $DB set search_path = public, extensions;
alter role supabase_auth_admin set search_path = auth;
alter role supabase_storage_admin set search_path = storage;
grant create on database $DB to supabase_auth_admin, supabase_storage_admin;
SQL
}

up() {
  down
  bootstrap_db
  docker run -d --name bos-gotrue --network host \
    -e GOTRUE_API_HOST=127.0.0.1 -e GOTRUE_API_PORT=9999 \
    -e API_EXTERNAL_URL=http://localhost:54321/auth/v1 \
    -e GOTRUE_DB_DRIVER=postgres \
    -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:$PW@127.0.0.1:5432/$DB?search_path=auth" \
    -e GOTRUE_SITE_URL=http://localhost:8080 -e GOTRUE_URI_ALLOW_LIST="*" \
    -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
    -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
    -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
    -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_EXTERNAL_PHONE_ENABLED=false \
    -e GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
    supabase/gotrue:v2.177.0 >/dev/null
  for i in $(seq 1 60); do curl -sf http://127.0.0.1:9999/health >/dev/null && break; sleep 1; done
  curl -sf http://127.0.0.1:9999/health >/dev/null || { docker logs bos-gotrue | tail -30; exit 1; }

  docker run -d --name bos-rest --network host \
    -e PGRST_DB_URI="postgres://authenticator:$PW@127.0.0.1:5432/$DB" \
    -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
    -e PGRST_JWT_SECRET="$JWT_SECRET" -e PGRST_SERVER_PORT=3000 \
    -e PGRST_DB_CHANNEL_ENABLED=true \
    postgrest/postgrest:v12.2.3 >/dev/null

  docker run -d --name bos-storage --network host \
    -e ANON_KEY="$ANON_KEY" -e SERVICE_KEY="$SERVICE_KEY" \
    -e AUTH_JWT_SECRET="$JWT_SECRET" -e PGRST_JWT_SECRET="$JWT_SECRET" \
    -e POSTGREST_URL=http://127.0.0.1:3000 \
    -e DATABASE_URL="postgres://supabase_storage_admin:$PW@127.0.0.1:5432/$DB" \
    -e DB_INSTALL_ROLES=false -e FILE_SIZE_LIMIT=52428800 \
    -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/tmp/storage \
    -e TENANT_ID=stub -e REGION=local -e GLOBAL_S3_BUCKET=stub \
    -e ENABLE_IMAGE_TRANSFORMATION=false -e SERVER_PORT=5000 -e PORT=5000 \
    supabase/storage-api:v1.25.7 >/dev/null
  for i in $(seq 1 60); do curl -sf http://127.0.0.1:5000/status >/dev/null && break; sleep 1; done
  curl -sf http://127.0.0.1:5000/status >/dev/null || { docker logs bos-storage | tail -30; exit 1; }

  # Supabase's hosted defaults: API roles get table privileges in storage/public.
  psql_as_super "$DB" <<SQL
grant all on all tables in schema storage to anon, authenticated, service_role;
grant all on all sequences in schema storage to anon, authenticated, service_role;
grant all on all functions in schema storage to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on functions to service_role;
SQL
  for f in supabase/migrations/*.sql; do psql_as_super "$DB" < "$f"; done
  docker kill -s SIGUSR1 bos-rest >/dev/null   # reload PostgREST schema cache
  PORT=54321 nohup node scripts/local-proxy.mjs >/tmp/bos-proxy.log 2>&1 &
  echo $! > /tmp/bos-proxy.pid
  sleep 1
  echo "VITE_SUPABASE_URL=http://localhost:54321"
  echo "VITE_SUPABASE_ANON_KEY=$ANON_KEY"
  echo "SERVICE_KEY=$SERVICE_KEY"
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  *) echo "usage: $0 up|down"; exit 1 ;;
esac
