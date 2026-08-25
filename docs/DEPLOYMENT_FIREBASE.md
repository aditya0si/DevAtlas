# DevAtlas → Firebase + GitHub Actions Deployment (Free Tier)

## Architecture (No Blaze Plan Required)

```
GitHub Actions (free, every 5 min)
  │
  ├── GitHub Search API → discover Indian developers by city
  ├── GitHub Users/Repos API → fetch profiles + repositories
  ├── Gemini API → classify each repo's domain (ai, cybersecurity, etc.)
  ├── Nominatim → geocode developer locations to lat/lng
  │
  └──> Firestore (free: 50K reads/day, 20K writes/day)
         │
         ├── Cloud Function `api` (free, no secrets) → serves /api/v1/* to frontend
         │
         └── onSnapshot listener (frontend) → realtime heatmap updates
```

**Zero cost.** Everything runs on free tiers:
- GitHub Actions: 2000 min/month free (sync uses ~10 min/run × 288 runs/month = 2880 min)

  ⚠️ This exceeds the free tier for private repos. **Your repo MUST be public.**

- Firestore: 50K reads/day, 20K writes/day, 1GB storage
- Firebase Hosting: 10GB storage, 360MB/day transfer
- Cloud Functions: 2M invocations/month, 1GB egress

## Prerequisites

1. **GitHub account** — repo must be PUBLIC (for free Actions minutes)
2. **Firebase project** — `gitlatitude` (already created)
3. **Firebase CLI** — `npm install -g firebase-tools` (already installed + logged in)
4. **GitHub Personal Access Token** — https://github.com/settings/tokens (scope: `public_repo`)
5. **Gemini API Key** — https://aistudio.google.com/app/apikey

## Step-by-Step Deployment

### 1. Deploy Firestore rules + indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### 2. Deploy the API Cloud Function + Hosting config

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

This deploys a single `api` Cloud Function that reads from Firestore.
No secrets needed — it's read-only.

### 3. Create a Firebase service account key (for GitHub Actions)

The sync script needs write access to Firestore. Create a service account:

1. Firebase Console → Project Settings → Service Accounts
2. Click **Generate new private key**
3. Save the JSON file — you'll add it as a GitHub secret

### 4. Add GitHub Actions secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions → New secret:

Add these three secrets:
- `GITHUB_TOKEN` — your GitHub Personal Access Token
- `GEMINI_API_KEY` — your Gemini API key
- `FIREBASE_SERVICE_ACCOUNT` — the ENTIRE JSON content of the service account key (copy-paste all of it)

### 5. Push to GitHub and trigger the first sync

```bash
git add .
git commit -m "Firebase + GitHub Actions realtime architecture"
git push origin master
```

Then go to GitHub → Actions → "Sync Indian GitHub Developers" → Run workflow.

This first run discovers ~30 developers in Bangalore (the first city in rotation), fetches their repos, classifies them with Gemini, geocodes their locations, and writes everything to Firestore.

Subsequent runs cycle through all 39 Indian cities automatically every 5 minutes.

### 6. Verify data in Firestore

Firebase Console → Firestore → you should see:
- `developers` collection with Indian developer profiles + coordinates
- `repositories` collection with repos having `domain` and `coordinates`

### 7. Configure frontend env

```bash
cd frontend
npm install
```

Create `frontend/.env.local` with your Firebase web config (already done — verify it matches your project):

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=gitlatitude.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=gitlatitude
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=gitlatitude.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_API_URL=/api/v1
```

### 8. Build and deploy frontend

```bash
cd frontend
npm install
npm run build
cd ..
firebase deploy --only hosting
```

### 9. Verify the live site

1. Visit `https://gitlatitude.web.app` (default Firebase Hosting URL)
2. The map should show Indian developer repo points plotted by location
3. Points are colored by AI-classified domain (AI=violet, Cybersecurity=blue, etc.)
4. Every 5 min, GitHub Actions syncs new data → Firestore → onSnapshot updates the map

## How Realtime Works

```
Time 0:00  GitHub Actions cron fires sync.js
Time 0:30  Developers discovered in Bangalore via Search API
Time 1:00  Their repos fetched + classified by Gemini
Time 1:30  Locations geocoded via Nominatim
Time 1:45  Firestore documents written
Time 1:45  onSnapshot fires in browser → heatmap updates instantly
Time 5:00  Next cycle: discovers developers in Bengaluru (next city in rotation)
Time 10:00 Next cycle: discovers developers in Mumbai
...        Cycles through all 39 Indian cities, then repeats
```

Data freshness: **~2-5 minutes** per city. Full India coverage: **~3.5 hours** (39 cities × 5 min).

## Scaling

Each sync run discovers ~30 developers × 10 repos = ~300 repos per city.
Over 39 cities: **~11,700 developers and ~11,700 repos** total potential coverage.

GitHub API rate limit: 5000 req/hour. Each run uses ~90 requests (30 devs × 3 calls).
At 12 runs/hour = 1,080 requests/hour — within the 5000 limit.

Gemini rate limit: 15 req/min, 1500/day. Each run classifies ~300 repos.
At 12 runs/hour = 3,600/hour — needs throttling. The script processes sequentially with delays.

## Troubleshooting

### Map shows no points
- Check Firestore has `repositories` with `coordinates` field
- GitHub Actions logs: repo → Actions → click latest run
- The `geocoded` field must be `true` and `coordinates` must be a GeoPoint

### GitHub Actions not running
- Repo must be PUBLIC for free Actions minutes
- Check workflow file exists: `.github/workflows/sync-github-india.yml`
- Manual trigger: Actions → "Sync Indian GitHub Developers" → Run workflow

### Firestore permission denied
- Check firestore.rules deployed: `firebase deploy --only firestore:rules`
- Service account key must have Firestore write permissions

### API returns empty
- Check Cloud Function deployed: `firebase deploy --only functions`
- Health check: `https://us-central1-gitlatitude.cloudfunctions.net/api/api/v1/health`
