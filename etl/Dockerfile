# Tollvakt ETL image: downloads Tolletaten's open data, loads it into the
# database and creates the vectors for semantic search. It runs once and
# stops; Docker Compose starts it only when asked (profile "etl"):
#   docker compose -f docker-compose.prod.yml run --rm etl
FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY tollvakt_etl ./tollvakt_etl

# Run as an unprivileged user; the downloads go to /app/data, a volume
RUN useradd --create-home etl && mkdir -p /app/data && chown etl /app/data
USER etl

CMD ["python", "-m", "tollvakt_etl.update_norway"]
