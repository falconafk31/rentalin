# HeavyOps — Internal Heavy Equipment Rental ERP

A working Next.js 16 App Router / TypeScript MVP with Indonesian interfaces, PostgreSQL through Drizzle, Supabase Auth integration, Radix/shadcn-style UI primitives, Recharts, and server-rendered PDFs.

## Implemented

- `/dashboard`: database-driven fleet metrics, invoice revenue trends, status distribution, compliance alerts, recent records, CSV report.
- `/dashboard/fleet`: searchable/filterable/paginated fleet, create/edit, 30-day SIKO/insurance warnings.
- `/dashboard/clients`: full client CRUD, foreign-key-safe deletion.
- `/dashboard/contracts`: available-unit assignment in a transaction, active contracts, completion releasing the unit, SPH PDF.
- `/dashboard/timesheets` and `/dashboard/timesheets/new`: meter validation, daily unique records, effective-hour calculations in PostgreSQL, manager approval/rejection.
- `/dashboard/bast`: digital engine/hydraulics/tracks inspections, mobilization/demobilization records, BAST PDF.
- `/dashboard/invoices`: approved/unbilled timesheet aggregation under transactional locks, fixed 11% PPN as requested, payment status, invoice PDF.
- `/dashboard/settings`: persisted company letterhead information and account context.
- `/login`: Supabase password authentication, session refresh via Next.js proxy, role authorization on every server mutation.
- `/verify/doc?id=UUID`: minimal public document registration check; no customer or financial details exposed.

## Local preview

The supplied sandbox has a local `DATABASE_URL`. When Supabase is not configured **and the app is not running on Vercel**, a clearly labeled local administrator preview is available. Realistic demo data is seeded only into an empty local-preview database under a transaction/advisory lock. This is deliberately not production authentication. No public landing page is used; `/` redirects to the operational dashboard.

Install dependencies, prepare the database, and run:

```sh
npx drizzle-kit push
npm run dev -- --turbopack
```

Next.js 16 uses Turbopack by default. Do not apply both `schema.sql` and `drizzle-kit push` to the same fresh production database; the former includes the Supabase-specific auth foreign key and RLS policies.

## Supabase production configuration

> **Panduan migrasi lengkap** (struktur folder `supabase/`, migration berurutan, tahapan cutover, RLS, troubleshooting): **[`supabase/README.md`](supabase/README.md)**.

1. Create a Supabase project. Apply **`schema.sql`** in the Supabase SQL editor to a fresh database. It includes all requested tables, generated-hour columns, added invoice linkage, handovers, company settings, integrity constraints, and RLS policies.
2. Set environment variables in Vercel:
   - `DATABASE_URL`: the Supabase PostgreSQL/Supavisor connection string, with the provider-recommended SSL parameters.
   - `NEXT_PUBLIC_SUPABASE_URL`: project API URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
   - `NEXT_PUBLIC_APP_URL`: canonical HTTPS deployment origin, used in PDF QR links.
3. Create users through Supabase Auth. Provision each matching `profiles` row with the authenticated UUID, full name, and one of `admin`, `operations`, `operator`, `finance`. Roles are **not** read from user-editable auth metadata.
4. Configure Supabase site URL/redirect settings to the deployment domain; disable public signup for this internal application.
5. Deploy to Vercel. Missing auth configuration fails closed on Vercel (login does not permit preview access).
6. Enter company details in Pengaturan before issuing documents.

### Security model

Supabase validates the session server-side with `getUser`. Drizzle handles all business-data database access; each Server Action independently authorizes roles. Server Components and protected PDF/report routes validate the user before fetching records. The direct PostgreSQL application connection is trusted server-side and may bypass RLS, so authorization is mandatory in the server layer. The SQL RLS policies separately secure authenticated access through Supabase's Data API. Operator access is read-only outside timesheet submission; operational managers approve logs; finance/admin issue invoices and mark payments; admin alone edits company settings.

Use a dedicated server database credential, do not expose `DATABASE_URL`, and keep credentials out of client bundles. Profile role changes are administrator-provisioned; no self-service role editing exists. Verification endpoints intentionally return only a document number and type for unguessable UUIDs.

### Billing and limitations

- Invoice creation locks the contract and approved unbilled timesheets, creates the invoice, and links all billed logs in the same transaction. Repeated submissions cannot bill the same logs twice.
- PPN is fixed at **11% per the product brief**. Confirm current tax rules before production use.
- Revenue cards report issued-invoice value, not cash receipts; payment summaries separately show fully paid invoices. Partial payment status exists in the schema; payment allocation/ledger is not yet implemented.
- PDFs use A4 company letterhead, QR registration checks, and manual signature spaces. QR checks are **not** certified digital signatures.
- BAST captures inspection booleans and notes, not photos, e-signatures, or transportation scheduling.
- SPH uses an existing contract's unit/rate and is not a standalone quotation negotiation module.
- For the next iteration: immutable audit events, detailed operator assignments, payment ledger, attachments/object storage, automated compliance reminders, and dedicated admin user management.

## Validation

```sh
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

The platform-managed production preview checks `/api/health` and PostgreSQL connectivity. All operational mutations use Next.js Server Actions; route handlers are used for authenticated document/report responses.
