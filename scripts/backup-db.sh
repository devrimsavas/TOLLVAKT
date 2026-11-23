#!/usr/bin/env bash
# Backs up the database of docker-compose.prod.yml to backups/ as a
# compressed SQL dump and deletes backups older than BACKUP_KEEP_DAYS
# (14 by default). Run it from anywhere:
#   bash scripts/backup-db.sh
# Every night at 03:30 with cron (crontab -e), from the project folder:
#   30 3 * * * cd /home/USER/tollvakt && bash scripts/backup-db.sh >> backups/backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
keep_days="${BACKUP_KEEP_DAYS:-14}"
mkdir -p backups
file="backups/tollvakt-$(date +%Y-%m-%d-%H%M).sql.gz"
# Removed when the dump fails, so no half-written file is left behind
trap 'rm -f "$file.partial"' EXIT

# Written under another name first, so a failed dump never looks like a
# finished backup. --clean drops each table before it is created again,
# so the file restores over an existing database.
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U tollvakt -d tollvakt --clean --if-exists --no-owner \
  | gzip > "$file.partial"
mv "$file.partial" "$file"

find backups -name 'tollvakt-*.sql.gz' -mtime +"$keep_days" -delete
echo "$(date -Iseconds) backup written: $file ($(du -h "$file" | cut -f1))"
