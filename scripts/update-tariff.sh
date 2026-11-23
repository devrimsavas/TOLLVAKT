#!/usr/bin/env bash
# Updates the tariff, duty rates and exchange rates from Tolletaten by
# running the ETL container of docker-compose.prod.yml. When nothing changed
# since the last import, it only downloads and stops. Run it from anywhere:
#   bash scripts/update-tariff.sh
# Every morning at 05:15 with cron (crontab -e), from the project folder:
#   15 5 * * * cd /home/USER/tollvakt && bash scripts/update-tariff.sh >> logs/update-tariff.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p logs

# Only one update at a time: a run that is still going makes the next one stop
exec 9> logs/update-tariff.lock
if ! flock -n 9; then
  echo "$(date -Iseconds) another update is still running; stopped"
  exit 1
fi

echo "$(date -Iseconds) update started"
if docker compose -f docker-compose.prod.yml --profile etl run --rm -T etl; then
  echo "$(date -Iseconds) update finished"
else
  status=$?
  echo "$(date -Iseconds) update FAILED (exit $status)"
  exit "$status"
fi
