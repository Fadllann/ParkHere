# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies OpenCV needs (rarely changes)
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Copy and install dependencies (separate layer for better caching)
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# Copy application code (changes frequently, invalidates minimal cache)
COPY plate_service.py .

EXPOSE 5001
CMD ["python", "plate_service.py"]