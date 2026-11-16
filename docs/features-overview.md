# Cambodia POS SaaS — Features Overview

### Documentation Single Sources of Truth
- **MVP Scope (Version 1 — Core POS)**: [MVP_SCOPE_V1.md](file:///d:/ot%20pyot/web-portfolio/SaaS%20POS/docs/MVP_SCOPE_V1.md)
- **Non-Functional Requirements (NFR-01 to NFR-10)**: [NON_FUNCTIONAL_REQUIREMENTS.md](file:///d:/ot%20pyot/web-portfolio/SaaS%20POS/docs/NON_FUNCTIONAL_REQUIREMENTS.md)
- **Architecture Overview**: [architecture.md](file:///d:/ot%20pyot/web-portfolio/SaaS%20POS/docs/architecture.md)

---

### Core Module Delivery Matrix

| # | MVP Module | Backend Routes | Frontend Pages | Status |
|---|---|---|---|---|
| 1 | **Authentication** | `/api/v1/auth/*` | `/login`, `/forgot-password`, `/reset-password` | **Delivered** |
| 2 | **Tenant Registration** | `/api/v1/auth/register-business` | `/register` | **Delivered** |
| 3 | **Business & Branch Management** | `/api/v1/tenants/*`, `/api/v1/branches/*` | `/settings/business`, `/settings/branches` | **Delivered** |
| 4 | **Employees** | `/api/v1/access/employees/*`, `/api/v1/access/invitations/*` | `/access`, `/accept-invitation` | **Delivered** |
| 5 | **Roles & Permissions** | `/api/v1/access/roles/*`, `/api/v1/access/permissions` | `/access` (Roles tab) | **Delivered** |
| 6 | **Categories & Units** | `/api/v1/categories/*`, `/api/v1/units/*` | `/products` (Categories & Units tabs) | **Delivered** |
| 7 | **Products** | `/api/v1/products/*` | `/products` | **Delivered** |
| 8 | **Customers & Suppliers** | `/api/v1/customers/*`, `/api/v1/suppliers/*` | `/customers` (Customers & Suppliers tabs) | **Delivered** |
| 9 | **POS (Point of Sale)** | `/api/v1/orders/checkout` | `/pos` | **Delivered** |
| 10 | **Sales & Payments** | `/api/v1/orders/*`, `/api/v1/payments/*`, `/api/v1/returns/*` | `/sales` | **Delivered** |
| 11 | **Purchases** | `/api/v1/purchases/*` | `/purchasing` | **Delivered** |
| 12 | **Inventory Movements** | `/api/v1/inventory/movements` | `/inventory` (Movement History tab) | **Delivered** |
| 13 | **Stock Adjustments** | `/api/v1/inventory/adjust` | `/inventory` (Manual Adjustment Modal) | **Delivered** |
| 14 | **Shifts** | `/api/v1/shifts/*` | `/shifts` | **Delivered** |
| 15 | **Expenses & Incomes** | `/api/v1/finance/*` | `/finance` | **Delivered** |
| 16 | **Basic Reports** | `/api/v1/reports/*` | `/reports`, `/dashboard` | **Delivered** |
| 17 | **Settings** | `/api/v1/settings/*` | `/settings/system`, `/settings/sessions` | **Delivered** |
| 18 | **Activity Logs** | `/api/v1/activity-logs/*` | `/settings/activity-logs` | **Delivered** |
| 19 | **SaaS Platform Administration** | `/api/v1/platform/*` | `/platform` | **Delivered** |
