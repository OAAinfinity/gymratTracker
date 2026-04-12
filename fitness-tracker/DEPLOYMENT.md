# Deployment Guide

This repository is set up as a monorepo with:
- `frontend`: Vite React app (deployed to Firebase Hosting)
- `backend`: Express API (deploy to Render/Railway/Fly.io or any Node host)

## 1. Prerequisites

- Node.js 20+
- npm 10+
- Firebase CLI (`npx firebase-tools` is used from scripts)

## 2. Environment Variables

### Frontend (`frontend/.env`)

Create `frontend/.env` from `frontend/.env.example` and set:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_API_BASE_URL` (optional, used for backend API base URL)

### Backend (`backend/.env`)

Create `backend/.env` from `backend/.env.example` and set:

- `NODE_ENV=production`
- `PORT=4000` (or host-provided port)
- `CORS_ORIGIN=https://your-frontend-domain.com`

For multiple allowed origins, use comma-separated values:

`CORS_ORIGIN=https://app.example.com,https://www.app.example.com`

## 3. Install and Build

From repo root:

```bash
npm install
npm run build
```

## 4. Deploy Frontend + Firestore

Deploy static app:

```bash
npm run deploy:frontend
```

Deploy Firestore rules/indexes:

```bash
npm run deploy:firestore
```

## 5. Deploy Backend

### Option A: Standard Node host

Use these settings in your provider:

- Root directory: `backend`
- Build command: `npm install --omit=dev`
- Start command: `npm start`
- Environment: Node 20+

### Option B: Docker deploy

A production Dockerfile exists at `backend/Dockerfile`.

Build and run locally:

```bash
docker build -t fitness-tracker-api ./backend
docker run -p 4000:4000 --env-file ./backend/.env fitness-tracker-api
```

## 6. Post-Deploy Checks

- Frontend loads without console errors
- Backend health endpoint responds: `GET /api/health`
- Firestore rules enforce user ownership and subscription access
- CORS allows only expected frontend origins

## 7. Deploy Frontend + Backend on Vercel

This monorepo should be deployed as **two Vercel projects**:

- Frontend project with root directory: `frontend`
- Backend project with root directory: `backend`

### 7.1 Backend on Vercel

Backend includes `backend/vercel.json` and `backend/api/index.js` so Express routes are served by Vercel Functions.

In Vercel project settings:

- Framework Preset: `Other`
- Root Directory: `backend`
- Build Command: leave empty
- Output Directory: leave empty
- Install Command: `npm install`

Set backend environment variables:

- `NODE_ENV=production`
- `CORS_ORIGIN=https://<your-frontend-vercel-domain>`

After deploy, verify:

- `https://<backend-domain>/api/health`

### 7.2 Frontend on Vercel

In Vercel project settings:

- Framework Preset: `Vite`
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

Set frontend environment variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_API_BASE_URL=https://<backend-domain>`

Redeploy frontend after setting variables.

### 7.3 Final Wiring

1. Copy frontend production domain from Vercel.
2. Put that value in backend `CORS_ORIGIN`.
3. Redeploy backend.
4. Copy backend production domain.
5. Put that value in frontend `VITE_API_BASE_URL`.
6. Redeploy frontend.
