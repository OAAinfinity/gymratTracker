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

Vercel-specific env templates are available at:

- `frontend/.env.vercel.example`
- `backend/.env.vercel.example`

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

### 7.4 Vercel Readiness Checklist

1. `backend/vercel.json` exists.
2. `backend/api/index.js` exports the Express app.
3. `frontend/vercel.json` exists for SPA rewrite fallback.
4. Frontend project root in Vercel is `frontend`.
5. Backend project root in Vercel is `backend`.

## 8. Deploy Frontend + Backend on Render

This repo now includes a Render blueprint at `render.yaml` to deploy both services.

### 8.1 One-time setup

1. Push code to GitHub (including `render.yaml`).
2. In Render dashboard, choose **New** -> **Blueprint**.
3. Connect your GitHub repo.
4. Render will detect `render.yaml` and propose two services:
	- `fitness-tracker-backend` (Web Service)
	- `fitness-tracker-frontend` (Static Site)

### 8.2 Set environment variables

Backend:

- `NODE_ENV=production`
- `CORS_ORIGIN=https://<your-frontend-onrender-domain>`

Frontend:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_API_BASE_URL=https://<your-backend-onrender-domain>`

### 8.3 Deploy order

1. Deploy backend first.
2. Copy backend URL and set frontend `VITE_API_BASE_URL`.
3. Deploy frontend.
4. Copy frontend URL and set backend `CORS_ORIGIN`.
5. Redeploy backend.

### 8.4 Verify

- Backend health: `https://<backend-domain>/api/health`
- Frontend loads and can access backend without CORS errors

## 9. Deploy Entire Project with Firebase CLI

This path deploys all parts together:

- Frontend to Firebase Hosting
- Backend API to Firebase Functions (2nd gen)
- Firestore rules and indexes

### 9.1 Prerequisites

1. Firebase project exists and is selected in `.firebaserc`.
2. Billing is enabled on Firebase project (required for 2nd gen Functions).
3. Firebase CLI authenticated:

```bash
npx firebase-tools login
```

### 9.2 Set environment files

1. Frontend:

```bash
cp frontend/.env.example frontend/.env
```

Set all `VITE_FIREBASE_*` values from Firebase console.

Set API base URL to same-origin path:

```env
VITE_API_BASE_URL=/api
```

2. Functions (backend runtime):

```bash
cp functions/.env.example functions/.env
```

Set:

- `NODE_ENV=production`
- `CORS_ORIGIN=https://<your-hosting-domain>`

### 9.3 Install dependencies

From repo root:

```bash
npm install
```

### 9.4 Deploy all at once

From repo root:

```bash
npm run deploy:firebase
```

This runs frontend build and deploys:

- `functions`
- `hosting`
- `firestore`

### 9.5 Verify

1. Open Hosting URL from Firebase console.
2. Check backend health through Hosting rewrite:

`https://<your-hosting-domain>/api/health`

3. Confirm app loads and no CORS errors.

### 9.6 Useful partial deploy commands

```bash
npm run deploy:frontend
npm run deploy:functions
npm run deploy:firestore
```
