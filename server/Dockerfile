# dspy.RLM uses a Pyodide-in-Deno sandbox to execute the code the model
# writes. Render's default Python image has no Deno, so we install it.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DENO_INSTALL=/usr/local

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates unzip \
    && curl -fsSL https://deno.land/install.sh | sh -s -- --yes \
    && apt-get purge -y curl unzip \
    && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copy the package metadata first for layer caching
COPY pyproject.toml requirements.txt ./
COPY threadmap ./threadmap
COPY prompts ./prompts
COPY server ./server

RUN pip install --upgrade pip \
    && pip install -e . \
    && pip install -r server/requirements.txt

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT}"]
