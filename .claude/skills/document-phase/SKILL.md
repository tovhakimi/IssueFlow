# document-phase

Document a completed IssueFlow build phase by collecting inputs interactively,
auto-detecting changed files from git, and writing structured records to
prompts.md, Instructions.md, and (on the final phase) run.md.

## Trigger

User runs `/document-phase` after completing and committing a build phase.

## Steps

### 1. Collect inputs interactively

Ask the user for each of the following, one at a time:

1. **Phase number** — e.g. `1`
2. **Phase name** — e.g. `Project Skeleton & Auth`
3. **Prompt used** — the exact prompt that was given to Claude for this phase
   (multi-line is fine; user signals done with a blank line or explicit "done")
4. **Manual changes made after Claude's output** — anything the user edited by
   hand; `none` is a valid answer
5. **Is this the final phase?** — `yes` or `no`

### 2. Auto-detect changed files

Run:
```
git diff --name-only HEAD~1
```

Display the output to the user as a numbered list and ask:
> "Are these the files generated in this phase? You can confirm or paste a
> corrected list."

Use whatever the user confirms (or corrects) as the **Generated** file list.

### 3. Write prompts.md

File location: project root (`prompts.md`).
Create if it does not exist; append if it does.

Append the following block (replace placeholders):

```markdown
## Phase N: <name>

**Prompt:**
<prompt>

**Generated:**
- <file1>
- <file2>
...

**Manual Changes:**
<manual changes or "None">
```

Blank line before and after the block when appending to existing content.

### 4. Write Instructions.md

File location: project root (`Instructions.md`).
If the file does not contain a `## Phase Log` section, append it.
Then append one line under that section:

```
- Phase N (<name>): <one-line summary — derive from the phase name and top 3 generated files>
```

### 5. Write run.md (final phase only)

Only when the user answered **yes** to "Is this the final phase?".

Read `package.json` (scripts section) and `compose.yml` (DB service name and
ports) from the project root, then generate `run.md` at the project root with
the following numbered steps:

```markdown
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

3. **Build the project**
   ```
   npm run build
   ```

4. **Start the API server**
   ```
   npm run start:prod
   ```
   For development with live reload: `npm run start:dev`

5. **Run unit tests**
   ```
   npm run test
   ```

6. **Run end-to-end tests**
   ```
   npm run test:e2e
   ```
```

Adjust any script names to match what is actually in `package.json`.

### 6. Confirm completion

After writing all files, tell the user:
- Which files were written/updated
- The phase number and name that was recorded
- If run.md was generated, say so explicitly
