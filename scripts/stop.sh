#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="geopol-forecaster"

if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
  echo "Stopping $CONTAINER_NAME..."
  docker stop "$CONTAINER_NAME" >/dev/null
  docker rm "$CONTAINER_NAME" >/dev/null
  echo "Stopped."
else
  echo "$CONTAINER_NAME is not running."
fi
