# Deployment

Tollvakt runs on a server with Docker Compose, behind Cloudflare Tunnel, like Leverandørvakt and Regelvakt:

```
visitor ─▶ Cloudflare ─▶ cloudflared (on the server) ─▶ web (127.0.0.1:WEB_PORT)
                                                          │
                                                          ▼
                                                         api ─▶ db (PostgreSQL + pgvector)
                                                          ▲
                                         etl (run when asked) ─┘
```

Only the web app is published, and only on `127.0.0.1`. The API and the database are reachable only inside Docker's network.

## Files

| File | What it does |
|---|---|
| `docker-compose.prod.yml` | The server setup: `db`, `api`, `web`, and `etl` (profile `etl`, run when asked) |
| `docker-compose.yml` | The same locally, with ports published and Ollama on the host |
| `deploy.envexample` | Every setting for the server's `.env` |
| `backend/Dockerfile`, `frontend/Dockerfile`, `etl/Dockerfile` | The images |
| `scripts/backup-db.sh` | A compressed database dump to `backups/`, old ones deleted |

## First deployment

1. Check the server's memory (`free -h`). Building the web app needs about 1–2 GB for a short while; add swap if there is little free memory.
2. Clone the repository on the server, for example to `~/tollvakt`.
3. `cp deploy.envexample .env` and fill it in: a database password and a JWT secret (`openssl rand -hex 24` / `-hex 32`), the admin account, the Resend key, the Gemini key, `GOATCOUNTER_URL`, and a `WEB_PORT` no other project uses.
4. Start it: `docker compose -f docker-compose.prod.yml up -d --build`. The API runs its migrations and creates the admin account on start.
5. Load the tariff: `docker compose -f docker-compose.prod.yml run --rm etl`. It downloads Tolletaten's data, imports it and creates the vectors with Gemini (about 15 000 texts; a few minutes, a few cents).
6. Add a route in Cloudflare Tunnel: `tollvakt.devrimdev.no` → `http://localhost:WEB_PORT`.
7. Nightly backup with cron (`crontab -e`):
   ```
   30 3 * * * cd /home/USER/tollvakt && bash scripts/backup-db.sh >> backups/backup.log 2>&1
   ```

## Updating

```
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

When Tolletaten publishes new data, run the ETL again; only new texts get new vectors:

```
docker compose -f docker-compose.prod.yml run --rm etl
```

## Logs

```
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
```
