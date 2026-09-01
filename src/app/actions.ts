'use strict';
'use server';

import {
  getLocations,
  getCatalog,
  getDerivedStockOnHand,
  getOrders,
  getFulfillments,
  getLedger,
  getOrderPrefixes,
  updateOrderPrefixLabel,
  logWarehouseStockIn,
  allocateStockTransfer,
  fulfillOrder,
  quickWalkUpFulfill,
  importTikoHubOrders,
  resetDatabase,
  Location,
  CatalogItem,
  Order,
  Fulfillment,
  LedgerRow,
  StockOnHandItem,
  OrderPrefix
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
  channel?: 'Event' | 'Card' | 'Manual';
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

export async function resetDatabaseAction(): Promise<void> {
  try {
    await resetDatabase();
  } catch (error) {
    console.error("Failed to reset database:", error);
    throw new Error("Failed to reset database.");
  }
}
