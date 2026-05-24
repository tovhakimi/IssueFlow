# Phase 2: Foundation + Users + Auth

## Goal
Set up the project foundation (TypeORM, PostgreSQL connection) and implement the first two domain modules — Users and Auth — establishing the authentication pattern that all subsequent phases depend on.

## Entities

### User
| Field        | Type         | Constraints                          |
|-------------|--------------|--------------------------------------|
| id          | int (AI)     | `@PrimaryGeneratedColumn()`          |
| username    | varchar      | unique                               |
| email       | varchar      | unique                               |
| fullName    | varchar      |                                      |
| role        | enum         | `ADMIN` | `DEVELOPER`                |
| passwordHash| varchar      | excluded from all responses          |
| createdAt   | timestamp    | `@CreateDateColumn()`                |

## API Routes

| Method | Route                   | Description           | Auth     | Notes                          |
|--------|-------------------------|-----------------------|----------|--------------------------------|
| POST   | /users                  | Create user           | Public   | Hash password with bcrypt      |
| GET    | /users                  | List all users        | JWT      | Excludes passwordHash          |
| GET    | /users/:userId          | Get one user          | JWT      |                                |
| POST   | /users/update/:userId   | Update user           | JWT      | NOT PATCH (spec requirement)   |
| DELETE | /users/:userId          | Delete user           | ADMIN    | Hard delete + cleanup refs     |
| POST   | /auth/login             | Login                 | Public   | Returns `{ accessToken }`      |
| POST   | /auth/logout            | Logout                | JWT      | Adds JTI to deny-list          |
| GET    | /auth/me                | Current user          | JWT      | Returns user from token        |

## Key Design Decisions
- **Global JwtAuthGuard via APP_GUARD** — almost every route needs auth; `@Public()` opt-out is cleaner than decorating every route
- **In-memory JWT deny-list (Set of JTIs)** — sufficient for assignment scope; no Redis needed
- **bcrypt with salt rounds = 10** — standard balance of security and speed
- **class-transformer @Exclude on passwordHash** — defense in depth; service also strips it manually
- **POST /users is @Public()** — registration endpoint must work without a token

## Dependencies on Other Phases
- None — this is the first implementation phase

## Risks & Edge Cases
- `LoginDto` needs explicit `@IsNotEmpty()` validators or `whitelist: true` strips the fields silently
- `JwtStrategy` reads `JWT_SECRET` from `process.env` in the constructor — e2e tests must set the env var before module compilation
- Password must never leak in any response — double-check all return paths
