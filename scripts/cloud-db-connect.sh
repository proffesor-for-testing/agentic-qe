#!/bin/bash
# Direct connection to cloud database via IAP tunnel
# Usage: ./cloud-db-connect.sh [sql_command]

PROJECT="${GCP_PROJECT_ID:?Error: GCP_PROJECT_ID not set}"
ZONE="${GCP_ZONE:-us-central1-a}"
INSTANCE="${GCP_INSTANCE:-ruvector-postgres}"
LOCAL_PORT="15432"

# Start tunnel in background
gcloud compute start-iap-tunnel "$INSTANCE" 5432 \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --local-host-port="localhost:$LOCAL_PORT" &>/dev/null &
TUNNEL_PID=$!

# Wait for tunnel to establish
sleep 3

# Run command or interactive session
# Password should be set via: export PGPASSWORD=<your-password>
if [ -z "$PGPASSWORD" ]; then
  echo "Error: PGPASSWORD environment variable not set"
  echo "Run: export PGPASSWORD=<your-db-password>"
  kill $TUNNEL_PID 2>/dev/null
  exit 1
fi

if [ -n "$1" ]; then
  psql -h localhost -p "$LOCAL_PORT" -U ruvector -d aqe_learning -c "$1"
else
  echo "Connected to cloud ruvector-postgres (IAP tunnel)"
  psql -h localhost -p "$LOCAL_PORT" -U ruvector -d aqe_learning
fi

# Cleanup
kill $TUNNEL_PID 2>/dev/null
