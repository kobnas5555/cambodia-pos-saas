# System Architecture — Cambodia POS SaaS

## Modular Monolith Design

The backend (`apps/api`) is organized as a modular monolith where every domain module encapsulates its router, controller, and service while sharing centralized middleware (`authenticate`, `requireTenantContext`, `requirePermission`, `validate`, `errorHandler`).

```text
apps/
├── api/
│   ├── prisma/
│   │   ├── schema.prisma      # Complete PostgreSQL schema (Modules A–I)
│   │   └── seed.ts            # Seeds permissions, BayV demo workspace & platform admin
│   └── src/
│       ├── common/            # AppError, JWT/tokens, bcrypt, stock/numbering/actor utils, middleware
│       ├── config/            # Zod-validated environment configuration
│       ├── db/                # PrismaClient singleton
│       └── modules/
│           ├── auth/          # Register business, login, refresh rotation, sessions, reset password, invitations
│           ├── tenants/       # Tenant profile & multi-business creation
│           ├── branches/      # Branch CRUD & main-branch invariants
│           ├── access/        # Permissions, custom roles, employees & invitations
│           ├── catalog/       # Categories, units, suppliers, products
│           ├── customers/     # Customer CRUD & order history
│           ├── sales/         # POS orders, split USD/KHR payments, payment history, sale returns
│           ├── purchasing/    # Purchase orders, receiving & supplier payments
│           ├── inventory/     # Stock balances, movements ledger & atomic stock adjustments
│           ├── shifts/        # Cashier shift open/close & cash discrepancy tracking
│           ├── finance/       # Expense types, expenses, additional income & summary
│           ├── reports/       # Dashboard KPIs, sales, product margin, inventory & purchase reports
│           ├── settings/      # Tax/receipt settings & USD→KHR exchange rate history
│           ├── activity-logs/ # Tenant audit log recording & filtering
│           └── platform/      # SaaS platform admin overview & tenant status controls
└── web/
    └── src/
        ├── app/               # Next.js App Router pages for every module
        ├── components/        # AppShell, LanguageSwitcher
        ├── contexts/          # AuthContext, I18nContext
        └── lib/               # Fetch wrapper with auto-refresh & X-Tenant-Id
packages/
└── shared/
    └── src/
        ├── constants/         # Scaled BigInt decimal math (USD/KHR) & permission catalog
        ├── i18n/              # English (en) & Khmer (km) dictionaries
        └── schemas/           # Shared Zod schemas & TypeScript input types
```

## Security & Accounting Integrity Rules

1. **Session-Backed Authentication:** Protected routes validate the signed JWT access token AND verify the corresponding `user_sessions` row has not been revoked or expired (`revoked_at IS NULL AND expires_at > now()`). Refresh tokens carry unique `jwtid` values and rotate their stored SHA-256 hash on every refresh.
2. **Strict Tenant Isolation:** `requireTenantContext` resolves the active `tenantId` (`X-Tenant-Id` header or access-token claim) and verifies active membership in `tenant_users` before loading tenant-scoped permissions. Every tenant query filters explicitly by `tenantId`. Cross-tenant access attempts return `403 TENANT_ACCESS_DENIED` or `404`.
3. **Atomic Stock Ledger:** Stock balances (`stock_balances`) never mutate directly outside `applyStockMovement`, which runs inside `prisma.$transaction` to update the branch-product balance and write an immutable `stock_movements` audit entry atomically.
4. **Exact Decimal Currency Math:** `packages/shared` computes USD/KHR amounts and conversions using scaled `BigInt` arithmetic matching PostgreSQL `NUMERIC(18,2|4|6)`, preventing IEEE-754 floating-point drift.
5. **Transaction Snapshots:** Orders and purchases store snapshots of prices, costs, and exchange rates so later edits do not alter historical financial reports.
