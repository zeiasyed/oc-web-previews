FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NEXA_ASSETS_DIR=/app/demo_data/nexa_assets \
    EDC_PUBLIC_BASE=/edc \
    SCRIPT_ROOT=/edc \
    BIND_HOST=127.0.0.1 \
    CONSOLE_PORT=5070 \
    RAVE_PORT=5071

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python scripts/build_cdash_schemas.py || true \
    && python scripts/generate_simulated_extractions.py

EXPOSE 8080
ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health')" || exit 1

CMD ["python", "scripts/start_production.py"]
