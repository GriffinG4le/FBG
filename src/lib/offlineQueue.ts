'use client';

import { 
  fulfillOrderAction, 
  quickWalkUpFulfillAction, 
  logWarehouseStockInAction, 
  allocateStockTransferAction 
} from '../app/actions';

export type OfflineActionType = 'fulfill' | 'walkup' | 'stockin' | 'transfer';

export interface QueuedAction {
  id: string;
  type: OfflineActionType;
  payload: any;
  timestamp: string;
}

const STORAGE_KEY = 'fbg_offline_queue_v2';

// Get queued items from LocalStorage
export function getOfflineQueue(): QueuedAction[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error reading offline queue:', e);
    return [];
  }
}

// Save queue to LocalStorage
function saveOfflineQueue(queue: QueuedAction[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Error saving offline queue:', e);
  }
}

// Add action to offline queue
export function enqueueOfflineAction(type: OfflineActionType, payload: any): QueuedAction {
  const queue = getOfflineQueue();
  const newAction: QueuedAction = {
    id: 'tx-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now(),
    type,
    payload,
    timestamp: new Date().toISOString()
  };
  
  queue.push(newAction);
  saveOfflineQueue(queue);
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('fbg_queue_updated'));
  }
  
  return newAction;
}

// Clear entire offline queue
export function clearOfflineQueue() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('fbg_queue_updated'));
}

// Process and sync queue to server
export async function syncOfflineQueue(
  onProgress?: (index: number, total: number, success: boolean) => void
): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { success: true, syncedCount: 0, errors: [] };
  }

  const errors: string[] = [];
  let syncedCount = 0;
  
  const itemsToSync = [...queue];
  clearOfflineQueue();

  const failedItems: QueuedAction[] = [];

  for (let i = 0; i < itemsToSync.length; i++) {
    const item = itemsToSync[i];
    try {
      if (item.type === 'fulfill') {
        await fulfillOrderAction(item.payload);
      } else if (item.type === 'walkup') {
        await quickWalkUpFulfillAction(item.payload);
      } else if (item.type === 'stockin') {
        await logWarehouseStockInAction(
          item.payload.sku,
          item.payload.quantity,
          item.payload.locationId,
          item.payload.staffId,
          item.payload.notes
        );
      } else if (item.type === 'transfer') {
        await allocateStockTransferAction(
          item.payload.sku,
          item.payload.quantity,
          item.payload.fromLocationId,
          item.payload.toLocationId,
          item.payload.staffId,
          item.payload.notes
        );
      }
      syncedCount++;
      if (onProgress) onProgress(i + 1, itemsToSync.length, true);
    } catch (error) {
      console.error(`Failed to sync item ${item.id}:`, error);
      errors.push(`Action ${i + 1} (${item.type}): ${(error as Error).message}`);
      failedItems.push(item);
      if (onProgress) onProgress(i + 1, itemsToSync.length, false);
    }
  }

  if (failedItems.length > 0) {
    const currentQueue = getOfflineQueue();
    saveOfflineQueue([...failedItems, ...currentQueue]);
  }

  return {
    success: errors.length === 0,
    syncedCount,
    errors
  };
}
