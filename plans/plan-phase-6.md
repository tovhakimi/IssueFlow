# Phase 6: Scheduler (Auto-Escalation)

## Goal
Implement the hourly auto-escalation cron job that bumps overdue ticket priority and flags them, as a standalone SchedulerModule.

## Escalation Logic

```
For each ticket where dueDate < NOW() AND status != DONE AND deletedAt IS NULL:

  LOW      -> MEDIUM
  MEDIUM   -> HIGH
  HIGH     -> CRITICAL
  CRITICAL -> (no change, set isOverdue = true)

When priority reaches CRITICAL: set isOverdue = true
If already CRITICAL and isOverdue = true: skip (idempotent)
```

## API Routes

No new API routes. This is a background job only.

| Trigger                        | Schedule         | Action                           |
|-------------------------------|------------------|----------------------------------|
| `@Cron(CronExpression.EVERY_HOUR)` | Every hour | Escalate overdue ticket priority |

## Key Design Decisions
- **Standalone SchedulerModule** — keeps cron logic separate from business logic. Imports TicketsModule to get access to TicketsService.
- **Calls `ticketsService.escalateOverdueTickets()`** — the escalation method lives on TicketsService, not directly in EscalationService. This avoids duplicating ticket repository access.
- **Does NOT go through `update()`** — the cron job queries and saves directly, bypassing the DONE guard, version check, and user audit log. This is intentional: escalation is a SYSTEM action with its own audit trail.
- **Idempotent at CRITICAL** — if a ticket is already CRITICAL and `isOverdue=true`, the cron skips it entirely. Running the cron multiple times produces the same result.
- **Manual priority PATCH resets isOverdue** — already handled in Phase 3's `update()` method. When a user manually sets priority, `isOverdue` is reset to `false`, allowing the escalation cycle to restart.

## Dependencies on Other Phases
- Phase 3: Ticket entity (dueDate, priority, isOverdue fields), TicketsService, AuditLogService

## Risks & Edge Cases
- **Large number of overdue tickets** — the query fetches all at once. For assignment scope this is fine; in production you'd batch with pagination.
- **Timezone handling** — `dueDate < NOW()` uses database server time. Ensure PostgreSQL timezone matches expectations.
- **Concurrent cron runs** — if the previous run hasn't finished when the next fires, TypeORM save operations are not atomic across tickets. Acceptable for assignment scope.
