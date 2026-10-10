#!/usr/bin/env bash
# Runs the row-level-security tests against DATABASE_URL (a superuser
# connection, e.g. supabase start's postgres://postgres:postgres@127.0.0.1:54322/postgres).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?Set DATABASE_URL to a Postgres superuser connection string}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/rls.test.sql
