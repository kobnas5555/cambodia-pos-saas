'use client';

import { useEffect, useState } from 'react';

const QUEUE_KEY = 'cambodia_pos_offline_orders';
const CATALOG_KEY = 'cambodia_pos_cached_catalog';
const CUSTOMERS_KEY = 'cambodia_pos_cached_customers';

export interface QueuedOfflineOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: string;
    unitPrice: string;
  }>;
  totalAmount: string;
  currency: string;
  paymentMethod: string;
  status: 'PENDING_SYNC' | 'SYNCED' | 'FAILED';
}

export function getOfflineOrderQueue(): QueuedOfflineOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineOrder(order: Omit<QueuedOfflineOrder, 'id' | 'createdAt' | 'status'>): QueuedOfflineOrder {
  const queue = getOfflineOrderQueue();
  const entry: QueuedOfflineOrder = {
    ...order,
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    status: 'PENDING_SYNC',
  };
  queue.push(entry);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return entry;
}

export function removeOfflineOrder(id: string) {
  const queue = getOfflineOrderQueue().filter((o) => o.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearOfflineOrderQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export function cacheCatalogProducts(products: any[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(products));
  } catch {
    // ignore quota
  }
}

export function getCachedCatalogProducts(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [queuedCount, setQueuedCount] = useState(0);

  useEffect(() => {
    function updateQueue() {
      setQueuedCount(getOfflineOrderQueue().length);
    }
    updateQueue();

    function handleOnline() {
      setIsOnline(true);
      updateQueue();
    }
    function handleOffline() {
      setIsOnline(false);
      updateQueue();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', updateQueue);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', updateQueue);
    };
  }, []);

  return { isOnline, queuedCount, refreshQueue: () => setQueuedCount(getOfflineOrderQueue().length) };
}

