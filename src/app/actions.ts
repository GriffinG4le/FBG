'use strict';
'use server';

import {
  getLocations,
  createEventLocation,
  getCatalog,
  upsertCatalogItem,
  deleteCatalogItem,
  getDerivedStockOnHand,
  getOrders,
  getFulfillments,
  getLedger,
  getOrderPrefixes,
  updateOrderPrefixLabel,
  logWarehouseStockIn,
  logDynamicWarehouseStockIn,
  logBatchWarehouseStockIn,
  allocateStockTransfer,
  getEventTransfers,
  dispatchBatchToEvent,
  submitTentStaffReturnCount,
  verifyWarehouseReturnIntake,
  fulfillOrder,
  quickWalkUpFulfill,
  importTikoHubOrders,
  clearAllData,
  resetDatabase,
  Location,
  CatalogItem,
  Order,
  Fulfillment,
  LedgerRow,
  StockOnHandItem,
  OrderPrefix,
  EventStockTransfer
} from '../lib/db';
import { RawParsedOrder } from '../lib/csvParser';

export async function getLocationsAction(): Promise<Location[]> {
  try {
    return await getLocations();
  } catch (error) {
    console.error("Failed to get locations:", error);
    throw new Error("Failed to load locations.");
  }
}

export async function getOrderPrefixesAction(): Promise<OrderPrefix[]> {
  try {
    return await getOrderPrefixes();
  } catch (error) {
    console.error("Failed to get order prefixes:", error);
    throw new Error("Failed to load order prefixes.");
  }
}

export async function updateOrderPrefixLabelAction(prefix: string, label: string): Promise<void> {
  try {
    await updateOrderPrefixLabel(prefix, label);
  } catch (error) {
    console.error("Failed to update prefix label:", error);
    throw new Error("Failed to update prefix label.");
  }
}

export async function getCatalogAction(): Promise<CatalogItem[]> {
  try {
    return await getCatalog();
  } catch (error) {
    console.error("Failed to get catalog:", error);
    throw new Error("Failed to load catalog.");
  }
}

export async function upsertCatalogItemAction(item: CatalogItem): Promise<void> {
  try {
    await upsertCatalogItem(item);
  } catch (error) {
    console.error("Failed to upsert catalog item:", error);
    throw new Error("Failed to save catalog SKU.");
  }
}

export async function deleteCatalogItemAction(sku: string): Promise<void> {
  try {
    await deleteCatalogItem(sku);
  } catch (error) {
    console.error("Failed to delete catalog item:", error);
    throw new Error("Failed to delete catalog SKU.");
  }
}


export async function getDerivedStockOnHandAction(locationId?: string): Promise<StockOnHandItem[]> {
  try {
    return await getDerivedStockOnHand(locationId);
  } catch (error) {
    console.error("Failed to derive stock on hand:", error);
    throw new Error("Failed to compute stock on hand from ledger.");
  }
}

export async function getOrdersAction(search?: string): Promise<Order[]> {
  try {
    return await getOrders(search);
  } catch (error) {
    console.error("Failed to get orders:", error);
    throw new Error("Failed to load orders.");
  }
}

export async function getFulfillmentsAction(locationId?: string): Promise<Fulfillment[]> {
  try {
    return await getFulfillments(locationId);
  } catch (error) {
    console.error("Failed to get fulfillments:", error);
    throw new Error("Failed to load fulfillments.");
  }
}

export async function getLedgerAction(locationId?: string, type?: string): Promise<LedgerRow[]> {
  try {
    return await getLedger(locationId, type);
  } catch (error) {
    console.error("Failed to get ledger:", error);
    throw new Error("Failed to load ledger records.");
  }
}

export async function logWarehouseStockInAction(
  sku: string,
  quantity: number,
  locationId?: string,
  staffId?: string,
  notes?: string
): Promise<LedgerRow> {
  try {
    return await logWarehouseStockIn(sku, quantity, locationId, staffId, notes);
  } catch (error) {
    console.error("Failed to log warehouse stock-in:", error);
    throw new Error("Failed to record stock-in movement.");
  }
}

export async function logDynamicWarehouseStockInAction(params: {
  category: string;
  color: string;
  size: string;
  price: number;
  quantity: number;
  locationId?: string;
  staffId?: string;
  notes?: string;
}): Promise<LedgerRow> {
  try {
    return await logDynamicWarehouseStockIn(params);
  } catch (error) {
    console.error("Failed to log dynamic warehouse stock-in:", error);
    throw new Error("Failed to record dynamic stock-in.");
  }
}

export async function logBatchWarehouseStockInAction(params: {
  category: string;
  color: string;
  price: number;
  variants: { size: string; quantity: number }[];
  locationId?: string;
  staffId?: string;
  notes?: string;
}): Promise<LedgerRow[]> {
  try {
    return await logBatchWarehouseStockIn(params);
  } catch (error) {
    console.error("Failed to log batch warehouse stock-in:", error);
    throw new Error("Failed to record batch stock-in.");
  }
}


export async function createEventLocationAction(name: string, venue?: string): Promise<Location> {
  try {
    return await createEventLocation(name, venue);
  } catch (error) {
    console.error("Failed to create event location:", error);
    throw new Error("Failed to create event.");
  }
}

export async function getEventTransfersAction(eventId?: string): Promise<EventStockTransfer[]> {
  try {
    return await getEventTransfers(eventId);
  } catch (error) {
    console.error("Failed to get event transfers:", error);
    throw new Error("Failed to load event transfers.");
  }
}

export async function dispatchBatchToEventAction(
  eventId: string,
  items: { sku: string; quantity: number }[],
  staffId?: string,
  notes?: string
): Promise<EventStockTransfer[]> {
  try {
    return await dispatchBatchToEvent(eventId, items, staffId, notes);
  } catch (error) {
    console.error("Failed to dispatch batch to event:", error);
    throw new Error("Failed to allocate and dispatch stock to event.");
  }
}

export async function submitTentStaffReturnCountAction(
  eventId: string,
  counts: { sku: string; staffCount: number }[],
  staffId?: string,
  notes?: string
): Promise<EventStockTransfer[]> {
  try {
    return await submitTentStaffReturnCount(eventId, counts, staffId, notes);
  } catch (error) {
    console.error("Failed to submit tent return count:", error);
    throw new Error("Failed to record tent return count.");
  }
}

export async function verifyWarehouseReturnIntakeAction(
  eventId: string,
  verifiedCounts: { sku: string; whCount: number }[],
  whStaffId?: string,
  notes?: string
): Promise<EventStockTransfer[]> {
  try {
    return await verifyWarehouseReturnIntake(eventId, verifiedCounts, whStaffId, notes);
  } catch (error) {
    console.error("Failed to verify warehouse return intake:", error);
    throw new Error("Failed to verify warehouse return intake.");
  }
}

export async function allocateStockTransferAction(
  sku: string,
  quantity: number,
  fromLocationId: string,
  toLocationId: string,
  staffId?: string,
  notes?: string
): Promise<{ sourceRow: LedgerRow; destRow: LedgerRow }> {
  try {
    return await allocateStockTransfer(sku, quantity, fromLocationId, toLocationId, staffId, notes);
  } catch (error) {
    console.error("Failed to transfer stock:", error);
    throw new Error("Failed to record stock transfer.");
  }
}

export async function fulfillOrderAction(params: {
  orderId: string;
  sourcePrefix?: string;
  orderRef: string;
  originalSku: string;
  actualSku: string;
  priceDelta: number;
  cashCollected: number;
  overrideReason?: string | null;
  locationId: string;
  staffId: string;
  notes?: string | null;
}): Promise<{ fulfillment: Fulfillment; ledgerRow: LedgerRow }> {
  try {
    return await fulfillOrder(params);
  } catch (error) {
    console.error("Failed to fulfill order:", error);
    throw new Error("Failed to dispatch fulfillment.");
  }
}

export async function quickWalkUpFulfillAction(params: {
  sourcePrefix?: string;
  orderRef: string;
  originalSku: string;
  actualSku: string;
  amountPaid: number;
  cashCollected: number;
  overrideReason?: string | null;
  locationId: string;
  staffId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  channel?: 'Online' | 'Event' | 'Card' | 'Manual';
  notes?: string | null;
}): Promise<{ order: Order; fulfillment: Fulfillment; ledgerRow: LedgerRow }> {
  try {
    return await quickWalkUpFulfill(params);
  } catch (error) {
    console.error("Failed to quick fulfill walk-up:", error);
    throw new Error("Failed to log walk-up fulfillment.");
  }
}

export async function importTikoHubOrdersAction(
  rawOrders: RawParsedOrder[],
  staffId?: string
): Promise<{ inserted: number; duplicates: number; prefixesCreated: string[] }> {
  try {
    return await importTikoHubOrders(rawOrders, staffId);
  } catch (error) {
    console.error("Failed to import orders:", error);
    throw new Error("Failed to import TikoHub orders.");
  }
}

export async function clearAllDataAction(): Promise<void> {
  try {
    return await clearAllData();
  } catch (error) {
    console.error("Failed to clear database:", error);
    throw new Error("Failed to clear data.");
  }
}

export async function resetDatabaseAction(): Promise<void> {
  try {
    await resetDatabase();
  } catch (error) {
    console.error("Failed to reset database:", error);
    throw new Error("Failed to reset database.");
  }
}
