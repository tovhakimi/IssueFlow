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
