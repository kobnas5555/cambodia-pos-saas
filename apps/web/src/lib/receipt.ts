import { formatCurrency, type CurrencyCode } from '@cambodia-pos/shared';

export interface PrintableReceiptOrder {
  orderNumber: string;
  subtotal?: string;
  discountAmount?: string;
  taxAmount?: string;
  totalAmount: string;
  paidAmount: string;
  changeAmount: string;
  currencyCode: CurrencyCode;
  completedAt?: string;
  createdAt?: string;
  branch: { name: string; phone?: string | null; address?: string | null };
  customer?: { name: string } | null;
  cashierEmployee: { name: string };
  orderItems: Array<{
    id: string;
    productNameSnapshot: string;
    skuSnapshot?: string;
    quantity: string;
    unitPrice?: string;
    lineTotal: string;
  }>;
  payments: Array<{
    id: string;
    paymentMethod: string;
    amount: string;
    currencyCode: CurrencyCode;
    referenceNumber?: string | null;
  }>;
}

export interface ReceiptPrintOptions {
  businessName: string;
  logoUrl?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  showLogo?: boolean;
  showTaxDetails?: boolean;
  showCashierName?: boolean;
  showCustomerInfo?: boolean;
  paperSize?: '80mm' | '58mm' | 'A4';
  taxIdentificationNumber?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function downloadOrderReceiptHtml(
  order: PrintableReceiptOrder,
  optionsOrBusinessName: string | ReceiptPrintOptions,
) {
  const options: ReceiptPrintOptions =
    typeof optionsOrBusinessName === 'string'
      ? { businessName: optionsOrBusinessName }
      : optionsOrBusinessName;

  const businessName = options.businessName || 'Store Receipt';
  const timestamp = order.completedAt || order.createdAt || new Date().toISOString();
  const paperSize = options.paperSize ?? '80mm';
  const showLogo = options.showLogo !== false;
  const showTax = options.showTaxDetails !== false;
  const showCashier = options.showCashierName !== false;
  const showCustomer = options.showCustomerInfo !== false;

  const maxWidth = paperSize === '58mm' ? '280px' : paperSize === 'A4' ? '680px' : '380px';
  const fontSize = paperSize === '58mm' ? '11px' : paperSize === 'A4' ? '13px' : '12px';

  const rows = order.orderItems
    .map(
      (oi) => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px dashed #e2e8f0;">
          <div style="font-weight:600;">${escapeHtml(oi.productNameSnapshot)}</div>
          <div style="font-size:11px;color:#64748b;">
            ${oi.skuSnapshot ? `${escapeHtml(oi.skuSnapshot)} · ` : ''}${escapeHtml(oi.quantity)}${
              oi.unitPrice ? ` × ${escapeHtml(formatCurrency(oi.unitPrice, order.currencyCode))}` : ''
            }
          </div>
        </td>
        <td style="padding:6px 0;border-bottom:1px dashed #e2e8f0;text-align:right;font-weight:600;vertical-align:top;">
          ${escapeHtml(formatCurrency(oi.lineTotal, order.currencyCode))}
        </td>
      </tr>`,
    )
    .join('');

  const paymentLines = order.payments
    .map(
      (p) =>
        `<div>${escapeHtml(p.paymentMethod)}: ${escapeHtml(
          formatCurrency(p.amount, p.currencyCode),
        )}${p.referenceNumber ? ` (Ref: ${escapeHtml(p.referenceNumber)})` : ''}</div>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Receipt ${escapeHtml(order.orderNumber)}</title>
</head>
<body style="font-family:system-ui,-apple-system,'Noto Sans Khmer',sans-serif;background:#f8fafc;padding:24px;color:#0f172a;margin:0;">
  <div style="max-width:${maxWidth};margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;box-sizing:border-box;font-size:${fontSize};">
    <div style="text-align:center;border-bottom:1px dashed #cbd5e1;padding-bottom:12px;margin-bottom:12px;">
      ${
        showLogo && options.logoUrl
          ? `<div style="margin-bottom:8px;"><img src="${escapeHtml(
              options.logoUrl,
            )}" alt="Logo" style="max-height:48px;max-width:140px;object-contain;" /></div>`
          : ''
      }
      <h1 style="margin:0;font-size:18px;">${escapeHtml(businessName)}</h1>
      ${
        options.receiptHeader
          ? `<p style="margin:4px 0 0;font-size:11px;color:#047857;font-weight:500;">${escapeHtml(
              options.receiptHeader,
            )}</p>`
          : ''
      }
      <p style="margin:4px 0 0;font-size:12px;color:#475569;">${escapeHtml(order.branch.name)}${
        order.branch.phone ? ` · ${escapeHtml(order.branch.phone)}` : ''
      }</p>
      ${
        showTax && options.taxIdentificationNumber
          ? `<p style="margin:2px 0 0;font-size:11px;color:#64748b;">VATTIN / Tax ID: <strong>${escapeHtml(
              options.taxIdentificationNumber,
            )}</strong></p>`
          : ''
      }
      <p style="margin:8px 0 0;font-family:monospace;font-size:13px;font-weight:700;">${escapeHtml(
        order.orderNumber,
      )}</p>
      <p style="margin:4px 0 0;font-size:11px;color:#64748b;">
        ${escapeHtml(new Date(timestamp).toLocaleString())}${
          showCashier ? ` · Cashier: ${escapeHtml(order.cashierEmployee.name)}` : ''
        }
      </p>
      ${
        showCustomer
          ? `<p style="margin:2px 0 0;font-size:11px;color:#64748b;">Customer: ${escapeHtml(
              order.customer?.name ?? 'Walk-in',
            )}</p>`
          : ''
      }
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:${fontSize};">
      <tbody>${rows}</tbody>
    </table>

    <div style="margin-top:12px;font-size:${fontSize};line-height:1.7;">
      ${
        order.subtotal
          ? `<div style="display:flex;justify-content:space-between;color:#475569;"><span>Subtotal</span><span>${escapeHtml(
              formatCurrency(order.subtotal, order.currencyCode),
            )}</span></div>`
          : ''
      }
      ${
        order.discountAmount && Number(order.discountAmount) > 0
          ? `<div style="display:flex;justify-content:space-between;color:#475569;"><span>Discount</span><span>-${escapeHtml(
              formatCurrency(order.discountAmount, order.currencyCode),
            )}</span></div>`
          : ''
      }
      ${
        showTax && order.taxAmount && Number(order.taxAmount) > 0
          ? `<div style="display:flex;justify-content:space-between;color:#475569;"><span>Tax / VAT</span><span>${escapeHtml(
              formatCurrency(order.taxAmount, order.currencyCode),
            )}</span></div>`
          : ''
      }
      <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;border-top:1px solid #e2e8f0;padding-top:6px;margin-top:4px;">
        <span>Total</span>
        <span>${escapeHtml(formatCurrency(order.totalAmount, order.currencyCode))}</span>
      </div>
      <div style="display:flex;justify-content:space-between;color:#475569;">
        <span>Paid</span>
        <span>${escapeHtml(formatCurrency(order.paidAmount, order.currencyCode))}</span>
      </div>
      <div style="display:flex;justify-content:space-between;color:#047857;font-weight:600;">
        <span>Change Due</span>
        <span>${escapeHtml(formatCurrency(order.changeAmount, order.currencyCode))}</span>
      </div>
    </div>

    <div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1;font-size:11px;color:#475569;">
      <div style="font-weight:600;margin-bottom:2px;">Payments</div>
      ${paymentLines}
    </div>

    ${
      options.receiptFooter
        ? `<div style="margin-top:14px;padding-top:10px;border-top:1px dashed #cbd5e1;text-align:center;font-size:11px;color:#475569;white-space:pre-line;">
            ${escapeHtml(options.receiptFooter)}
          </div>`
        : ''
    }
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `receipt-${order.orderNumber}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

