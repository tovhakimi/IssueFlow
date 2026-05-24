# Phase 4: Comments + Mentions + Audit Log Wiring

## Goal
Implement the Comment system with optimistic locking, the @mention mechanism with case-insensitive parsing and stale-mention cleanup, and wire AuditLog to all remaining mutations.

## Entities

### Comment
| Field     | Type         | Constraints                          |
|-----------|--------------|--------------------------------------|
| id        | int (AI)     | `@PrimaryGeneratedColumn()`          |
| ticketId  | int          | FK -> Ticket                         |
| authorId  | int          | FK -> User, nullable                 |
| content   | text         |                                      |
| version   | int          | `@VersionColumn()` (optimistic lock) |
| createdAt | timestamp    | `@CreateDateColumn()`                |
| updatedAt | timestamp    | `@UpdateDateColumn()`                |

### Mention
| Field     | Type         | Constraints                          |
|-----------|--------------|--------------------------------------|
| id        | int (AI)     | `@PrimaryGeneratedColumn()`          |
| commentId | int          | FK -> Comment (`onDelete: CASCADE`)  |
| userId    | int          | FK -> User (`onDelete: CASCADE`)     |
| createdAt | timestamp    | `@CreateDateColumn()`                |

## API Routes

| Method | Route                                          | Description              | Auth | Notes                            |
|--------|-------------------------------------------------|--------------------------|------|----------------------------------|
| POST   | /tickets/:ticketId/comments                    | Create comment           | JWT  | Parse and create mentions        |
| GET    | /tickets/:ticketId/comments                    | List comments for ticket | JWT  | Includes `mentionedUsers` array  |
| GET    | /tickets/:ticketId/comments/:commentId         | Get one comment          | JWT  |                                  |
| PATCH  | /tickets/:ticketId/comments/:commentId         | Update comment           | JWT  | Re-sync mentions, optimistic lock|
| DELETE | /tickets/:ticketId/comments/:commentId         | Delete comment           | JWT  | Cascade deletes mentions         |
| GET    | /users/:userId/mentions                        | User's mentions          | JWT  | Returns comments, not mention rows|

## Key Design Decisions
- **MentionsController lives in CommentsModule** — the route starts with `/users/` but the data comes from comments. Putting it in UsersModule would create a circular dependency (UsersModule -> CommentsModule -> UsersModule). This is a tradeoff: route path doesn't match module, but avoids circular dep.
- **@mention sync on both create and update** — re-parse the full comment body each time. On update, add new mentions and remove stale ones (compare sets by userId).
- **Case-insensitive username lookup** — use TypeORM `ILike()` in `findByUsername()` so `@JohnDoe` and `@johndoe` both resolve.
- **Eager-loaded mentions** — `@OneToMany` from Comment to Mention with `eager: true`, so every comment query automatically includes mention data. Avoids N+1 on the common path.
- **`mentionedUsers` response field** — every comment response includes `mentionedUsers: [{ id, username, fullName }]` mapped from the eager-loaded mentions.
- **Optimistic locking** — same pattern as Tickets: manual version check + try/catch on `.save()` for TypeORM race conditions.

## Dependencies on Other Phases
- Phase 2: User entity (mentions reference users)
- Phase 3: Ticket entity (comments belong to tickets), AuditLog (all mutations logged)

## Risks & Edge Cases
- Case-insensitive matching: `parseMentions()` lowercases usernames, but `findByUsername()` must use `ILike` — a plain `findOne` would miss mixed-case usernames
- Unknown @usernames must be silently skipped (no error if a mentioned username doesn't exist)
- Comment deletion must also delete associated mention rows to avoid orphaned references
- `findMentionsByUser()` must return full Comment objects, not raw Mention join rows
