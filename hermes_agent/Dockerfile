FROM python:3.11-slim
WORKDIR /app

# Install system dependencies (curl needed for Docker healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir fastapi uvicorn

# Create a non-privileged user
RUN groupadd -r hermesuser && useradd -r -g hermesuser -m -s /sbin/nologin hermesuser

# Copy project and set ownership
COPY . .
RUN chown -R hermesuser:hermesuser /app

# Switch to non-privileged user
USER hermesuser

CMD ["python", "agent_controller.py"]
