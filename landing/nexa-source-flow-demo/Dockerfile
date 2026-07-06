FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    EDC_PUBLIC_BASE=/edc \
    SCRIPT_ROOT=/edc \
    BIND_HOST=127.0.0.1 \
    CONSOLE_PORT=5050 \
    RAVE_PORT=5051

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python scripts/build_form_schemas.py || true

EXPOSE 8080
ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health')" || exit 1

CMD ["python", "scripts/start_production.py"]
