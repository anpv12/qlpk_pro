# Sử dụng Python 3.11 slim image
FROM python:3.11-slim

# Build arguments (từ docker-compose hoặc .env)
ARG APP_PORT=8000

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    FLASK_APP=main.py \
    FLASK_ENV=development \
    QLPK_UPLOAD_ROOT=/app/uploads \
    APP_PORT=${APP_PORT}

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        libpq-dev \
        postgresql-client \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser \
    && chown -R appuser:appuser /app
USER appuser

# Expose port (dynamic từ ARG)
EXPOSE ${APP_PORT}

# Health check (dynamic port)
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${APP_PORT}/health || exit 1

# Run the application (dynamic port)
CMD ["sh", "-c", "python -m flask run --host=0.0.0.0 --port=${APP_PORT}"] 
