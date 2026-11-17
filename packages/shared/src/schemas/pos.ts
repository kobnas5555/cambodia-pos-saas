import { z } from 'zod';
import { PAYMENT_METHODS, SUPPORTED_CURRENCIES } from '../constants/currencies';
import { SUPPORTED_LANGUAGES } from '../i18n';

const decimalString = (message = 'Must be a valid non-negative number') =>
  z.union([z.string(), z.number()]).transform((v) => String(v).trim()).refine(
    (v) => /^\d+(?:\.\d+)?$/.test(v),
    { message },
  );

const positiveDecimalString = (message = 'Must be greater than zero') =>
  decimalString(message).refine((v) => Number(v) > 0, { message });

// ============================================================================
// Phase 2: Employees, Roles, Permissions & Invitations
// ============================================================================

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional().nullable(),
  permissionCodes: z.array(z.string().trim()).min(1, 'Select at least one permission'),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(300).optional().nullable(),
  permissionCodes: z.array(z.string().trim()).min(1).optional(),
});

export const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().toUpperCase().min(2).max(40),
  name: z.string().trim().min(2).max(140),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  position: z.string().trim().max(100).optional().nullable(),
  hireDate: z.string().optional().nullable(),
  branchIds: z.array(z.string().uuid()).default([]),
  roleId: z.string().uuid().optional().nullable(),
  createUserAccount: z.boolean().default(false),
  password: z.string().min(8).max(100).optional(),
});

export const updateEmployeeSchema = z.object({
  employeeCode: z.string().trim().toUpperCase().min(2).max(40).optional(),
  name: z.string().trim().min(2).max(140).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  position: z.string().trim().max(100).optional().nullable(),
  hireDate: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  branchIds: z.array(z.string().uuid()).optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

export const listEmployeesQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  branchId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const inviteEmployeeSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  roleId: z.string().uuid(),
  name: z.string().trim().min(2).max(140).optional(),
  branchIds: z.array(z.string().uuid()).default([]),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(16),
  name: z.string().trim().min(2).max(140).optional(),
  phone: z.string().trim().max(40).optional(),
  password: z.string().min(8).max(100).optional(),
});

// ============================================================================
// Phase 3: Categories, Units, Suppliers & Products
// ============================================================================

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const listCategoriesQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional().default('ALL'),
  parentId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createUnitSchema = z.object({
  name: z.string().trim().min(1).max(80),
  abbreviation: z.string().trim().min(1).max(20),
});

export const updateUnitSchema = createUnitSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactPerson: z.string().trim().max(140).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable().or(z.literal('')),
  address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const listSuppliersQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional().default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  unitId: z.string().uuid(),
  sku: z.string().trim().toUpperCase().min(1).max(80),
  barcode: z.string().trim().max(100).optional().nullable(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  costPrice: decimalString(),
  sellingPrice: decimalString(),
  wholesalePrice: decimalString().optional().nullable(),
  lowStockAlert: decimalString().default('0'),
  trackInventory: z.boolean().default(true),
  openingStock: decimalString().optional(),
  branchId: z.string().uuid().optional(),
});

export const updateProductSchema = createProductSchema
  .omit({ openingStock: true, branchId: true })
  .partial()
  .extend({
    status: z.enum(['ACTIVE', 'ARCHIVED', 'INACTIVE']).optional(),
  });

export const listProductsQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  unitId: z.string().optional(),
  status: z.enum(['ALL', 'ACTIVE', 'ARCHIVED', 'INACTIVE']).optional().default('ALL'),
  branchId: z.string().optional(),
  trackInventory: z.enum(['ALL', 'TRUE', 'FALSE']).optional().default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListProductsQueryInput = z.infer<typeof listProductsQuerySchema>;

// ============================================================================
// Phase 4 & 5: Customers, Orders & Payments
// ============================================================================

export const createCustomerSchema = z.object({
  customerCode: z.string().trim().toUpperCase().min(2).max(40).optional(),
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const listCustomersQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional().default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListCustomersQueryInput = z.infer<typeof listCustomersQuerySchema>;

export const orderItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: positiveDecimalString('Quantity must be greater than zero'),
  unitPrice: decimalString().optional(),
  discountAmount: decimalString().default('0'),
  taxAmount: decimalString().default('0'),
});

export const orderPaymentInputSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
  amount: positiveDecimalString('Payment amount must be greater than zero'),
  currencyCode: z.enum(SUPPORTED_CURRENCIES),
  exchangeRate: positiveDecimalString().optional(),
  referenceNumber: z.string().trim().max(120).optional().nullable(),
});

export const createOrderSchema = z.object({
  branchId: z.string().uuid(),
  customerId: z.string().uuid().optional().nullable(),
  shiftId: z.string().uuid().optional().nullable(),
  currencyCode: z.enum(SUPPORTED_CURRENCIES).default('USD'),
  exchangeRate: positiveDecimalString().optional(),
  discountAmount: decimalString().default('0'),
  taxAmount: decimalString().default('0'),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(orderItemInputSchema).min(1, 'Cart must contain at least one item'),
  payments: z.array(orderPaymentInputSchema).min(1, 'At least one payment is required'),
});

export const listOrdersQuerySchema = z.object({
  search: z.string().optional(),
  branchId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  status: z.string().optional(),
  currencyCode: z.enum(SUPPORTED_CURRENCIES).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListOrdersQueryInput = z.infer<typeof listOrdersQuerySchema>;

export const listOrderItemsQuerySchema = z.object({
  search: z.string().optional(),
  orderId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListOrderItemsQueryInput = z.infer<typeof listOrderItemsQuerySchema>;

export const listPaymentsQuerySchema = z.object({
  search: z.string().optional(),
  orderId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  paymentMethod: z.string().optional(),
  currencyCode: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListPaymentsQueryInput = z.infer<typeof listPaymentsQuerySchema>;

// ============================================================================
// Phase 6: Purchasing & Purchase Payments
// ============================================================================

export const purchaseItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: positiveDecimalString('Quantity must be greater than zero'),
  unitCost: decimalString(),
  discountAmount: decimalString().default('0'),
  taxAmount: decimalString().default('0'),
});

export const createPurchaseSchema = z.object({
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  currencyCode: z.enum(SUPPORTED_CURRENCIES).default('USD'),
  exchangeRate: positiveDecimalString().optional(),
  discountAmount: decimalString().default('0'),
  taxAmount: decimalString().default('0'),
  receiveImmediately: z.boolean().default(true),
  purchaseDate: z.string().optional(),
  items: z.array(purchaseItemInputSchema).min(1, 'Add at least one purchased item'),
  initialPayment: z
    .object({
      amount: positiveDecimalString(),
      currencyCode: z.enum(SUPPORTED_CURRENCIES),
      paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
      referenceNumber: z.string().trim().max(120).optional().nullable(),
    })
    .optional(),
});

export const createPurchasePaymentSchema = z.object({
  amount: positiveDecimalString(),
  currencyCode: z.enum(SUPPORTED_CURRENCIES),
  exchangeRate: positiveDecimalString().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
  referenceNumber: z.string().trim().max(120).optional().nullable(),
  paidAt: z.string().optional(),
  status: z.enum(['COMPLETED', 'PENDING', 'VOIDED']).default('COMPLETED').optional(),
});

export const listPurchasePaymentsQuerySchema = z.object({
  search: z.string().optional(),
  purchaseId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  paymentMethod: z.string().optional(),
  currencyCode: z.enum(SUPPORTED_CURRENCIES).optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListPurchasePaymentsQueryInput = z.infer<typeof listPurchasePaymentsQuerySchema>;

export const listPurchasesQuerySchema = z.object({
  search: z.string().optional(),
  branchId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  currencyCode: z.enum(SUPPORTED_CURRENCIES).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListPurchasesQueryInput = z.infer<typeof listPurchasesQuerySchema>;

export const listPurchaseItemsQuerySchema = z.object({
  search: z.string().optional(),
  purchaseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListPurchaseItemsQueryInput = z.infer<typeof listPurchaseItemsQuerySchema>;

// ============================================================================
// Phase 7: Stock Balances, Adjustments & Movements
// ============================================================================

export const listStockBalancesQuerySchema = z.object({
  search: z.string().optional(),
  branchId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  lowStockOnly: z
    .preprocess((val) => val === 'true' || val === true, z.boolean())
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListStockBalancesQueryInput = z.infer<typeof listStockBalancesQuerySchema>;

export const CORE_STOCK_MOVEMENT_TYPES = [
  'purchase_in',
  'sale_out',
  'sale_return_in',
  'purchase_return_out',
  'adjustment_in',
  'adjustment_out',
  'opening_stock',
] as const;

export const STOCK_MOVEMENT_TYPES = [
  'purchase_in',
  'sale_out',
  'sale_return_in',
  'purchase_return_out',
  'adjustment_in',
  'adjustment_out',
  'opening_stock',
  'transfer_in',
  'transfer_out',
] as const;

export const stockMovementTypeSchema = z.enum(STOCK_MOVEMENT_TYPES);
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const listStockMovementsQuerySchema = z.object({
  search: z.string().optional(),
  branchId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  movementType: z.union([stockMovementTypeSchema, z.literal('ALL')]).optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListStockMovementsQueryInput = z.infer<typeof listStockMovementsQuerySchema>;

export const createStockAdjustmentSchema = z.object({
  branchId: z.string().uuid(),
  reason: z.string().trim().min(2).max(500),
  adjustmentDate: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        direction: z.enum(['IN', 'OUT']),
        quantity: positiveDecimalString(),
        notes: z.string().trim().max(300).optional(),
      }),
    )
    .min(1, 'At least one stock adjustment item is required'),
});

export const listStockAdjustmentsQuerySchema = z.object({
  search: z.string().optional(),
  branchId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListStockAdjustmentsQueryInput = z.infer<typeof listStockAdjustmentsQuerySchema>;

// ============================================================================
// Phase 8: Sales Returns & Refunds
// ============================================================================

export const createSaleReturnSchema = z.object({
  orderId: z.string().uuid(),
  returnReason: z.string().trim().min(2).max(500),
  refundMethod: z.enum(PAYMENT_METHODS).default('CASH'),
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: positiveDecimalString(),
        restockQuantity: decimalString().default('0'),
      }),
    )
    .min(1, 'Select at least one item to return'),
});

export const listSaleReturnsQuerySchema = z.object({
  search: z.string().optional(),
  orderId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  refundMethod: z.string().optional(),
  restockStatus: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListSaleReturnsQueryInput = z.infer<typeof listSaleReturnsQuerySchema>;

export const listSaleReturnItemsQuerySchema = z.object({
  search: z.string().optional(),
  saleReturnId: z.string().uuid().optional(),
  orderItemId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListSaleReturnItemsQueryInput = z.infer<typeof listSaleReturnItemsQuerySchema>;

// ============================================================================
// Phase 9: Shifts, Expense Types, Expenses & Incomes
// ============================================================================

export const listShiftsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  branchId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  search: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

export const openShiftSchema = z.object({
  branchId: z.string().uuid(),
  openingCash: decimalString().default('0'),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const closeShiftSchema = z
  .object({
    actualCash: decimalString().optional(),
    closingCash: decimalString().optional(),
    closingNotes: z.string().trim().max(1000).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((data) => data.actualCash !== undefined || data.closingCash !== undefined, {
    message: 'Either actualCash or closingCash must be provided',
    path: ['closingCash'],
  });

export const createExpenseTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional().nullable(),
});

export const updateExpenseTypeSchema = createExpenseTypeSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const createExpenseSchema = z.object({
  branchId: z.string().uuid(),
  expenseTypeId: z.string().uuid(),
  description: z.string().trim().max(500).optional().nullable(),
  amount: positiveDecimalString(),
  currencyCode: z.enum(SUPPORTED_CURRENCIES).default('USD'),
  exchangeRate: positiveDecimalString().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
  expenseDate: z.string().optional(),
});

export const createIncomeSchema = z.object({
  branchId: z.string().uuid(),
  description: z.string().trim().min(2).max(500),
  amount: positiveDecimalString(),
  currencyCode: z.enum(SUPPORTED_CURRENCIES).default('USD'),
  exchangeRate: positiveDecimalString().optional(),
  incomeDate: z.string().optional(),
});

// ============================================================================
// Phase 10: System Settings & Exchange Rates
// ============================================================================

export const PAPER_SIZES = ['80mm', '58mm', 'A4'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

export interface SystemSettingsMap {
  // Tax
  taxEnabled: boolean;
  taxRatePercent: string;
  taxIdentificationNumber: string;
  taxInclusive: boolean;

  // Receipts
  receiptHeader: string;
  receiptFooter: string;
  showLogo: boolean;
  showTaxDetails: boolean;
  showCashierName: boolean;
  showCustomerInfo: boolean;
  paperSize: PaperSize;

  // Numbering Formats
  orderPrefix: string;
  purchasePrefix: string;
  returnPrefix: string;
  adjustmentPrefix: string;
  expensePrefix: string;
  incomePrefix: string;
  shiftPrefix: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsMap = {
  taxEnabled: false,
  taxRatePercent: '0',
  taxIdentificationNumber: '',
  taxInclusive: false,

  receiptHeader: '',
  receiptFooter: 'Thank you for your business! / សូមអរគុណ!',
  showLogo: true,
  showTaxDetails: true,
  showCashierName: true,
  showCustomerInfo: true,
  paperSize: '80mm',

  orderPrefix: 'ORD',
  purchasePrefix: 'PUR',
  returnPrefix: 'RET',
  adjustmentPrefix: 'ADJ',
  expensePrefix: 'EXP',
  incomePrefix: 'INC',
  shiftPrefix: 'SFT',
};

export interface UserPreferences {
  language: (typeof SUPPORTED_LANGUAGES)[number];
  theme: 'light' | 'dark' | 'system';
  posSoundEnabled: boolean;
  autoPrintReceipt: boolean;
  compactTables: boolean;
  defaultBranchId: string | null;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  language: 'en',
  theme: 'light',
  posSoundEnabled: true,
  autoPrintReceipt: false,
  compactTables: false,
  defaultBranchId: null,
};

export const userPreferencesSchema = z.object({
  language: z.enum(SUPPORTED_LANGUAGES).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  posSoundEnabled: z.boolean().optional(),
  autoPrintReceipt: z.boolean().optional(),
  compactTables: z.boolean().optional(),
  defaultBranchId: z.string().uuid().nullable().optional(),
});

export const updateSettingsSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  settings: z.record(z.unknown()),
});

export const createExchangeRateSchema = z.object({
  baseCurrency: z.enum(SUPPORTED_CURRENCIES).default('USD'),
  targetCurrency: z.enum(SUPPORTED_CURRENCIES).default('KHR'),
  rate: positiveDecimalString(),
});

export const activityLogQuerySchema = z.object({
  module: z.string().trim().max(60).optional(),
  action: z.string().trim().max(80).optional(),
  recordType: z.string().trim().max(60).optional(),
  userId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ActivityLogQueryInput = z.infer<typeof activityLogQuerySchema>;
export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQueryInput = z.infer<typeof listEmployeesQuerySchema>;
export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type OrderPaymentInput = z.infer<typeof orderPaymentInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export type PurchaseItemInput = z.infer<typeof purchaseItemInputSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type CreatePurchasePaymentInput = z.infer<typeof createPurchasePaymentSchema>;

export type CreateStockAdjustmentInput = z.infer<typeof createStockAdjustmentSchema>;
export type CreateSaleReturnInput = z.infer<typeof createSaleReturnSchema>;

export type ListShiftsQueryInput = z.infer<typeof listShiftsQuerySchema>;
export type OpenShiftInput = z.infer<typeof openShiftSchema>;
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;
export type CreateExpenseTypeInput = z.infer<typeof createExpenseTypeSchema>;
export type UpdateExpenseTypeInput = z.infer<typeof updateExpenseTypeSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type CreateExchangeRateInput = z.infer<typeof createExchangeRateSchema>;

// ============================================================================
// Version 2: Business Expansion Schemas
// ============================================================================

export const stockTransferItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: positiveDecimalString('Quantity must be greater than zero'),
  notes: z.string().trim().max(255).optional().nullable(),
});

export const createStockTransferSchema = z.object({
  fromBranchId: z.string().uuid().optional(),
  toBranchId: z.string().uuid(),
  transferDate: z.string().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(stockTransferItemInputSchema).min(1, 'Transfer must include at least one product'),
});

export const updateStockTransferStatusSchema = z.object({
  status: z.enum(['PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED']),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const stockTransferQuerySchema = z.object({
  status: z.enum(['DRAFT', 'PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED']).optional(),
  fromBranchId: z.string().uuid().optional(),
  toBranchId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const changePlanSchema = z.object({
  planTier: z.enum(['FREE_TRIAL', 'STARTER', 'GROWTH', 'ENTERPRISE']),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
  paymentMethod: z.string().default('BAKONG_KHQR'),
});

export const enhancedReceiptSettingsSchema = z.object({
  paperWidth: z.enum(['80mm', '58mm']).default('80mm'),
  fontSize: z.enum(['small', 'medium', 'large']).default('medium'),
  showLogo: z.boolean().default(true),
  showTaxNumber: z.boolean().default(true),
  showCashier: z.boolean().default(true),
  showCustomer: z.boolean().default(true),
  showBarcode: z.boolean().default(true),
  showCategory: z.boolean().default(false),
  showVatBreakdown: z.boolean().default(true),
  showSavings: z.boolean().default(true),
  customHeader: z.string().max(255).optional().nullable(),
  customFooter: z.string().max(500).optional().nullable(),
  returnPolicy: z.string().max(500).optional().nullable(),
  wifiDetails: z.string().max(100).optional().nullable(),
  socialLink: z.string().max(255).optional().nullable(),
});

export const bakongWebhookSchema = z.object({
  transactionHash: z.string().min(8),
  externalReference: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  currency: z.enum(['USD', 'KHR']),
  status: z.enum(['SUCCESS', 'FAILED']),
  signature: z.string().optional(),
});

export const paywayWebhookSchema = z.object({
  tranId: z.string().min(1),
  orderId: z.string().min(1),
  status: z.string(),
  amount: z.union([z.string(), z.number()]),
  apv: z.string().optional(),
});

export type StockTransferItemInput = z.infer<typeof stockTransferItemInputSchema>;
export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
export type UpdateStockTransferStatusInput = z.infer<typeof updateStockTransferStatusSchema>;
export type StockTransferQueryInput = z.infer<typeof stockTransferQuerySchema>;
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
export type EnhancedReceiptSettingsInput = z.infer<typeof enhancedReceiptSettingsSchema>;
export type BakongWebhookInput = z.infer<typeof bakongWebhookSchema>;
export type PaywayWebhookInput = z.infer<typeof paywayWebhookSchema>;


