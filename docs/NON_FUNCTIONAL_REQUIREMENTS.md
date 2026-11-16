# Non-Functional Requirements Specification (NFR-01 to NFR-10)

This document specifies the architectural implementation, guarantees, verification procedures, and operational runbooks for the **10 Non-Functional Requirements** of the **Cambodia POS SaaS** platform.

---

## Non-Functional Requirements Matrix

| Requirement | Category | Target Metric / Guarantee | Architectural Mechanism | Verification Suite |
|---|---|---|---|---|
| **Security** | Isolation & Access | Strict zero cross-tenant leakage; granular RBAC | Scoped SQL filters, `requireTenantContext`, `requirePermission`, Helmet, bcrypt (cost 10) | `tests/non-functional.api.test.ts` (NFR-Security), `tests/phase1.api.test.ts` |
| **Performance** | Latency & Throughput | Sub-50ms barcode search; immediate POS cart response | Composite DB indexes (`sku`, `barcode`, `tenantId`), in-memory client cart, debounced queries | `tests/non-functional.api.test.ts` (NFR-Performance) |
| **Reliability** | Data Integrity & ACID | Zero orphan records; 100% rollback on failure | `prisma.$transaction` wrappers, BigInt scaled fixed-point decimal arithmetic | `tests/non-functional.api.test.ts` (NFR-Reliability) |
| **Scalability** | Multi-tenant & Branch | Unlimited independent tenants; multi-branch topology | Multi-tenant shared-schema with `tenantId` & `branchId` partition keys | `tests/non-functional.api.test.ts` (NFR-Scalability) |
| **Responsive** | UI / Device Ergonomics | Fluid rendering across Desktop, Tablet (POS), and Mobile | Tailwind CSS responsive breakpoints (`sm:`, `md:`, `lg:`), sliding mobile drawer, touch targets | Next.js Production Build (26 pages) |
| **Localization** | Khmer & English | Complete bilingual UI & Unicode thermal receipts | Strict dual dictionaries (`en.ts`, `km.ts`), `I18nContext`, UTF-8 Unicode fonts | `packages/shared/src/i18n/` |
| **Currency** | USD & KHR | Exact dual currency transactions with zero rounding drift | Dual currency engine (`convertCurrency`), daily exchange rates, split USD+KHR checkout | `tests/all-modules.api.test.ts` (FR-06), `tests/non-functional.api.test.ts` |
| **Auditability** | Compliance & Traceability | Comprehensive audit trail of business lifecycle events | `ActivityLog` engine, `oldValues`/`newValues` state diffs, `/settings/activity-logs` UI + CSV export | `tests/all-modules.api.test.ts` (FR-14) |
| **Backup** | Business Continuity | Verifiable timestamped snapshots with rotation | SHA-256 verified JSON/SQL backup engine, CLI commands (`db:backup`, `db:backup:rotate`) | `tests/non-functional.api.test.ts` (NFR-Audit & Backup) |
| **Maintainability**| Architecture & Standards | Modular, documented, fully typed TypeScript code | Monorepo (`shared`, `api`, `web`), Zod runtime schemas, unified error handling, 25 test cases | `npm run typecheck`, Vitest suites |

---

## 1. Security: Tenant Isolation & Permission Checks

### Multi-Tenant Isolation
- **Context Injection:** In `apps/api/src/common/middleware/tenantContext.ts`, the `requireTenantContext` middleware verifies the caller's active session, validates the `x-tenant-id` header against the caller's memberships in `TenantUser`, and attaches `req.tenant = { tenantId, branchId, role, permissions }`.
- **Query Scoping:** All database queries strictly filter by `where: { tenantId }`. No tenant can query or mutate another tenant's catalog, customers, inventory, sales, purchases, or settings. Cross-tenant IDs supplied in URL parameters return `404 Not Found`.

### Role-Based Access Control (RBAC)
- **Granular Permissions:** Every API route is guarded by `requirePermission(code)` (e.g. `sales.create`, `sales.refund`, `inventory.adjust`, `activity_logs.view`, `finance.manage`).
- **System & Custom Roles:** System roles include `Business Owner` (full wildcard access), `Store Manager`, `Cashier`, and `Stock Keeper`. Custom roles can be configured with any arbitrary subset of permissions.

### Authentication & Transport Security
- **Passwords:** Salted and hashed using `bcryptjs` with cost factor 10.
- **Session Tokens:** Stateless JWT access tokens with short TTL (15m) paired with opaque SHA-256 hashed refresh tokens with rotation and device revocation.
- **HTTP Protection:** Express configured with `helmet` (`x-content-type-options: nosniff`, `x-frame-options`, `strict-transport-security`) and `cors` origin whitelisting.

---

## 2. Performance: Fast Product Searches & POS Operations

### Database Indexing
The Prisma schema defines composite and unique indexes optimized for Point of Sale access patterns:
```prisma
model Product {
  @@unique([tenantId, sku])
  @@unique([tenantId, barcode])
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([categoryId])
}

model StockBalance {
  @@unique([tenantId, branchId, productId])
  @@index([tenantId])
  @@index([branchId])
  @@index([productId])
}

model Order {
  @@unique([tenantId, branchId, orderNumber])
  @@index([tenantId])
  @@index([branchId])
  @@index([createdAt])
}
```

### Fast POS Checkout Pipeline
1. **Instant Barcode Lookup:** Barcode scanning triggers single-row indexed queries or searches the local in-memory catalog with sub-50ms latency.
2. **Debounced Text Search:** Live search queries are debounced to prevent server saturation while providing interactive autocompletion.
3. **Optimistic Cart Updates:** Adding, removing, or adjusting product quantities occurs instantly in React state without round-trip network hops until checkout.

---

## 3. Reliability: Database Transactions & Data Integrity

### ACID Transaction Guarantees
All operations modifying financial, inventory, or operational state are executed inside atomic `prisma.$transaction`:
- **Sales Checkout (`createOrder`):** Atomic order header creation + line items insert + payment records + stock reduction via `applyStockMovement` + shift expected cash increment + audit activity log. If payment is insufficient or inventory is missing, the entire transaction rolls back completely with zero orphan rows.
- **Sales Returns (`createSaleReturn`):** Return record + return line items + restock movement + order status update (`COMPLETED` $\rightarrow$ `RETURNED`) + shift drawer refund deduction + audit log.
- **Stock Adjustments (`createStockAdjustment`):** Adjustment header + items + balance updates + stock movement history ledger.

### High-Precision Arithmetic
- Financial computations avoid IEEE-754 floating-point errors by utilizing fixed-point BigInt math utilities in `packages/shared/src/constants/currencies.ts`:
  - `addDecimals(a, b, scale)`
  - `subDecimals(a, b, scale)`
  - `mulDecimals(a, b, aScale, bScale, outScale)`
  - `decimalToScaledInt(val, scale)`

---

## 4. Scalability: Multiple Businesses & Branches

### Multi-Branch Architecture
- **Topology:** A single business tenant can provision multiple physical branches (e.g. Phnom Penh HQ, Siem Reap Branch, Battambang Branch).
- **Branch-Scoped Inventory:** Stock balances are partitioned by `[tenantId, branchId, productId]`, ensuring physical stock at Branch A is never mixed with Branch B.
- **Shift & Cash Isolation:** Cashier shifts, registers, and expected cash drawer totals are bound to specific physical branches.
- **Independent Document Numbering:** Orders, purchases, and invoices carry branch-scoped sequence counters (e.g. `PP-ORD-0001` vs `SR-ORD-0001`).

---

## 5. Responsive: Desktop, Tablet & Mobile

### Adaptive Viewports
- **Tablet / iPad POS:** Specially designed for 10-inch to 12.9-inch touchscreen POS terminals:
  - 3-column touch-friendly product tiles with high contrast.
  - Large tap targets for numeric keypads and quantity increments.
  - Split-screen layout (`7 / 5` grid) keeping the cart and checkout summary perpetually visible.
- **Smartphone / Mobile:**
  - Responsive hamburger drawer navigation in `AppShell.tsx`.
  - Single-column scrolling catalog with floating cart drawer badge.
  - Full-screen checkout modals for cash/ABA QR payment scanning.
- **Desktop Back-Office:**
  - Multi-column data tables with horizontal scroll containers.
  - Collapsible side navigation with quick access to reports, settings, and inventory adjustments.

---

## 6. Localization: Khmer Unicode & English

### Khmer Language Architecture
- **Character Encoding:** 100% UTF-8 encoding across database columns, JSON APIs, and Next.js templates.
- **Font Stack:** Preconfigured with Khmer fonts (Kantumruy Pro, Siemreap, Battambang) ensuring proper rendering of Khmer subscript consonants, vowels, and diacritics.
- **Strict Bilingual Dictionaries:**
  - `packages/shared/src/i18n/en.ts` (English)
  - `packages/shared/src/i18n/km.ts` (Khmer - ភាសាខ្មែរ)
- **Receipt Printing:** Receipts dynamically output Khmer labels (e.g. "វិក្កយបត្រ", "សរុប", "អរគុណ") alongside English terms.

---

## 7. Currency: USD and KHR Dual-Engine

### Cambodia Monetary Standards
- **Primary & Local Currencies:** Supports USD ($) and Cambodian Riel (៛ KHR).
- **Exchange Rate Management:** Tenants can publish daily official or market exchange rates (default 4,100 KHR/USD).
- **Multi-Currency Split Payments:** Customers can split tender across currencies in a single transaction (e.g., $10 USD order paid with $5.00 cash + 20,500 KHR via ABA Bank).
- **Cashier Drawer Tracking:** Shift registers reconcile opening cash, expected cash, and actual cash in both USD and KHR.

---

## 8. Auditability: Activity Logs

### Audit Trail Implementation
- **Capture Scope:** Records user actions across Authentication, Catalog, Inventory, Sales, Purchasing, Shifts, Roles, and Settings.
- **State Diffs:** Captures `oldValues` and `newValues` JSON payloads enabling auditors to inspect exact field-by-field changes (e.g., price modifications, stock adjustments, profile changes).
- **Transaction Status Shifts:** Automatically logs transaction lifecycle changes:
  - `order.status_changed`: `COMPLETED` $\rightarrow$ `PARTIALLY_RETURNED` / `RETURNED`
  - `purchase.received`: `ORDERED` $\rightarrow$ `RECEIVED`
  - `purchase.status_changed`: `UNPAID` $\rightarrow$ `PARTIAL` $\rightarrow$ `PAID`
  - `shift.closed`: `OPEN` $\rightarrow$ `CLOSED` with drawer cash variance
- **Reviewer UI:** Interactive interface at `/settings/activity-logs` with module filters, search, timestamp pickers, visual diff modal, and CSV export.

---

## 9. Backup: Regular Database Backups

### Automated Backup Utility
A database backup, inspection, and retention tool is located at `apps/api/scripts/backup.ts`.

#### CLI Commands
```bash
# 1. Create a timestamped database snapshot
npm run db:backup

# 2. List all backup snapshots with sizes, record counts, and SHA-256 hashes
npm run db:backup:list

# 3. Apply retention rotation (keeps newest N backups, deletes older ones)
npm --workspace=@cambodia-pos/api run db:backup:rotate -- 7
```

#### Snapshot Structure
Snapshots are written to `apps/api/backups/backup-YYYY-MM-DDTHH-mm-ss.json` with SHA-256 checksums:
```json
{
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2026-11-13T09:25:00.000Z",
    "checksum": "cf1d189d41d6e2271d639ae697ba2bf99e93cb0c688161c8f1e28b3e6957a77c",
    "tableCounts": {
      "tenant": 12,
      "product": 450,
      "order": 1280
    },
    "databaseUrlMasked": "postgresql://pos_admin:****@localhost:5432/cambodia_pos"
  },
  "tables": { ... }
}
```

#### Automated Production Cron Setup
To schedule daily automated backups at 02:00 AM Phnom Penh time:
```cron
# /etc/cron.d/cambodia-pos-backup
0 2 * * * cd /var/www/cambodia-pos && npm run db:backup >> /var/log/pos-backup.log 2>&1
```

---

## 10. Maintainability: Modular & Documented Code

### Workspace Structure
```
cambodia-pos-saas/
├── packages/
│   ├── shared/            # Shared Zod schemas, TypeScript types, i18n dictionaries, currency math
│   └── database/          # Prisma schema, migrations, seed scripts
├── apps/
│   ├── api/               # Express API backend: modular controllers, routes, services, middleware
│   │   ├── src/modules/   # Domain modules: auth, catalog, sales, purchasing, inventory, finance...
│   │   ├── scripts/       # Backup, maintenance, and database migration utilities
│   │   └── tests/         # Unit and integration test suites (Vitest + Supertest)
│   └── web/               # Next.js App Router frontend with AppShell, responsive POS, and reports
└── docs/                  # Architectural documentation and runbooks
```

### Verification & Quality Gates
- **100% Strict Type Checking:** `npm run typecheck` across all workspaces with zero `any` leaks.
- **Automated Test Coverage:** 25 integration tests across 3 suites:
  - `phase1.api.test.ts` (Phase 1 Auth, Tenants, Branches)
  - `all-modules.api.test.ts` (FR-01 to FR-14 All Modules)
  - `non-functional.api.test.ts` (NFR-01 to NFR-10 Non-Functional Suite)
- **Production Build Cleanliness:** Next.js static page generator compiles all 26 application routes with zero warnings.

