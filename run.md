# How to Run IssueFlow

## Quick Start (Docker)

Run the entire stack with a single command — no local Node.js required:

```
docker compose up --build
```

This starts both PostgreSQL and the NestJS API. The API is available at **http://localhost:3000**.

To stop: `docker compose down`

---

## Manual Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Start the database**
   ```
   docker compose up -d
   ```
   This starts the `db` service (PostgreSQL on port 5432).
   Credentials: user=`issueflow`, password=`issueflow`, database=`issueflow`.

3. **Build the project**
   ```
   npm run build
   ```

4. **Start the API server**
   ```
   npm run start:prod
   ```
   For development with live reload:
   ```
   npm run start:dev
   ```
   The API listens on **http://localhost:3000**.

5. **Run unit tests**
   ```
   npm run test
   ```

6. **Run end-to-end tests**
   ```
   npm run test:e2e
   ```

## Environment Variables (optional overrides)

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `issueflow` | PostgreSQL username |
| `DB_PASS` | `issueflow` | PostgreSQL password |
| `DB_NAME` | `issueflow` | PostgreSQL database |
| `JWT_SECRET` | `issueflow-secret` | JWT signing secret (change in production) |
| `UPLOAD_PATH` | `./uploads` | Directory for attachment files |

## Verify It Works

After the server starts, run this to confirm the API is responding:

```
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/auth/me
```

Expected: `401` (JWT guard is active, no token provided). This confirms the app is running and auth is enforced.

To test the full flow:

```bash
# Create a user
curl -s -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"username":"testadmin","email":"admin@test.com","password":"pass123","fullName":"Test Admin","role":"ADMIN"}'

# Login
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testadmin","password":"pass123"}'
# Copy the accessToken from the response and use it in subsequent requests
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Port 3000 already in use` | Stop the other process: `lsof -i :3000` then `kill <PID>`, or change the port in `main.ts` |
| `docker compose up` fails with "daemon not running" | Start Docker Desktop (macOS) or the Docker daemon (`sudo systemctl start docker` on Linux) |
| `npm run build` fails with TypeScript errors | Ensure Node.js >= 18 and run `npm install` first. Check with `node -v` |
| DB connection refused on `npm run start:dev` | Make sure PostgreSQL is running: `docker compose up -d db` and wait a few seconds for it to be ready |

---

## Model Routing

This project uses the [claude-model-router-hook](https://github.com/tzachbon/claude-model-router-hook) plugin to automatically select the appropriate Claude model tier (Haiku / Sonnet / Opus) based on prompt complexity. No manual model switching is required — the plugin classifies each prompt and routes accordingly. Configuration lives in `~/.claude/model-router.json`.

## Viewing the Knowledge Graph

The codebase was analyzed with Graphify, producing an interactive knowledge graph in `graphify-out/`.

- **Interactive visualization:** open `graphify-out/graph.html` in a browser
- **Text summary:** read `graphify-out/GRAPH_REPORT.md`
