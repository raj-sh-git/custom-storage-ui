# Lightweight, fast production image using Debian Slim with precompiled wheels
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install pre-built wheels directly without compiling from source
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Create a non-root user for security best practices
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose the port the app runs on in Docker
EXPOSE 8000

# Run the application using Uvicorn
CMD ["uvicorn", "asgi:app", "--host", "0.0.0.0", "--port", "8000"]
