# Fitness Tracker Monorepo

Monorepo for a React frontend and Express backend with Firebase Firestore.

## Structure

- frontend: React app (Vite)
- backend: Express API service
- shared: place shared contracts/types for both apps

## Quick start

1. Install dependencies:
   npm install
2. Configure environment files:
   - frontend/.env (copy from frontend/.env.example)
   - backend/.env (copy from backend/.env.example)
3. Run both apps:
   npm run dev

## Frontend

- Main app file: frontend/src/App.jsx
- Firebase config is loaded from Vite env vars in frontend/src/firebaseConfig.js
- Build command: npm run build --workspace frontend

## Backend

- API entry: backend/src/server.js
- Health route: GET /api/health
- Security middleware: helmet, compression, CORS allowlist
- Start command: npm run start --workspace backend

## Deployment

- Frontend hosting deploy:
  npm run deploy:frontend
- Firestore rules + indexes deploy:
  npm run deploy:firestore
- Full deployment runbook:
  See DEPLOYMENT.md
