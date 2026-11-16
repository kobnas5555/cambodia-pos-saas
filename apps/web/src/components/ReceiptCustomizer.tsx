'use client';

import React, { useState } from 'react';
import type { EnhancedReceiptSettingsInput } from '@cambodia-pos/shared';

interface ReceiptCustomizerProps {
  initialSettings?: Partial<EnhancedReceiptSettingsInput>;
  onSave?: (settings: EnhancedReceiptSettingsInput) => Promise<void>;
  businessName?: string;
  phone?: string;
  address?: string;
}

export function ReceiptCustomizer({
  initialSettings,
  onSave,
  businessName = 'Phnom Penh Mart',
  phone = '+855 23 888 999',
  address = 'Building 42, St. 214, Daun Penh, Phnom Penh',
}: ReceiptCustomizerProps) {
  const [settings, setSettings] = useState<EnhancedReceiptSettingsInput>({
    paperWidth: initialSettings?.paperWidth ?? '80mm',
    fontSize: initialSettings?.fontSize ?? 'medium',
    showLogo: initialSettings?.showLogo ?? true,
    showTaxNumber: initialSettings?.showTaxNumber ?? true,
    showCashier: initialSettings?.showCashier ?? true,
    showCustomer: initialSettings?.showCustomer ?? true,
    showBarcode: initialSettings?.showBarcode ?? true,
    showCategory: initialSettings?.showCategory ?? false,
    showVatBreakdown: initialSettings?.showVatBreakdown ?? true,
    showSavings: initialSettings?.showSavings ?? true,
    customHeader: initialSettings?.customHeader ?? 'សូមស្វាគមន៍ / Welcome to our store',
    customFooter: initialSettings?.customFooter ?? 'ទំនិញដែលទិញរួចមិនអាចប្តូរយកប្រាក់វិញបានទេ / Goods sold are not refundable',
    returnPolicy: initialSettings?.returnPolicy ?? 'Return within 7 days with valid receipt.',
    wifiDetails: initialSettings?.wifiDetails ?? 'WiFi: MartGuest / Pass: mart2026',
    socialLink: initialSettings?.socialLink ?? 'fb.com/phnompenhmart',
  });

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleToggle = (key: keyof EnhancedReceiptSettingsInput) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(settings);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const is58mm = settings.paperWidth === '58mm';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Configuration Controls */}
      <div className="lg:col-span-7 space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-white mb-1">Receipt Format & Paper Profile</h3>
          <p className="text-sm text-slate-400 mb-6">Select your thermal receipt hardware profile and layout options.</p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, paperWidth: '80mm' }))}
              className={`p-4 rounded-lg border text-left transition-all ${
                settings.paperWidth === '80mm'
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-base mb-1">80mm Standard</div>
              <div className="text-xs text-slate-400">Desktop & counter thermal printers (Epson, Sunmi, Xprinter)</div>
            </button>

            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, paperWidth: '58mm' }))}
              className={`p-4 rounded-lg border text-left transition-all ${
                settings.paperWidth === '58mm'
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-base mb-1">58mm Compact</div>
              <div className="text-xs text-slate-400">Mobile handheld POS devices & Bluetooth belt printers</div>
            </button>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Visibility Toggles</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'showLogo', label: 'Show Business Logo' },
                { key: 'showTaxNumber', label: 'Show Tax ID (TIN)' },
                { key: 'showCashier', label: 'Show Cashier Name' },
                { key: 'showCustomer', label: 'Show Customer Info' },
                { key: 'showBarcode', label: 'Show Receipt Barcode' },
                { key: 'showCategory', label: 'Show Item Category' },
                { key: 'showVatBreakdown', label: 'Show VAT Breakdown' },
                { key: 'showSavings', label: 'Show Total Discount Savings' },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700"
                >
                  <span className="text-sm text-slate-300">{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(settings[key as keyof EnhancedReceiptSettingsInput])}
                    onChange={() => handleToggle(key as keyof EnhancedReceiptSettingsInput)}
                    className="w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Text Customizations */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-white mb-1">Custom Header & Footer Messages</h3>
          <p className="text-sm text-slate-400 mb-4">Support for Khmer Unicode and English typography.</p>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Custom Header Banner</label>
            <input
              type="text"
              value={settings.customHeader ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, customHeader: e.target.value }))}
              placeholder="e.g. សូមស្វាគមន៍ / Welcome to our store"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Footer Message</label>
            <textarea
              rows={2}
              value={settings.customFooter ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, customFooter: e.target.value }))}
              placeholder="e.g. សូមអរគុណដែលបានជួយគាំទ្រ / Thank you for shopping with us"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">WiFi Network / Password</label>
              <input
                type="text"
                value={settings.wifiDetails ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, wifiDetails: e.target.value }))}
                placeholder="WiFi: ShopName / Pass: 12345678"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Facebook / Social Link</label>
              <input
                type="text"
                value={settings.socialLink ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, socialLink: e.target.value }))}
                placeholder="fb.com/myshop"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <span className="text-xs text-green-400 font-medium">
              {savedSuccess ? 'Settings saved successfully!' : ''}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-all"
            >
              {saving ? 'Saving...' : 'Save Receipt Design'}
            </button>
          </div>
        </div>
      </div>

      {/* Live Thermal Paper Preview */}
      <div className="lg:col-span-5 flex flex-col items-center">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Live Thermal Preview ({settings.paperWidth})
        </div>

        {/* Paper Container */}
        <div
          className={`bg-white text-black font-mono shadow-2xl rounded-sm p-4 text-xs transition-all duration-300 border-t-8 border-slate-400 ${
            is58mm ? 'w-64 text-[10px]' : 'w-80 text-[11px]'
          }`}
          style={{ minHeight: '520px' }}
        >
          {/* Header */}
          <div className="text-center space-y-1 mb-3">
            {settings.showLogo && (
              <div className="w-10 h-10 mx-auto rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700">
                POS
              </div>
            )}
            <div className="font-extrabold text-sm uppercase tracking-wide">{businessName}</div>
            <div className="text-[10px] text-slate-600">{address}</div>
            <div className="text-[10px] text-slate-600">Tel: {phone}</div>
            {settings.showTaxNumber && (
              <div className="text-[10px] text-slate-700">VAT TIN: K002-90234123</div>
            )}
            {settings.customHeader && (
              <div className="text-[10px] italic border-t border-b border-dashed border-slate-300 py-1 my-1">
                {settings.customHeader}
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="border-b border-dashed border-slate-300 pb-2 mb-2 text-[10px] space-y-0.5">
            <div className="flex justify-between">
              <span>Receipt: #INV-2026-0042</span>
              <span>13-Nov-2026</span>
            </div>
            {settings.showCashier && (
              <div className="flex justify-between">
                <span>Cashier: Sokha S.</span>
                <span>Branch: Main Store</span>
              </div>
            )}
            {settings.showCustomer && (
              <div className="flex justify-between">
                <span>Customer: Chhun C.</span>
                <span>VIP (012 888 999)</span>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="border-b border-dashed border-slate-300 pb-2 mb-2">
            <div className="flex justify-between font-bold border-b border-slate-200 pb-1 mb-1">
              <span>Item</span>
              <span>Qty x Price</span>
              <span>Total</span>
            </div>

            <div className="space-y-1">
              <div>
                <div className="font-semibold">Angkor Beer Can 330ml</div>
                {settings.showCategory && <div className="text-[9px] text-slate-500">Beverages</div>}
                <div className="flex justify-between text-slate-600">
                  <span>2 x $1.25</span>
                  <span className="font-bold text-black">$2.50</span>
                </div>
              </div>

              <div>
                <div className="font-semibold">Arabica Coffee Beans 250g</div>
                {settings.showCategory && <div className="text-[9px] text-slate-500">Grocery</div>}
                <div className="flex justify-between text-slate-600">
                  <span>1 x $4.50</span>
                  <span className="font-bold text-black">$4.50</span>
                </div>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="space-y-1 mb-3">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>$7.00</span>
            </div>
            {settings.showSavings && (
              <div className="flex justify-between text-slate-600">
                <span>Discount (10%):</span>
                <span>-$0.70</span>
              </div>
            )}
            {settings.showVatBreakdown && (
              <div className="flex justify-between text-slate-600">
                <span>VAT (10%):</span>
                <span>$0.63</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-sm border-t border-slate-300 pt-1">
              <span>Total USD:</span>
              <span>$6.93</span>
            </div>
            <div className="flex justify-between font-bold text-slate-700">
              <span>Total KHR:</span>
              <span>28,400 ៛</span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
              <span>Paid (Bakong KHQR):</span>
              <span>$6.93</span>
            </div>
          </div>

          {/* Footer Details */}
          <div className="text-center space-y-1 pt-2 border-t border-dashed border-slate-300 text-[10px]">
            {settings.customFooter && <div>{settings.customFooter}</div>}
            {settings.wifiDetails && <div className="font-semibold">{settings.wifiDetails}</div>}
            {settings.socialLink && <div className="text-slate-600">{settings.socialLink}</div>}
            {settings.showBarcode && (
              <div className="pt-2">
                <div className="inline-block px-4 py-1 bg-slate-100 border border-slate-200 text-center font-bold tracking-widest text-[9px]">
                  ||| | ||||| || |||| |||
                </div>
                <div className="text-[9px] text-slate-400">INV-2026-0042</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

