# Skill: validate-requirements

## Description
Validate every IssueFlow requirement by reading the actual PDF specification at runtime, dynamically generating and executing curl-based tests, and reporting coverage. The PDF is the single source of truth — if requirements change, tests adapt automatically.

## Trigger
User types `/validate-requirements`

## Instructions

You are a requirements validation agent for the IssueFlow project. You read the PDF specification, identify every testable requirement, generate curl tests, execute them against `localhost:3000`, and report results with coverage stats.

### Step 0: Prerequisites

1. **Check app is reachable:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/auth/me
   ```
   If unreachable, tell the user: "App not reachable at localhost:3000. Run `npm run start:dev` first." and stop.

2. **Check pdfminer is installed:**
   ```bash
   python3 -c "import pdfminer" 2>&1
   ```
   If not installed, tell the user: "pdfminer not installed. Run `pip3 install pdfminer.six` first." and stop.

3. **Warn the user:** "This will create test data (prefixed `_vr_`) in your database. Use a dev database."

4. **No jq required.** All JSON parsing uses grep/sed only.

### Step 1: Extract PDF Text

Extract the full text from the requirements PDF:

```bash
python3 -c "from pdfminer.high_level import extract_text; print(extract_text('/Users/tov/Desktop/TDP2026HW/TDP_issueflow_requirements.pdf'))"
```

Store the full output. This is the source of truth for all tests.

**Ignore** these lines in the extracted text:
- Page headers like "IssueFlow | TDP 2026 Home Assignment | Confidential"
- "Page X of 6" footers

If the PDF path doesn't exist or extraction fails, ask the user for the correct path.

### Step 2: Identify and Categorize Requirements

Read through the extracted PDF text carefully. For **every** requirement mentioned, categorize it as one of:

- **api-testable** — Can be verified with a curl command (the majority). Determine: section number, requirement text, HTTP method, endpoint, request body, expected status code, and what to check in the response.
- **code-verifiable** — Needs source code inspection (e.g., "@Cron decorator exists", "uses TypeORM", "idempotent cron behavior"). Use grep/file reads to verify.
- **skip** — Cannot be automated (e.g., "submit via HackerRank", "be prepared to explain your code"). Log these but don't test.

Build a mental list of ALL requirements before generating any tests. Group them by PDF section.

### Step 3: API Mapping Reference

**CRITICAL:** Use this reference to generate correct curl commands. The PDF's wording may differ from actual API field names and routes. This decoder ring prevents test failures from wrong field names.

#### Route Corrections
| PDF says | Actual route | Notes |
|----------|-------------|-------|
| Update user | `POST /users/update/:userId` | NOT PATCH |
| Update project | `PATCH /projects/:projectId` | |
| Update ticket | `PATCH /tickets/:ticketId` | |
| Update comment | `PATCH /tickets/:ticketId/comments/:commentId` | |
| Login | `POST /auth/login` | |
| Logout | `POST /auth/logout` | |
| Current user | `GET /auth/me` | |
| Workload | `GET /projects/:projectId/workload` | |
| Mentions | `GET /users/:userId/mentions` | |
| Soft-deleted tickets | `GET /tickets/deleted` | ADMIN only |
| Soft-deleted projects | `GET /projects/deleted` | ADMIN only |
| Restore ticket | `POST /tickets/:ticketId/restore` | ADMIN only |
| Restore project | `POST /projects/:projectId/restore` | ADMIN only |
| Dependencies | `POST /tickets/:ticketId/dependencies` | Body: `{ "blockedBy": <ticketId> }` |
| Remove dependency | `DELETE /tickets/:ticketId/dependencies/:blockerId` | |
| Attachments | `POST /tickets/:ticketId/attachments` | Multipart form, field name: `file` |
| Remove attachment | `DELETE /tickets/:ticketId/attachments/:attachmentId` | |
| Export CSV | `GET /tickets/export?projectId=X` | |
| Import CSV | `POST /tickets/import` | Multipart form, field name: `file` |
| Audit logs | `GET /audit-logs` | Query params: `entityType`, `action` |

#### Field Names (camelCase, not snake_case)
- Auth response: `accessToken` (not `access_token`)
- Comment body field: `content` (not `body` or `text`)
- Dependency field: `blockedBy` (not `blockerId` or `blockedById`)
- Overdue flag: `isOverdue` (camelCase)
- User fields: `username`, `fullName`, `email`, `password`, `role`
- Ticket fields: `title`, `description`, `status`, `priority`, `dueDate`, `assigneeId`, `projectId`, `version`
- Project fields: `name`, `description`
- Comment fields: `content`, `version`
- Roles: `ADMIN`, `DEVELOPER`
- Statuses: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`
- Priorities: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- Audit log actor values: `USER`, `SYSTEM`

#### Expected Status Codes
| Scenario | Code |
|----------|------|
| All successful operations (including creates) | 200 |
| Invalid input / validation failure | 400 |
| No token / invalid token | 401 |
| RBAC violation / DONE ticket update / self-delete | 403 |
| Entity not found | 404 |
| Optimistic locking conflict | 409 |

#### Curl Pattern Template
```bash
# Basic authenticated request
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" http://localhost:3000/endpoint)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Extract a field from JSON (no jq)
VALUE=$(echo "$BODY" | grep -o '"fieldName":"[^"]*"' | head -1 | sed 's/"fieldName":"//;s/"//')
# For numeric fields:
VALUE=$(echo "$BODY" | grep -o '"fieldName":[0-9]*' | head -1 | sed 's/"fieldName"://')
# For boolean fields:
VALUE=$(echo "$BODY" | grep -o '"fieldName":\(true\|false\)' | head -1 | sed 's/"fieldName"://')
```

### Step 4: Execute Tests

Generate and run tests **in this order** (later tests depend on data from earlier ones):

1. **Users** — Create ADMIN, DEVELOPER, and throwaway users. Store IDs.
2. **Auth** — Login as ADMIN and DEVELOPER. Store tokens. Test logout + token invalidation. Re-login for fresh tokens.
3. **Projects** — Create projects. Store IDs.
4. **Tickets** — Create tickets, test status lifecycle, optimistic locking, DONE guard. Store IDs.
5. **Comments** — Create/update comments, test optimistic locking. Store IDs.
6. **Audit Log** — Query logs, test filters.
7. **Dependencies** — Add/remove deps, test blocker rule, test same-project constraint.
8. **Attachments** — Upload valid/invalid files, delete attachment.
9. **Export/Import** — Export CSV, import it back.
10. **Soft Delete & Restore** — Delete/restore tickets and projects, RBAC checks.
11. **@Mentions** — Create comments with @username, test case-insensitive, test mention updates.
12. **Auto-Escalation** — Create overdue ticket, verify fields, grep for @Cron in source.
13. **Auto-Assignment & Workload** — Create ticket without assignee, check auto-assign + audit log, test workload endpoint, test priority reset of isOverdue.
14. **Validation & Docs** — Invalid input test, check run.md/prompts.md exist, run `npm run test`.
15. **DELETE /users** — Test user deletion with ADMIN auth, test self-delete prevention, verify cleanup.

#### Test Data Rules
- Prefix all test usernames/emails/names with `_vr_` + timestamp (e.g., `_vr_1716500000_admin`)
- Store created IDs and tokens in shell variables
- Create temp files for attachment tests: `/tmp/_vr_test.txt`, `/tmp/_vr_test.html`
- If a test fails, log it and **continue** — never stop the suite
- Clean up temp files at the end

### Step 5: Report Results

After ALL tests complete, output:

```
============================================
  IssueFlow Requirements Validation Summary
============================================
| Section | Description           | Pass | Fail |
|---------|-----------------------|------|------|
| 2.1     | User Management       | X    | Y    |
| 2.2     | Authentication        | X    | Y    |
| 2.3     | Project Management    | X    | Y    |
| 2.4     | Ticket Management     | X    | Y    |
| 2.5     | Comment Management    | X    | Y    |
| 3.1     | Audit Log             | X    | Y    |
| 3.2     | Dependencies          | X    | Y    |
| 3.3     | Attachments           | X    | Y    |
| 3.4     | Export & Import        | X    | Y    |
| 3.5     | Soft Delete & Restore | X    | Y    |
| 3.6     | @Mentions             | X    | Y    |
| 3.7     | Auto-Escalation       | X    | Y    |
| 3.8     | Auto-Assignment       | X    | Y    |
| 4.x     | Additional Checks     | X    | Y    |
|---------|-----------------------|------|------|
| TOTAL   |                       | XX   | YY   |
============================================

Coverage: X of Y PDF requirements tested, Z code-verified, W skipped (not automatable)
```

If there are failures, list them:
```
FAILURES:
  [2.1.6] DELETE /users/:userId — Expected 200, got 405
  [3.2.5] Cross-project dependency — Expected 400, got 200
  ...
```

If there are skipped requirements, list them:
```
SKIPPED (not automatable):
  - "Submit your solution via HackerRank" (Section 5)
  - "Be prepared to explain your code" (Section 5)
  ...
```

### Important Notes
- The PDF is the source of truth. If a requirement appears in the PDF that isn't covered by the API mapping reference above, still test it — use your best judgment for the correct endpoint and expected behavior.
- Run tests sequentially — later tests depend on data created by earlier ones.
- Store IDs from creation responses to use in subsequent requests.
- Use separate ADMIN and DEVELOPER tokens for RBAC testing.
- For each test, clearly state what you're testing before running the curl command.
- If a test fails, log it and continue — don't stop the suite.
- Clean up temp files at the end: `rm -f /tmp/_vr_test.txt /tmp/_vr_test.html /tmp/_vr_export.csv`
