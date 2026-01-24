#!/bin/bash
# Cloud Database IAP Tunnel
# Securely connects to ruvector-postgres via IAP (no public port exposure)

PROJECT="${GCP_PROJECT_ID:?Error: GCP_PROJECT_ID not set}"
ZONE="${GCP_ZONE:-us-central1-a}"
INSTANCE="${GCP_INSTANCE:-ruvector-postgres}"
LOCAL_PORT="${1:-15432}"

echo "Starting IAP tunnel to $INSTANCE..."
echo "Local port: localhost:$LOCAL_PORT -> Cloud PostgreSQL:5432"
echo ""
echo "Connection string:"
echo "  export PGPASSWORD=<your-password>"
echo "  psql -h localhost -p $LOCAL_PORT -U ruvector -d aqe_learning"
echo ""
echo "Press Ctrl+C to stop the tunnel"
echo ""

gcloud compute start-iap-tunnel "$INSTANCE" 5432 \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --local-host-port="localhost:$LOCAL_PORT"
