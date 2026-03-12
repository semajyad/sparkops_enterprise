# Frontend Environment Variables for Railway

## Required Environment Variables

These must be set in Railway dashboard for the frontend service:

### Core Configuration
```bash
# Backend API URL (most important)
NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain.railway.app

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
# OR
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key

# Site URL for redirects
NEXT_PUBLIC_SITE_URL=https://your-frontend-domain.railway.app

# Mapbox Token (for maps)
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-public-token
```

### Optional Configuration
```bash
# Auth tracing (for debugging)
NEXT_PUBLIC_AUTH_TRACE=false
```

## Railway Setup Instructions

1. Go to your Railway project
2. Select the frontend service (`sparkops_staging_frontend`)
3. Go to "Variables" tab
4. Add all the required variables above
5. Redeploy the frontend service

## Common Issues and Solutions

### Issue: "Backend API not reachable"
**Solution**: Ensure `NEXT_PUBLIC_API_BASE_URL` is set to the correct Railway backend URL

### Issue: "Supabase connection failed"
**Solution**: Verify Supabase URL and anon key are correct

### Issue: "Map not loading"
**Solution**: Add valid Mapbox public token

### Issue: "Build fails with missing environment variables"
**Solution**: Add all required variables before building

## Testing the Frontend

After deployment, test:
1. Main page loads: `https://your-frontend-domain.railway.app`
2. Login works
3. Maps load (if Mapbox token is set)
4. API calls succeed (check browser console)

## Environment Variable Sources

### Supabase
1. Go to Supabase dashboard
2. Project Settings → API
3. Copy Project URL and `anon public` key

### Mapbox
1. Go to Mapbox dashboard
2. Create access token
3. Copy public token

### Backend URL
1. Go to Railway dashboard
2. Copy backend service URL
3. Ensure it includes `https://` prefix
