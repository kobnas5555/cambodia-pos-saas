# Cambodia POS SaaS

Multi-tenant Point of Sale and Business Management System built for Cambodian SMBs with **USD & KHR** exact decimal currency support, **Khmer Unicode (`ខ្មែរ`) & English** localization, and strict tenant isolation.

## Tech Stack & Monorepo Layout

- **Monorepo:** TypeScript (`npm` workspaces)
  - `apps/api`: Node.js + Express + Prisma ORM + PostgreSQL (Modular Monolith)
  - `apps/web`: Next.js 15 App Router + React 19 + Tailwind CSS
  - `packages/shared`: Shared Zod schemas, scaled `BigInt` USD/KHR decimal utilities, permission catalog, and bilingual `en`/`km` i18n dictionaries
- **Database:** Full PostgreSQL Prisma schema ([schema.prisma](file:///d:/ot%20pyot/web-portfolio/SaaS%20POS/apps/api/prisma/schema.prisma)) covering Modules A–I with UUID primary keys, `NUMERIC(18,2|4|6)` precision, UTC timestamps, and tenant scoping.

## Implemented Features (Modules A–I)

- **SaaS Foundation & Auth (`/api/v1/auth`, `/tenants`, `/branches`):** Business registration transaction, login/logout, JWT access + refresh token rotation (`jti`-scoped), password reset, active session management/revocation, multi-tenant switching (`X-Tenant-Id`), and branch management with main-branch invariants.
- **Employees, Roles & Permissions (`/api/v1/access`):** Action-based permissions, custom role CRUD, employee management with branch access mapping, and employee email invitations (`/auth/accept-invitation`).
- **Catalog & Suppliers (`/api/v1/categories`, `/units`, `/suppliers`, `/products`):** Categories (with parent hierarchy), measurement units, suppliers, SKU/barcode-unique products, pricing, low-stock alerts, and opening stock initialization.
- **POS, Sales, Payments & Returns (`/api/v1/orders`, `/payments`, `/returns`, `/customers`):** Barcode/SKU/name search, cart with line & order discounts, split USD & KHR payments (`CASH`, `ABA`, `ACLEDA`, `OTHER`), change calculation, printable receipts, payment ledger, and partial/full sales returns with selective restocking.
- **Purchasing & Supplier Payments (`/api/v1/purchases`):** Purchase order creation, delayed or immediate receiving (`purchase_in`), supplier balance tracking, and partial/full supplier payments.
- **Inventory Control (`/api/v1/inventory`):** Branch stock balances with low-stock filtering, immutable stock movements audit ledger, and atomic manual stock adjustments (`adjustment_in` / `adjustment_out`). All stock changes run atomically inside database transactions.
- **Shifts & Financial Management (`/api/v1/shifts`, `/finance`):** Cashier shift open/close with expected cash vs. actual cash discrepancy tracking, expense types, branch expenses, additional business incomes, and unified base-currency cashflow summaries.
- **Reports, System Settings & Audit Logs (`/api/v1/reports`, `/settings`, `/activity-logs`):** Dashboard KPIs & 14-day sales chart, daily/monthly & payment-method sales reports, product margin/COGS reports, inventory valuation reports, purchase payable summaries, tax/receipt settings, USD→KHR exchange rate history, and tenant audit trails.
- **SaaS Platform Administration (`/api/v1/platform` & `/platform`):** Platform-wide KPI overview and tenant workspace suspend/activate controls guarded by `isPlatformAdmin`.

## Quick Start

1. **Configure environment variables**
   - Copy `.env.example` (`apps/api/.env.example` → `apps/api/.env`, `apps/web/.env.example` → `apps/web/.env.local`)
   - Set `DATABASE_URL` to your PostgreSQL database (or start Postgres with `docker compose up -d`).

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Generate Prisma client, run migrations & seed**
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   npm run prisma:seed
   ```

4. **Run typecheck, tests & production builds**
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

5. **Start API & Web dev servers**
   ```bash
   # Terminal 1 — API on http://localhost:4000
   npm run dev:api

   # Terminal 2 — Web on http://localhost:3000
   npm run dev:web
   ```

### Seeded Demo Accounts (`npm run prisma:seed`)

- **Business Owner (`BayV Accessories`):** `owner@bayv.com.kh` / `Demo1234!`
- **SaaS Platform Admin:** `platform@cambodiapos.kh` / `Admin1234!`
