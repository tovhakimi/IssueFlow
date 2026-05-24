# Phase 5: Dependencies + Attachments + Export/Import

## Goal
Add three sub-features to the Tickets module: ticket dependency management (blockers), file attachments with validation, and CSV bulk export/import.

## Entities

### TicketDependency
| Field       | Type     | Constraints                     |
|-------------|----------|---------------------------------|
| id          | int (AI) | `@PrimaryGeneratedColumn()`     |
| ticketId    | int      | FK -> Ticket (the blocked one)  |
| blockedById | int      | FK -> Ticket (the blocker)      |

### Attachment
| Field        | Type     | Constraints                     |
|-------------|----------|---------------------------------|
| id           | int (AI) | `@PrimaryGeneratedColumn()`     |
| ticketId     | int      | FK -> Ticket                    |
| filename     | varchar  | Stored filename (unique)        |
| originalName | varchar  | User-uploaded filename          |
| contentType  | varchar  | MIME type                       |
| path         | varchar  | Disk path                       |
| size         | int      | File size in bytes              |

## API Routes

| Method | Route                                           | Description              | Auth | Notes                              |
|--------|-------------------------------------------------|--------------------------|------|------------------------------------|
| POST   | /tickets/:ticketId/dependencies                 | Add dependency           | JWT  | Body: `{ "blockedBy": <id> }`      |
| GET    | /tickets/:ticketId/dependencies                 | List blockers            | JWT  | Returns Ticket[] not join rows     |
| DELETE | /tickets/:ticketId/dependencies/:blockerId      | Remove dependency        | JWT  |                                    |
| POST   | /tickets/:ticketId/attachments                  | Upload file              | JWT  | Multipart, diskStorage             |
| GET    | /tickets/:ticketId/attachments                  | List attachments         | JWT  |                                    |
| DELETE | /tickets/:ticketId/attachments/:attachmentId    | Remove attachment        | JWT  | Removes record, not file           |
| GET    | /tickets/export?projectId=X                     | Export CSV               | JWT  | `Content-Disposition: attachment`  |
| POST   | /tickets/import?projectId=X                     | Import CSV               | JWT  | Multipart, memoryStorage           |

## Key Design Decisions
- **Same-project constraint on dependencies** — both tickets must share the same `projectId`. Prevents confusing cross-project blockers.
- **DONE-transition blocker gate** — before marking a ticket DONE, check all blockers are DONE. Integrated into the existing `update()` method via `assertNoBlockers()`.
- **GET dependencies returns Ticket objects** — not raw join rows. The API consumer needs ticket data, not just IDs. Uses `findBy({ id: In(blockerIds) })`.
- **Attachment storage: diskStorage for uploads, memoryStorage for CSV import** — uploaded files persist to disk; CSV is parsed in-memory (no need to save the file).
- **Attachment validation at multer level** — `fileFilter` checks MIME type, `limits.fileSize` enforces 10MB cap. Rejected before the request handler runs.
- **CSV import error handling per-row** — catch errors for each row, accumulate results, return `{ created, failed, errors }`. Partial success is allowed.
- **Route order** — `/export` and `/import` declared before `/:ticketId` in the controller.

## Dependencies on Other Phases
- Phase 3: Ticket entity and TicketsService (dependencies and attachments belong to tickets)

## Risks & Edge Cases
- Self-dependency (ticket blocking itself) — should be rejected or at minimum handled gracefully
- Circular dependencies (A blocks B, B blocks A) — not explicitly blocked by the spec; document as a known limitation
- CSV import with invalid `assigneeId` values — handled by per-row try/catch
- File type spoofing — multer checks `file.mimetype` which comes from the client; a malicious client could lie. Acceptable for assignment scope.
