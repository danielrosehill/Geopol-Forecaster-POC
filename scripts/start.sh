#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="geopol-forecaster"
IMAGE_NAME="geopol-forecaster"
VOLUME_NAME="geopol-data"
PORT="${PORT:-3000}"

# Load env vars from .env.local if present
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
ENV_ARGS=""
if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    ENV_ARGS="$ENV_ARGS -e $line"
  done < "$ENV_FILE"
fi

# Build if image doesn't exist or --build flag passed
if [[ "${1:-}" == "--build" ]] || ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
  echo "Building image..."
  docker build -t "$IMAGE_NAME" "$(cd "$(dirname "$0")/.." && pwd)"
fi

# Stop existing container if running
if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
  echo "Stopping existing container..."
  docker stop "$CONTAINER_NAME" >/dev/null
  docker rm "$CONTAINER_NAME" >/dev/null
fi

echo "Starting $CONTAINER_NAME on port $PORT..."
eval docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$PORT:3000" \
  -v "$VOLUME_NAME:/app/data" \
  $ENV_ARGS \
  "$IMAGE_NAME"

echo "Running at http://localhost:$PORT"
