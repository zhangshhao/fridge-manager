#!/bin/sh
set -eu
umask 077
export PGHOST=postgres PGUSER=fridge PGDATABASE=fridge PGPASSWORD="$POSTGRES_PASSWORD"
mkdir -p /backup
file=/tmp/fridge.dump
on_exit() {
  code=$?
  rm -f "$file"
  if [ "$code" -ne 0 ] && [ -n "${BACKUP_FAILURE_URL:-}" ]; then curl -fsS --max-time 15 "$BACKUP_FAILURE_URL" >/dev/null || true; fi
  exit "$code"
}
trap on_exit EXIT
if [ "${1:-}" = init ]; then restic init; exit 0; fi
pg_dump --format=custom --no-owner --no-acl --file="$file"
# Stable stdin filename makes retention groups independent of container hostname.
restic backup --stdin --stdin-filename fridge.dump --host fridge-manager --tag fridge < "$file"
restic forget --host fridge-manager --tag fridge --keep-daily 7 --keep-weekly 4 --prune
restic check
date -u +%FT%TZ > /backup/last-success
if [ -n "${BACKUP_SUCCESS_URL:-}" ]; then curl -fsS --max-time 15 "$BACKUP_SUCCESS_URL" >/dev/null; fi
printf 'Encrypted remote backup and repository check completed.\n'
