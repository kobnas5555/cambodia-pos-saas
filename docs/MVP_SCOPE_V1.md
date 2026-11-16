# MVP Scope: Version 1 — Core POS Specification & Delivery Report

This document specifies the architecture, functional capabilities, user workflows, API contracts, and verification status for all **18 core modules** of **Version 1 — Core POS** for the **Cambodia POS SaaS** platform.

---

## 1. Executive Summary & Readiness Status

The **Version 1 — Core POS** MVP is fully implemented, strictly typechecked, and verified via automated integration suites. The platform provides a production-grade multi-tenant Point of Sale and retail business management engine tailored for Cambodian retail commerce, featuring native dual-currency operations (USD and KHR), Bakong KHQR receipt generation, Khmer Unicode localization, and rigorous multi-branch inventory tracking.

### MVP Scope Matrix

| # | MVP Module | Backend Routes | Frontend Routes | Status | Test Coverage |
|---|---|---|---|---|---|
| 1 | **Authentication** | `/api/v1/auth/*` | `/login`, `/forgot-password`, `/reset-password` | **Delivered** | `tests/phase1.api.test.ts` |
| 2 | **Tenant Registration** | `/api/v1/auth/register-business` | `/register` | **Delivered** | `tests/phase1.api.test.ts` |
| 3 | **Business & Branch Management** | `/api/v1/tenants/*`, `/api/v1/branches/*` | `/settings/business`, `/settings/branches` | **Delivered** | `tests/phase1.api.test.ts`, `non-functional.api.test.ts` |
| 4 | **Employees** | `/api/v1/access/employees/*`, `/api/v1/access/invitations/*` | `/access`, `/accept-invitation` | **Delivered** | `tests/all-modules.api.test.ts` (FR-03) |
| 5 | **Roles & Permissions** | `/api/v1/access/roles/*`, `/api/v1/access/permissions` | `/access` (Roles tab) | **Delivered** | `tests/all-modules.api.test.ts` (FR-03), `non-functional.api.test.ts` |
| 6 | **Categories & Units** | `/api/v1/categories/*`, `/api/v1/units/*` | `/products` (Categories & Units tabs) | **Delivered** | `tests/all-modules.api.test.ts` (FR-04) |
| 7 | **Products** | `/api/v1/products/*` | `/products` | **Delivered** | `tests/all-modules.api.test.ts` (FR-04), `non-functional.api.test.ts` |
| 8 | **Customers & Suppliers** | `/api/v1/customers/*`, `/api/v1/suppliers/*` | `/customers` (Customers & Suppliers tabs) | **Delivered** | `tests/all-modules.api.test.ts` (FR-04, FR-05) |
| 9 | **POS (Point of Sale)** | `/api/v1/orders/checkout` | `/pos` | **Delivered** | `tests/all-modules.api.test.ts` (FR-05), `non-functional.api.test.ts` |
| 10 | **Sales & Payments** | `/api/v1/orders/*`, `/api/v1/payments/*`, `/api/v1/returns/*` | `/sales` | **Delivered** | `tests/all-modules.api.test.ts` (FR-06, FR-07) |
| 11 | **Purchases** | `/api/v1/purchases/*` | `/purchasing` | **Delivered** | `tests/all-modules.api.test.ts` (FR-08) |
| 12 | **Inventory Movements** | `/api/v1/inventory/movements` | `/inventory` (Movement History tab) | **Delivered** | `tests/all-modules.api.test.ts` (FR-09) |
| 13 | **Stock Adjustments** | `/api/v1/inventory/adjust` | `/inventory` (Manual Adjustment Modal) | **Delivered** | `tests/all-modules.api.test.ts` (FR-09) |
| 14 | **Shifts** | `/api/v1/shifts/*` | `/shifts` | **Delivered** | `tests/all-modules.api.test.ts` (FR-10) |
| 15 | **Expenses & Incomes** | `/api/v1/finance/*` | `/finance` | **Delivered** | `tests/all-modules.api.test.ts` (FR-11) |
| 16 | **Basic Reports** | `/api/v1/reports/*` | `/reports`, `/dashboard` | **Delivered** | `tests/all-modules.api.test.ts` (FR-12) |
| 17 | **Settings** | `/api/v1/settings/*` | `/settings/system`, `/settings/sessions` | **Delivered** | `tests/all-modules.api.test.ts` (FR-13) |
| 18 | **Activity Logs** | `/api/v1/activity-logs/*` | `/settings/activity-logs` | **Delivered** | `tests/all-modules.api.test.ts` (FR-14), `non-functional.api.test.ts` |

---

## 2. Detailed Module Breakdown

### 2.1. Authentication
- **Capabilities:**
  - Secure email/password authentication with `bcryptjs` password hashing (cost factor 10).
  - Dual-token session management: short-lived stateless JWT access tokens (15m TTL) paired with persistent, cryptographically secure SHA-256 refresh tokens.
  - Refresh token rotation preventing replay attacks; automatic family revocation upon detected reuse.
  - Device session tracking capturing user agent, IP address, and active status with individual and bulk device logout.
  - Secure password reset flow with time-bound single-use reset tokens.
  - Rate limiting on authentication endpoints (60 req / 15 min in production).
- **Backend Components:**
  - `apps/api/src/modules/auth/auth.controller.ts`
  - `apps/api/src/modules/auth/auth.service.ts`
  - `apps/api/src/modules/auth/auth.routes.ts`
- **Frontend Pages:**
  - `/login`: Form with email/password, validation, remember me, error alerts.
  - `/forgot-password`: Email request form for password recovery.
  - `/reset-password`: Token validation and new password submission.
  - `/settings/sessions`: Active device listing with remote session termination.

### 2.2. Tenant Registration
- **Capabilities:**
  - One-click atomic tenant provisioning wrapping business creation, default main branch setup, initial exchange rate configuration (1 USD = 4,100 KHR), owner role assignment, and initial user session into a single database transaction.
  - Strict validation of business legal name, unique email address, and initial branch name.
- **Backend Components:**
  - `apps/api/src/modules/tenants/tenants.service.ts` (`registerBusinessTenant`)
  - `packages/shared/src/schemas/pos.ts` (`registerBusinessSchema`)
- **Frontend Pages:**
  - `/register`: Comprehensive onboarding wizard for business owners.

### 2.3. Business and Branch Management
- **Capabilities:**
  - Business profile editing: legal name, phone, address, tax identification number (TIN), default currency (USD/KHR), and default interface language.
  - Multi-branch administration: creation, naming, code generation, physical address, and contact details.
  - Active branch switcher in the top navigation bar allowing managers/cashiers to scope POS, stock, and orders to their physical store.
  - Business safety rule: Main/Primary branch is protected against accidental deactivation.
- **Backend Components:**
  - `apps/api/src/modules/branches/branches.service.ts`
  - `apps/api/src/modules/branches/branches.controller.ts`
  - `apps/api/src/modules/branches/branches.routes.ts`
- **Frontend Pages:**
  - `/settings/business`: Company profile, contact information, and localization defaults.
  - `/settings/branches`: Branch grid, primary branch toggling, create/edit branch modals.

### 2.4. Employees
- **Capabilities:**
  - Staff directory tracking full name, email, phone, assigned role, assigned branches, and status (`ACTIVE`, `SUSPENDED`).
  - Secure employee invitation workflow: generates cryptographically secure invitation tokens delivered via email or copyable activation link.
  - Employee acceptance flow: allows invited employees to verify credentials, set their password, and enter the assigned tenant workspace.
  - Status updates (`SUSPENDED` instantly revokes all active JWT sessions and blocks login).
- **Backend Components:**
  - `apps/api/src/modules/access/access.service.ts`
  - `apps/api/src/modules/access/access.controller.ts`
- **Frontend Pages:**
  - `/access` (Employees tab): Staff table, invitation modal, role re-assignment, suspension toggles.
  - `/accept-invitation`: Public token validation and onboarding page.

### 2.5. Roles and Permissions
- **Capabilities:**
  - Role-Based Access Control (RBAC) enforced at both route middleware and UI rendering layers.
  - System predefined roles:
    - `Business Owner`: Wildcard superadmin access to all tenant functions.
    - `Store Manager`: Inventory adjustments, purchasing, staff scheduling, reports, and sales overrides.
    - `Cashier`: POS terminal, order checkout, receipt printing, and shift management.
    - `Stock Keeper`: Inventory balances, receiving purchases, and stock movements.
  - Custom roles: Create bespoke roles with any subset of 25+ granular system permissions (e.g. `sales.create`, `sales.refund`, `inventory.adjust`, `finance.manage`, `reports.view`).
- **Backend Components:**
  - `apps/api/src/common/middleware/auth.ts` (`requirePermission`)
  - `apps/api/src/modules/access/access.service.ts`
- **Frontend Pages:**
  - `/access` (Roles & Permissions tab): Role matrix editor with visual permission toggles.

### 2.6. Categories and Units
- **Capabilities:**
  - Hierarchical product categories with name (Khmer & English), parent category linking, icon/badge colors, and sort orders.
  - Measurement units supporting retail and wholesale operations (e.g., Can, Box, Pack, Bottle, Kg, Gram, Piece).
  - Conversion factors between units (e.g., 1 Box = 24 Cans) for wholesale breakdown.
- **Backend Components:**
  - `apps/api/src/modules/catalog/catalog.service.ts`
  - `apps/api/src/modules/catalog/catalog.controller.ts`
- **Frontend Pages:**
  - `/products` (Categories & Units management drawers): Add, edit, and organize catalog taxonomies.

### 2.7. Products
- **Capabilities:**
  - Product catalog management with SKU, barcode, bilingual name (Khmer & English), description, category, unit, cost price, and selling price.
  - Automatic SKU & Barcode uniqueness validation scoped to the business tenant.
  - Inventory tracking toggle (`trackInventory: boolean`) with minimum stock alert thresholds.
  - Instant barcode lookups and debounced multi-field search (name, barcode, SKU).
  - Product archiving (soft delete) preserving historic sales and purchase associations.
- **Backend Components:**
  - `apps/api/src/modules/catalog/catalog.service.ts`
  - `packages/database/prisma/schema.prisma` (`Product` with composite indexes)
- **Frontend Pages:**
  - `/products`: Rich product catalog table with live search, stock level indicators, category pills, image thumbnails, and comprehensive create/edit modal.

### 2.8. Customers and Suppliers
- **Capabilities:**
  - Customer directory: Phone number lookup, email, address, total spent, outstanding credit ledger, and loyalty note history.
  - Supplier directory: Company name, primary contact, telephone, payment terms (e.g. Net 30, Due on Receipt), and purchase order history.
  - Real-time customer selection during POS checkout for invoice personalization and debt tracking.
- **Backend Components:**
  - `apps/api/src/modules/customers/customers.service.ts`
  - `apps/api/src/modules/catalog/catalog.service.ts` (Suppliers)
- **Frontend Pages:**
  - `/customers`: Dual-tab directory for managing both Customers and Suppliers with creation/editing modals and transaction metrics.

### 2.9. POS (Point of Sale)
- **Capabilities:**
  - High-velocity checkout interface designed for touchscreen monitors, barcode scanners, and keyboard shortcuts.
  - Real-time product search with barcode scan auto-add to cart.
  - Category chip filter for fast visual catalog browsing.
  - In-memory cart with quantity increment/decrement, item-level discounts (percentage or fixed amount), and order-level discounts.
  - Dual-currency total summary displaying subtotal, discount, VAT, and final total in both USD and KHR simultaneously.
  - Thermal receipt generator supporting standard 80mm and 58mm printer profiles with Khmer Unicode typography and Bakong KHQR dynamic payload display.
- **Backend Components:**
  - `apps/api/src/modules/sales/sales.service.ts` (`createOrderAndProcessPayment`)
- **Frontend Pages:**
  - `/pos`: Dedicated POS terminal layout with responsive split-pane design (catalog grid on left, live cart & checkout panel on right).

### 2.10. Sales and Payments
- **Capabilities:**
  - Full order lifecycle: `PENDING`, `COMPLETED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `CANCELLED`.
  - Multi-payment tender support: Cash, ABA Pay, ACLEDA, Other.
  - Split-currency tender: Customers can pay a portion in USD Cash and the remainder in KHR via Bakong KHQR.
  - Automated change calculation in the customer's preferred currency with zero rounding loss.
  - Sales returns & refunds (FR-07): Look up original order, select returned items and quantities, record return reasons, compute proportional refundable amounts, and restock inventory based on item condition.
- **Backend Components:**
  - `apps/api/src/modules/sales/sales.service.ts`
  - `apps/api/src/modules/sales/sales.routes.ts`
- **Frontend Pages:**
  - `/sales`: Comprehensive order history table, date filtering, receipt reprint modal, and interactive Sales Return & Refund wizard.

### 2.11. Purchases
- **Capabilities:**
  - Complete purchasing workflow (FR-08): Supplier selection, purchasing branch, line items with purchasing unit costs, and automated purchase order numbering (`PO-YYYYMMDD-XXXX`).
  - Payment tracking: `UNPAID`, `PARTIAL`, `PAID` with purchase payment recording (Cash, Bank Transfer).
  - Receiving workflow: Direct immediate inventory receipt upon creation or two-stage purchase order receipt (`/api/v1/purchases/:id/receive`) updating stock balances and moving average costs.
- **Backend Components:**
  - `apps/api/src/modules/purchasing/purchasing.service.ts`
  - `apps/api/src/modules/purchasing/purchasing.controller.ts`
- **Frontend Pages:**
  - `/purchasing`: Purchase order registry, payment status badges, create purchase order modal, and receive goods confirmation modal.

### 2.12. Inventory Movements
- **Capabilities:**
  - Comprehensive double-entry style stock movement ledger (FR-09).
  - Records every stock change with movement type (`SALE`, `PURCHASE`, `RETURN`, `ADJUSTMENT`, `TRANSFER`), previous stock balance, quantity delta, resulting stock balance, actor, and timestamp.
  - Complete auditability ensuring no stock is ever modified without an immutable movement log.
- **Backend Components:**
  - `apps/api/src/modules/inventory/inventory.service.ts` (`listMovements`)
- **Frontend Pages:**
  - `/inventory` (Movement History tab): Filterable chronological stock ledger with search by product or reference number.

### 2.13. Stock Adjustments
- **Capabilities:**
  - Manual inventory correction workflow (FR-09) for reconciling physical stock with digital balances.
  - Supported adjustment reasons: Physical Count, Damaged Goods, Expired Stock, Theft/Discrepancy, and Internal Store Consumption.
  - Permission guard: Strictly requires `inventory.adjust` permission, preventing unauthorized stock alterations.
  - Generates corresponding `ADJUSTMENT` movement entries in the inventory ledger.
- **Backend Components:**
  - `apps/api/src/modules/inventory/inventory.service.ts` (`adjustStock`)
- **Frontend Pages:**
  - `/inventory` (Stock Balances tab): Interactive manual adjustment modal with reason picker, note field, and instant balance update.

### 2.14. Shifts
- **Capabilities:**
  - Cashier shift lifecycle management (FR-10):
    - Opening shift: Register starting cash float in USD and KHR.
    - Active shift: System automatically tracks all cash sales and refunds during the cashier's active session.
    - Closing shift: Cashier records actual cash counts at register close; system computes expected cash, actual cash, and cash difference (over/short).
    - Prevents multiple concurrent open shifts for the same cashier.
    - Manager shift review and audit logging.
- **Backend Components:**
  - `apps/api/src/modules/shifts/shifts.service.ts`
  - `apps/api/src/modules/shifts/shifts.controller.ts`
- **Frontend Pages:**
  - `/shifts`: Cash drawer dashboard showing active shift status, open shift modal, close shift reconciliation modal, and historical shift logs.

### 2.15. Expenses and Incomes
- **Capabilities:**
  - Financial ledger (FR-11) for non-sales cashflows:
    - Customizable expense types (Rent, Utilities, Staff Meals, Store Supplies, Marketing, Repairs).
    - Expense recording with date, amount, currency (USD/KHR), payment method, payee, and notes.
    - Additional business income recording (Service fees, Waste recycling/scrap sales, Delivery fees).
    - Unified financial transaction ledger and date-scoped net operating income summary.
- **Backend Components:**
  - `apps/api/src/modules/finance/finance.service.ts`
  - `apps/api/src/modules/finance/finance.controller.ts`
- **Frontend Pages:**
  - `/finance`: Financial overview cards (Total Revenue, Expenses, Incomes, Net Balance), Expense Category configuration modal, Expense creation modal, and Income creation modal.

### 2.16. Basic Reports
- **Capabilities:**
  - Comprehensive analytical reporting suite (FR-12):
    - Daily Sales Report: Hourly transaction breakdown and payment method distribution.
    - Monthly Sales Report: Daily revenue curve, sales volume, and average order value.
    - Product Performance: Top-selling products ranked by revenue, volume sold, and profit margin.
    - Inventory Valuation: Total asset value, low stock warnings, and out-of-stock alerts.
    - Purchase Report: Spend by supplier and receiving status.
    - Expense & Income Reports: Categorized breakdown of operating expenses.
    - Profit Estimation: Formula-driven net profit calculation (`Revenue - COGS - Expenses + Incomes`).
    - Shift Summary Reports: Cash drawer reconciliation summaries for accountant review.
- **Backend Components:**
  - `apps/api/src/modules/reports/reports.service.ts`
  - `apps/api/src/modules/reports/reports.controller.ts`
- **Frontend Pages:**
  - `/reports`: Interactive tabbed reporting center with date range pickers (Today, Yesterday, Last 7 Days, This Month, Custom) and export capabilities.
  - `/dashboard`: High-level operational overview featuring KPI summary cards and quick action links.

### 2.17. Settings
- **Capabilities:**
  - Full system configuration suite (FR-13):
    - Business Profile: Legal entity name, contact email, phone, street address, and tax ID.
    - Localization & Currency: Default interface language (Khmer/English), default base currency, and daily USD/KHR exchange rate with update history.
    - Receipt Settings: Custom header title, address, telephone, thank-you footer message, VAT toggle, and barcode toggle.
    - Tax Configuration: Value Added Tax (VAT) rate percentage, tax inclusion/exclusion mode, and tax registration number.
    - Document Numbering: Custom sequential prefixes and zero-padding for Invoices (`INV-`), Orders (`ORD-`), Purchase Orders (`PO-`), and Returns (`RET-`).
    - User Preferences: Dark/light mode theme and personalized language preference.
- **Backend Components:**
  - `apps/api/src/modules/settings/settings.service.ts`
  - `apps/api/src/modules/settings/settings.controller.ts`
- **Frontend Pages:**
  - `/settings/system`: Central settings management dashboard with organized sections for Receipt, Tax, Numbering, and Preferences.
  - `/settings/business`: Business profile and exchange rate configuration.

### 2.18. Activity Logs
- **Capabilities:**
  - Enterprise audit trail engine (FR-14 & NFR-08):
    - Automated logging across all system actions (`auth`, `catalog`, `sales`, `purchases`, `shifts`, `access`, `settings`).
    - Records acting user, employee profile, action code, target module, record ID, IP address, user agent, and timestamp.
    - Detailed state mutation diffs capturing exact `oldValues` and `newValues` for full operational traceability.
    - Interactive log browser with KPI metric cards, multi-facet filtering (module, action, user, date range, search query), side-by-side visual diff modal, and client-side CSV export.
- **Backend Components:**
  - `apps/api/src/modules/activity-logs/activity-logs.service.ts`
  - `apps/api/src/modules/activity-logs/activity-logs.controller.ts`
- **Frontend Pages:**
  - `/settings/activity-logs`: Interactive audit console with live filtering, metric counters, diff modal with syntax highlighting, and CSV export.

---

## 3. Production Verification & Test Summary

All 18 modules have been validated through end-to-end integration tests, schema validation, and complete frontend builds:

### Test Execution Matrix
```text
✓ @cambodia-pos/shared (6 tests)
  - currency math, fixed-point rounding, exchange conversions, Zod schemas

✓ @cambodia-pos/api (25 tests across 3 suites)
  - tests/phase1.api.test.ts (6 tests): Auth, tenant registration, multi-branch, isolation
  - tests/all-modules.api.test.ts (13 tests): All functional modules FR-01 through FR-14
  - tests/non-functional.api.test.ts (6 tests): Security, latency, ACID atomicity, scalability, backup

✓ @cambodia-pos/web (2 tests + Next.js Production Build)
  - 26 static and dynamic routes successfully compiled and prerendered
```

### TypeScript Compliance
- `npm run typecheck`: **0 errors** across all packages (`@cambodia-pos/shared`, `@cambodia-pos/api`, `@cambodia-pos/web`).

---

## 4. Runbook: Starting & Operating Version 1

### Development Mode
```bash
# Install dependencies across all workspaces
npm install

# Run all workspaces in parallel (API on port 5000, Web on port 3000)
npm run dev
```

### Production Build
```bash
# Typecheck all packages
npm run typecheck

# Run automated test suites
npm test

# Build Next.js production web app
npm --workspace=@cambodia-pos/web run build
```

### Database Backup & Disaster Recovery
```bash
# Create an immediate full snapshot with SHA-256 integrity checksum
npm run db:backup

# List existing snapshots and verify integrity
npm run db:backup:list

# Apply retention policy (retains last 10 snapshots)
npm --workspace=@cambodia-pos/api run db:backup:rotate -- --keep=10
```

