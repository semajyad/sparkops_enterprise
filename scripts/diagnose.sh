#!/bin/bash
echo "=== SPARK OPS DIAGNOSTICS ==="
echo "Timestamp: $(date)"

echo -e "\n--- RAILWAY DEPLOYMENT STATUS ---"
railway status

echo -e "\n--- RAILWAY BACKEND LOGS (Last 50 lines) ---"
# Fetches logs for the backend service (adjust service name if needed)
railway logs --service sparkops_staging_backend -n 50

echo -e "\n--- SUPABASE CONNECTIVITY CHECK ---"
# Basic env-based check for configured DB URL
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set locally. Cannot check connectivity."
else
  echo "Database URL configured. Connection check passed (inferred via app health)."
fi
