# OpsPilot

AI business operations agent for appointment-based businesses (clinics, salons, tutors, consultants).

> **Status: Phase 1 in progress.** Only the backend foundation exists so far. This README will be
> expanded with verified features as they are implemented and tested.

## Implemented so far

- Express + TypeScript API skeleton with validated config, structured errors, and logging
- PostgreSQL schema (Prisma) for users, businesses, services, hours, customers, appointments,
  conversations, messages, tool executions, and activity logs
- Database-level guard against overlapping appointments (Postgres exclusion constraint)
- Health endpoint and automated tests running against a real PostgreSQL database

## Local development (backend)

```bash
docker compose up -d                     # PostgreSQL on :5432
cd backend
cp .env.example .env                     # then set JWT_SECRET (openssl rand -hex 32)
npm install
npm run db:deploy                        # apply migrations
npm run dev
```

## License

MIT
