# How to Run IssueFlow

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

## Model Routing

This project uses the [claude-model-router-hook](https://github.com/tzachbon/claude-model-router-hook) plugin to automatically select the appropriate Claude model tier (Haiku / Sonnet / Opus) based on prompt complexity. No manual model switching is required — the plugin classifies each prompt and routes accordingly. Configuration lives in `~/.claude/model-router.json`.

## Viewing the Knowledge Graph

The codebase was analyzed with Graphify, producing an interactive knowledge graph in `graphify-out/`.

- **Interactive visualization:** open `graphify-out/graph.html` in a browser
- **Text summary:** read `graphify-out/GRAPH_REPORT.md`
