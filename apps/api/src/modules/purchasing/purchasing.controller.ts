export * from '../purchases/purchases.controller';
export * from '../purchase-items/purchase-items.controller';
export * from '../purchase-payments/purchase-payments.controller';

export {
  getPurchases as list,
  getPurchase as getOne,
  postPurchase as create,
  postReceivePurchase as receive,
} from '../purchases/purchases.controller';

export {
  getPurchaseItems as listItems,
} from '../purchase-items/purchase-items.controller';

export {
  getPayments as listPayments,
  getPaymentDetail as getPayment,
  postPayment as addPayment,
} from '../purchase-payments/purchase-payments.controller';
