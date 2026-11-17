export interface MovementTypeDefinition {
  type: string;
  name: string;
  direction: 'IN' | 'OUT';
  description: string;
  category: 'SALES' | 'PURCHASING' | 'INVENTORY' | 'TRANSFER';
}

export const MOVEMENT_TYPES: MovementTypeDefinition[] = [
  {
    type: 'sale_out',
    name: 'Sale',
    direction: 'OUT',
    description: 'Inventory deducted for completed sales orders',
    category: 'SALES',
  },
  {
    type: 'sale_return_in',
    name: 'Sale Return',
    direction: 'IN',
    description: 'Inventory returned to stock from customer returns',
    category: 'SALES',
  },
  {
    type: 'purchase_in',
    name: 'Purchase Received',
    direction: 'IN',
    description: 'Inventory received from supplier purchase orders',
    category: 'PURCHASING',
  },
  {
    type: 'purchase_return_out',
    name: 'Purchase Return',
    direction: 'OUT',
    description: 'Inventory returned back to suppliers',
    category: 'PURCHASING',
  },
  {
    type: 'transfer_out',
    name: 'Transfer Out',
    direction: 'OUT',
    description: 'Inventory dispatched for branch transfer',
    category: 'TRANSFER',
  },
  {
    type: 'transfer_in',
    name: 'Transfer In',
    direction: 'IN',
    description: 'Inventory received from another branch transfer',
    category: 'TRANSFER',
  },
  {
    type: 'adjustment_in',
    name: 'Adjustment In',
    direction: 'IN',
    description: 'Stock increase following count or audit',
    category: 'INVENTORY',
  },
  {
    type: 'adjustment_out',
    name: 'Adjustment Out',
    direction: 'OUT',
    description: 'Stock reduction following count, loss, or audit',
    category: 'INVENTORY',
  },
  {
    type: 'opening_stock',
    name: 'Opening Stock',
    direction: 'IN',
    description: 'Initial stock entered upon catalog/product setup',
    category: 'INVENTORY',
  },
  {
    type: 'damage_out',
    name: 'Damage / Spoilage',
    direction: 'OUT',
    description: 'Stock written off due to expiry or damage',
    category: 'INVENTORY',
  },
];

export async function listMovementTypes(filters?: { direction?: 'IN' | 'OUT'; category?: string }) {
  let list = MOVEMENT_TYPES;
  if (filters?.direction) {
    list = list.filter((m) => m.direction === filters.direction);
  }
  if (filters?.category) {
    list = list.filter((m) => m.category === filters.category);
  }
  return list;
}

