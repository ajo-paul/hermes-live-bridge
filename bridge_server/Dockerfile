FROM python:3.11-slim
WORKDIR /app/bridge_server

# Install system dependencies (curl needed for Docker healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY bridge_server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY bridge_server .
COPY frontend/dist /app/frontend/dist
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

