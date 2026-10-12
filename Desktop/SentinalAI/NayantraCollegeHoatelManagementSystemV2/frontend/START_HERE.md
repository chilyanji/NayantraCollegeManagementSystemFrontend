# Frontend setup

This frontend is now delivered together with the updated backend and database migration. Follow **[../START_HERE.md](../START_HERE.md)** for the complete upgrade sequence, preserving your existing database, `.env`, models/enrollment and evidence signing key.

From this folder after backend setup:

```bash
npm ci
npm run dev
```

Use `.env.example` to configure a new setup; retain existing `.env` values on upgrade. The default development URL is `http://127.0.0.1:5173`. Details and production hosting notes are in [README.md](README.md).
