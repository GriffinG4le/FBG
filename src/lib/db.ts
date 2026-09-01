import { supabase } from './supabaseClient';
import { RawParsedOrder } from './csvParser';

// ==============================================================================
// Type Definitions
// ==============================================================================

export interface Location {
  id: string;
  name: string;
  type: 'warehouse' | 'event';
  status: 'active' | 'archived';
  created_at: string;
}

export interface OrderPrefix {
  prefix: string;
  label: string;
  active: boolean;
  created_at: string;
}

export interface CatalogItem {
  sku: string;
  category: string;
  color: string | null;
  size: string | null;
  price: number;
  low_stock_threshold: number;
}

export interface Order {
  id: string;
  source_prefix: string; // e.g. ORD, SH, TKH, MANUAL
  order_ref: string;     // Truncated order ID (e.g. 04CA7, JW6FU)
  original_sku: string;
  amount_paid: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  channel: 'Online' | 'Event' | 'Card' | 'Manual';
  status: 'pending' | 'fulfilled' | 'cancelled';
  created_at: string;
}

export interface Fulfillment {
  id: string;
  order_id: string;
  source_prefix: string;
  order_ref: string;
  original_sku: string;
  actual_sku: string;
  price_delta: number;
  cash_collected: number;
  override_reason?: string | null;
  location_id: string;
  staff_id: string;
  notes?: string | null;
  fulfilled_at: string;
}

export interface LedgerRow {
  id: string;
  timestamp: string;
  type: 'StockIn' | 'Transfer' | 'Dispatch' | 'Swap' | 'Correction';
  sku: string;
  quantity_delta: number;
  location_id: string;
  staff_id: string;
  order_id?: string | null;
  fulfillment_id?: string | null;
  amount: number;
  notes?: string | null;
}

export interface StockOnHandItem {
  location_id: string;
  location_name: string;
  location_type: 'warehouse' | 'event';
  sku: string;
  category: string;
  color: string | null;
  size: string | null;
  price: number;
  low_stock_threshold: number;
  stock_on_hand: number;
}

export interface StaffProfile {
  id: string;
  name: string;
  role: 'admin' | 'warehouse' | 'event_staff';
  assigned_location_ids: string[];
}

// Initial Standard Mock State for Fallback / Seeding
const INITIAL_LOCATIONS: Location[] = [
  { id: 'wh-main', name: 'Main Warehouse (Nairobi HQ)', type: 'warehouse', status: 'active', created_at: new Date().toISOString() },
  { id: 'evt-sp7s', name: 'SportPesa 7s (RFUEA Ground)', type: 'event', status: 'active', created_at: new Date().toISOString() },
  { id: 'evt-driftwood', name: 'Driftwood 7s (Mombasa MSC)', type: 'event', status: 'active', created_at: new Date().toISOString() }
];

const INITIAL_PREFIXES: OrderPrefix[] = [
  { prefix: 'ORD', label: 'TikoHub Direct Web Store', active: true, created_at: new Date().toISOString() },
  { prefix: 'SH', label: 'Shopify Secondary Channel', active: true, created_at: new Date().toISOString() },
  { prefix: 'TKH', label: 'TikoHub Mobile / POS', active: true, created_at: new Date().toISOString() },
  { prefix: 'MANUAL', 'label': 'Tent Walk-Up Direct Entry', active: true, created_at: new Date().toISOString() }
];

const INITIAL_CATALOG: CatalogItem[] = [
  { sku: 'Fan Jersey|White|XS', category: 'Fan Jersey', color: 'White', size: 'XS', price: 2500, low_stock_threshold: 5 },
  { sku: 'Fan Jersey|White|S', category: 'Fan Jersey', color: 'White', size: 'S', price: 2500, low_stock_threshold: 10 },
  { sku: 'Fan Jersey|White|M', category: 'Fan Jersey', color: 'White', size: 'M', price: 2500, low_stock_threshold: 15 },
  { sku: 'Fan Jersey|White|L', category: 'Fan Jersey', color: 'White', size: 'L', price: 2500, low_stock_threshold: 20 },
  { sku: 'Fan Jersey|White|XL', category: 'Fan Jersey', color: 'White', size: 'XL', price: 2500, low_stock_threshold: 20 },
  { sku: 'Fan Jersey|White|2XL', category: 'Fan Jersey', color: 'White', size: '2XL', price: 2500, low_stock_threshold: 10 },
  { sku: 'Fan Jersey|White|3XL', category: 'Fan Jersey', color: 'White', size: '3XL', price: 2500, low_stock_threshold: 5 },
  { sku: 'Fan Jersey|White|4XL', category: 'Fan Jersey', color: 'White', size: '4XL', price: 2500, low_stock_threshold: 3 },
  { sku: 'Fan Jersey|White|5XL', category: 'Fan Jersey', color: 'White', size: '5XL', price: 2500, low_stock_threshold: 2 },
  { sku: 'Fan Jersey|Red|XS', category: 'Fan Jersey', color: 'Red', size: 'XS', price: 2500, low_stock_threshold: 5 },
  { sku: 'Fan Jersey|Red|S', category: 'Fan Jersey', color: 'Red', size: 'S', price: 2500, low_stock_threshold: 10 },
  { sku: 'Fan Jersey|Red|M', category: 'Fan Jersey', color: 'Red', size: 'M', price: 2500, low_stock_threshold: 15 },
  { sku: 'Fan Jersey|Red|L', category: 'Fan Jersey', color: 'Red', size: 'L', price: 2500, low_stock_threshold: 15 },
  { sku: 'Fan Jersey|Red|XL', category: 'Fan Jersey', color: 'Red', size: 'XL', price: 2500, low_stock_threshold: 10 },
  { sku: 'Fan Jersey|Red|2XL', category: 'Fan Jersey', color: 'Red', size: '2XL', price: 2500, low_stock_threshold: 10 },
  { sku: 'Fan Jersey|Red|3XL', category: 'Fan Jersey', color: 'Red', size: '3XL', price: 2500, low_stock_threshold: 5 },
  { sku: 'Fan Jersey|Red|4XL', category: 'Fan Jersey', color: 'Red', size: '4XL', price: 2500, low_stock_threshold: 2 },
  { sku: 'Fan Jersey|Red|5XL', category: 'Fan Jersey', color: 'Red', size: '5XL', price: 2500, low_stock_threshold: 2 },
  { sku: 'Crew Neck|Navy|S', category: 'Crew Neck', color: 'Navy', size: 'S', price: 2250, low_stock_threshold: 8 },
  { sku: 'Crew Neck|Navy|M', category: 'Crew Neck', color: 'Navy', size: 'M', price: 2250, low_stock_threshold: 10 },
  { sku: 'Crew Neck|Navy|L', category: 'Crew Neck', color: 'Navy', size: 'L', price: 2250, low_stock_threshold: 10 },
  { sku: 'Crew Neck|Navy|XL', category: 'Crew Neck', color: 'Navy', size: 'XL', price: 2250, low_stock_threshold: 8 },
  { sku: 'KRU Replica|Green|S', category: 'KRU Replica', color: 'Green', size: 'S', price: 3000, low_stock_threshold: 5 },
  { sku: 'KRU Replica|Green|M', category: 'KRU Replica', color: 'Green', size: 'M', price: 3000, low_stock_threshold: 8 },
  { sku: 'KRU Replica|Green|L', category: 'KRU Replica', color: 'Green', size: 'L', price: 3000, low_stock_threshold: 8 },
  { sku: 'KRU Replica|Green|XL', category: 'KRU Replica', color: 'Green', size: 'XL', price: 3000, low_stock_threshold: 5 }
];

const INITIAL_LEDGER: LedgerRow[] = [
  // SportPesa 7s Initial Received Allocation (974 units total received from warehouse/supplier)
  { id: 'led-sp-01', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|White|XS', quantity_delta: 20, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-02', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|Red|XS', quantity_delta: 20, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-03', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|White|S', quantity_delta: 31, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-04', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|Red|S', quantity_delta: 10, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-05', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|White|M', quantity_delta: 62, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-06', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|Red|M', quantity_delta: 54, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-07', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|White|L', quantity_delta: 197, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-08', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|Red|L', quantity_delta: 121, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-09', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|White|XL', quantity_delta: 246, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-10', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|Red|XL', quantity_delta: 53, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-11', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|White|2XL', quantity_delta: 47, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-12', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|Red|2XL', quantity_delta: 43, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-13', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|White|3XL', quantity_delta: 33, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-14', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|Red|3XL', quantity_delta: 27, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },
  { id: 'led-sp-15', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), type: 'StockIn', sku: 'Fan Jersey|White|4XL', quantity_delta: 10, location_id: 'evt-sp7s', staff_id: 'Winston (Admin)', amount: 0, notes: 'SportPesa 7s Received Stock' },

  // Initial Delivered Stock (461 units delivered total)
  { id: 'led-sp-d01', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|White|XS', quantity_delta: -11, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 27500, notes: 'Event Dispatch' },
  { id: 'led-sp-d02', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|Red|XS', quantity_delta: -8, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 20000, notes: 'Event Dispatch' },
  { id: 'led-sp-d03', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|White|S', quantity_delta: -24, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 60000, notes: 'Event Dispatch' },
  { id: 'led-sp-d04', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|Red|S', quantity_delta: -8, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 20000, notes: 'Event Dispatch' },
  { id: 'led-sp-d05', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|White|M', quantity_delta: -47, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 117500, notes: 'Event Dispatch' },
  { id: 'led-sp-d06', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|Red|M', quantity_delta: -39, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 97500, notes: 'Event Dispatch' },
  { id: 'led-sp-d07', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|White|L', quantity_delta: -84, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 210000, notes: 'Event Dispatch' },
  { id: 'led-sp-d08', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|Red|L', quantity_delta: -62, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 155000, notes: 'Event Dispatch' },
  { id: 'led-sp-d09', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|White|XL', quantity_delta: -63, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 157500, notes: 'Event Dispatch' },
  { id: 'led-sp-d10', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|Red|XL', quantity_delta: -49, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 122500, notes: 'Event Dispatch' },
  { id: 'led-sp-d11', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|White|2XL', quantity_delta: -23, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 57500, notes: 'Event Dispatch' },
  { id: 'led-sp-d12', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|Red|2XL', quantity_delta: -16, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 40000, notes: 'Event Dispatch' },
  { id: 'led-sp-d13', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|White|3XL', quantity_delta: -11, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 27500, notes: 'Event Dispatch' },
  { id: 'led-sp-d14', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|Red|3XL', quantity_delta: -12, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 30000, notes: 'Event Dispatch' },
  { id: 'led-sp-d15', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'Dispatch', sku: 'Fan Jersey|White|4XL', quantity_delta: -4, location_id: 'evt-sp7s', staff_id: 'Staff', amount: 10000, notes: 'Event Dispatch' },

  // Warehouse standard stock
  { id: 'led-wh-01', timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), type: 'StockIn', sku: 'Crew Neck|Navy|L', quantity_delta: 50, location_id: 'wh-main', staff_id: 'Sarah (Warehouse)', amount: 0, notes: 'Warehouse stock' },
  { id: 'led-wh-02', timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), type: 'StockIn', sku: 'KRU Replica|Green|L', quantity_delta: 40, location_id: 'wh-main', staff_id: 'Sarah (Warehouse)', amount: 0, notes: 'Warehouse stock' }
];

const INITIAL_ORDERS: Order[] = [
  // 6 pending uncollected orders from the Google Sheet
  { id: 'ord-p01', source_prefix: 'ORD', order_ref: '04CA7', original_sku: 'Fan Jersey|White|M', amount_paid: 2500, customer_name: 'Kevin Omondi', channel: 'Online', status: 'pending', created_at: new Date(Date.now() - 3600000 * 8).toISOString() },
  { id: 'ord-p02', source_prefix: 'ORD', order_ref: '9B3D1', original_sku: 'Fan Jersey|White|L', amount_paid: 2500, customer_name: 'Faith Mutua', channel: 'Online', status: 'pending', created_at: new Date(Date.now() - 3600000 * 7).toISOString() },
  { id: 'ord-p03', source_prefix: 'ORD', order_ref: '8E4C2', original_sku: 'Fan Jersey|White|L', amount_paid: 2500, customer_name: 'Alex Otieno', channel: 'Online', status: 'pending', created_at: new Date(Date.now() - 3600000 * 6).toISOString() },
  { id: 'ord-p04', source_prefix: 'ORD', order_ref: '1F7A9', original_sku: 'Fan Jersey|White|L', amount_paid: 2500, customer_name: 'Grace Wanjiku', channel: 'Online', status: 'pending', created_at: new Date(Date.now() - 3600000 * 5).toISOString() },
  { id: 'ord-p05', source_prefix: 'ORD', order_ref: '3D2C8', original_sku: 'Fan Jersey|Red|2XL', amount_paid: 2500, customer_name: 'David Mwangi', channel: 'Online', status: 'pending', created_at: new Date(Date.now() - 3600000 * 4).toISOString() },
  { id: 'ord-p06', source_prefix: 'ORD', order_ref: '7A1E4', original_sku: 'Fan Jersey|White|5XL', amount_paid: 2500, customer_name: 'Peter Koech', channel: 'Online', status: 'pending', created_at: new Date(Date.now() - 3600000 * 3).toISOString() },

  // Sample fulfilled orders
  { id: 'ord-f01', source_prefix: 'ORD', order_ref: 'JW6FU', original_sku: 'Fan Jersey|White|L', amount_paid: 2500, customer_name: 'Brian Kiprop', channel: 'Online', status: 'fulfilled', created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'ord-f02', source_prefix: 'SH', order_ref: '5H9K2', original_sku: 'Fan Jersey|Red|M', amount_paid: 2500, customer_name: 'Mary Achieng', channel: 'Card', status: 'fulfilled', created_at: new Date(Date.now() - 86400000).toISOString() }
];

// In-memory persistent fallback state when running locally / disconnected
let memoryLocations = [...INITIAL_LOCATIONS];
let memoryPrefixes = [...INITIAL_PREFIXES];
let memoryCatalog = [...INITIAL_CATALOG];
let memoryOrders = [...INITIAL_ORDERS];
let memoryFulfillments: Fulfillment[] = [
  { id: 'ful-f01', order_id: 'ord-f01', source_prefix: 'ORD', order_ref: 'JW6FU', original_sku: 'Fan Jersey|White|L', actual_sku: 'Fan Jersey|White|L', price_delta: 0, cash_collected: 0, location_id: 'evt-sp7s', staff_id: 'Staff', fulfilled_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'ful-f02', order_id: 'ord-f02', source_prefix: 'SH', order_ref: '5H9K2', original_sku: 'Fan Jersey|Red|M', actual_sku: 'Fan Jersey|Red|M', price_delta: 0, cash_collected: 0, location_id: 'evt-sp7s', staff_id: 'Staff', fulfilled_at: new Date(Date.now() - 86400000).toISOString() }
];
let memoryLedger = [...INITIAL_LEDGER];

// Helper to ensure SKU exists in catalog
async function ensureSkuExists(sku: string, price: number = 0) {
  try {
    const { data } = await supabase.from('catalog').select('sku').eq('sku', sku).maybeSingle();
    if (!data) {
      const parts = sku.split('|');
      const category = parts[0] || 'Unknown';
      const color = parts[1] || null;
      const size = parts[2] || null;
      await supabase.from('catalog').insert({
        sku,
        category,
        color,
        size,
        price,
        low_stock_threshold: 10
      });
    }
  } catch {
    if (!memoryCatalog.some(c => c.sku === sku)) {
      const parts = sku.split('|');
      memoryCatalog.push({
        sku,
        category: parts[0] || 'Unknown',
        color: parts[1] || null,
        size: parts[2] || null,
        price,
        low_stock_threshold: 10
      });
    }
  }
}

// ==============================================================================
// Order Prefixes API (Config, not Code)
// ==============================================================================

export async function getOrderPrefixes(): Promise<OrderPrefix[]> {
  try {
    const { data, error } = await supabase.from('order_prefixes').select('*').order('prefix', { ascending: true });
    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (e) {
    console.warn("Supabase fetch failed for order_prefixes, using memory cache:", e);
  }
  return memoryPrefixes;
}

export async function updateOrderPrefixLabel(prefix: string, label: string): Promise<void> {
  try {
    await supabase.from('order_prefixes').update({ label }).eq('prefix', prefix);
  } catch (e) {
    console.warn("Supabase prefix update failed, updating memory store:", e);
  }
  const item = memoryPrefixes.find(p => p.prefix === prefix);
  if (item) item.label = label;
}

// ==============================================================================
// Locations API
// ==============================================================================

export async function getLocations(): Promise<Location[]> {
  try {
    const { data, error } = await supabase.from('locations').select('*').order('created_at', { ascending: true });
    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (e) {
    console.warn("Supabase fetch failed for locations, using memory cache:", e);
  }
  return memoryLocations;
}

// ==============================================================================
// Catalog API
// ==============================================================================

export async function getCatalog(): Promise<CatalogItem[]> {
  try {
    const { data, error } = await supabase.from('catalog').select('*').order('category', { ascending: true });
    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (e) {
    console.warn("Supabase fetch failed for catalog, using memory cache:", e);
  }
  return memoryCatalog;
}

export async function upsertCatalogItem(item: CatalogItem): Promise<void> {
  try {
    await supabase.from('catalog').upsert({
      sku: item.sku,
      category: item.category,
      color: item.color,
      size: item.size,
      price: item.price,
      low_stock_threshold: item.low_stock_threshold
    });
  } catch (e) {
    console.warn("Supabase catalog upsert failed, updating memory store:", e);
  }
  const idx = memoryCatalog.findIndex(c => c.sku === item.sku);
  if (idx !== -1) {
    memoryCatalog[idx] = item;
  } else {
    memoryCatalog.push(item);
  }
}

export async function deleteCatalogItem(sku: string): Promise<void> {
  try {
    await supabase.from('catalog').delete().eq('sku', sku);
  } catch (e) {
    console.warn("Supabase catalog delete failed, updating memory store:", e);
  }
  memoryCatalog = memoryCatalog.filter(c => c.sku !== sku);
}

// ==============================================================================
// Derived Stock on Hand
// ==============================================================================

export async function getDerivedStockOnHand(locationId?: string): Promise<StockOnHandItem[]> {
  const [locations, catalog, ledger] = await Promise.all([
    getLocations(),
    getCatalog(),
    getLedger()
  ]);

  const targetLocations = locationId
    ? locations.filter(l => l.id === locationId)
    : locations;

  const result: StockOnHandItem[] = [];

  for (const loc of targetLocations) {
    for (const cat of catalog) {
      const movements = ledger.filter(r => r.location_id === loc.id && r.sku === cat.sku);
      const stockOnHand = movements.reduce((sum, r) => sum + Number(r.quantity_delta || 0), 0);

      result.push({
        location_id: loc.id,
        location_name: loc.name,
        location_type: loc.type,
        sku: cat.sku,
        category: cat.category,
        color: cat.color,
        size: cat.size,
        price: Number(cat.price),
        low_stock_threshold: cat.low_stock_threshold || 10,
        stock_on_hand: stockOnHand
      });
    }
  }

  return result;
}

// ==============================================================================
// Orders API
// ==============================================================================

export async function getOrders(search?: string): Promise<Order[]> {
  let orders: Order[] = [];
  try {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (!error && data && data.length > 0) {
      orders = data;
    } else {
      orders = memoryOrders;
    }
  } catch {
    orders = memoryOrders;
  }

  if (search && search.trim().length > 0) {
    const q = search.trim().toLowerCase();
    return orders.filter(o =>
      o.order_ref.toLowerCase().includes(q) ||
      `${o.source_prefix}-${o.order_ref}`.toLowerCase().includes(q) ||
      o.original_sku.toLowerCase().includes(q) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
      (o.customer_phone && o.customer_phone.toLowerCase().includes(q))
    );
  }

  return orders;
}

// ==============================================================================
// Fulfillments API
// ==============================================================================

export async function getFulfillments(locationId?: string): Promise<Fulfillment[]> {
  try {
    let query = supabase.from('fulfillments').select('*').order('fulfilled_at', { ascending: false });
    if (locationId) {
      query = query.eq('location_id', locationId);
    }
    const { data, error } = await query;
    if (!error && data) {
      return data;
    }
  } catch (e) {
    console.warn("Supabase fetch failed for fulfillments, using memory cache:", e);
  }

  if (locationId) {
    return memoryFulfillments.filter(f => f.location_id === locationId);
  }
  return memoryFulfillments;
}

// ==============================================================================
// Ledger API (Append-Only)
// ==============================================================================

export async function getLedger(locationId?: string, type?: string): Promise<LedgerRow[]> {
  try {
    let query = supabase.from('ledger').select('*').order('timestamp', { ascending: false });
    if (locationId) {
      query = query.eq('location_id', locationId);
    }
    if (type) {
      query = query.eq('type', type);
    }
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (e) {
    console.warn("Supabase fetch failed for ledger, using memory cache:", e);
  }

  let result = memoryLedger;
  if (locationId) {
    result = result.filter(r => r.location_id === locationId);
  }
  if (type) {
    result = result.filter(r => r.type === type);
  }
  return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ==============================================================================
// Operational Mutation Functions
// ==============================================================================

export async function logWarehouseStockIn(
  sku: string,
  quantity: number,
  locationId: string = 'wh-main',
  staffId: string = 'Sarah (Warehouse)',
  notes?: string
): Promise<LedgerRow> {
  if (quantity <= 0) throw new Error('Quantity must be greater than 0');
  await ensureSkuExists(sku);

  const newRow: Omit<LedgerRow, 'id' | 'timestamp'> = {
    type: 'StockIn',
    sku,
    quantity_delta: quantity,
    location_id: locationId,
    staff_id: staffId,
    amount: 0,
    notes: notes || 'Warehouse stock intake'
  };

  try {
    const { data, error } = await supabase.from('ledger').insert(newRow).select().single();
    if (!error && data) {
      memoryLedger.unshift(data);
      return data;
    }
  } catch (e) {
    console.warn("Supabase write failed, writing to memory store:", e);
  }

  const created: LedgerRow = {
    ...newRow,
    id: 'led-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString()
  };
  memoryLedger.unshift(created);
  return created;
}

export async function logDynamicWarehouseStockIn(params: {
  category: string;
  color: string;
  size: string;
  price: number;
  quantity: number;
  locationId?: string;
  staffId?: string;
  notes?: string;
}): Promise<LedgerRow> {
  const cleanCategory = params.category.trim();
  const cleanColor = params.color.trim() || 'Standard';
  const cleanSize = params.size.trim() || 'One Size';
  const sku = `${cleanCategory}|${cleanColor}|${cleanSize}`;

  await ensureSkuExists(sku, params.price);
  return await logWarehouseStockIn(
    sku,
    params.quantity,
    params.locationId || 'wh-main',
    params.staffId || 'Warehouse Staff',
    params.notes || `Stock intake for ${cleanCategory} (${cleanColor} / ${cleanSize})`
  );
}

export async function logBatchWarehouseStockIn(params: {
  category: string;
  color: string;
  price: number;
  variants: { size: string; quantity: number }[];
  locationId?: string;
  staffId?: string;
  notes?: string;
}): Promise<LedgerRow[]> {
  const results: LedgerRow[] = [];
  const cleanCategory = params.category.trim();
  const cleanColor = params.color.trim() || 'Standard';

  for (const v of params.variants) {
    if (v.quantity > 0) {
      const cleanSize = v.size.trim() || 'One Size';
      const sku = `${cleanCategory}|${cleanColor}|${cleanSize}`;
      await ensureSkuExists(sku, params.price);

      const row = await logWarehouseStockIn(
        sku,
        v.quantity,
        params.locationId || 'wh-main',
        params.staffId || 'Warehouse Staff',
        params.notes || `Batch intake for ${cleanCategory} (${cleanColor} / ${cleanSize})`
      );
      results.push(row);
    }
  }

  return results;
}


export async function allocateStockTransfer(
  sku: string,
  quantity: number,
  fromLocationId: string = 'wh-main',
  toLocationId: string,
  staffId: string = 'Winston (Admin)',
  notes?: string
): Promise<{ sourceRow: LedgerRow; destRow: LedgerRow }> {
  if (quantity <= 0) throw new Error('Transfer quantity must be greater than 0');
  if (fromLocationId === toLocationId) throw new Error('Source and destination locations cannot be identical');

  await ensureSkuExists(sku);

  const transferNote = notes || `Stock transfer from ${fromLocationId} to ${toLocationId}`;

  const sourcePayload: Omit<LedgerRow, 'id' | 'timestamp'> = {
    type: 'Transfer',
    sku,
    quantity_delta: -quantity,
    location_id: fromLocationId,
    staff_id: staffId,
    amount: 0,
    notes: transferNote
  };

  const destPayload: Omit<LedgerRow, 'id' | 'timestamp'> = {
    type: 'Transfer',
    sku,
    quantity_delta: quantity,
    location_id: toLocationId,
    staff_id: staffId,
    amount: 0,
    notes: transferNote
  };

  try {
    const { data: sourceData, error: err1 } = await supabase.from('ledger').insert(sourcePayload).select().single();
    const { data: destData, error: err2 } = await supabase.from('ledger').insert(destPayload).select().single();

    if (!err1 && !err2 && sourceData && destData) {
      memoryLedger.unshift(sourceData, destData);
      return { sourceRow: sourceData, destRow: destData };
    }
  } catch (e) {
    console.warn("Supabase transfer write failed, using memory store:", e);
  }

  const sRow: LedgerRow = {
    ...sourcePayload,
    id: 'led-s-' + Date.now(),
    timestamp: new Date().toISOString()
  };
  const dRow: LedgerRow = {
    ...destPayload,
    id: 'led-d-' + (Date.now() + 1),
    timestamp: new Date().toISOString()
  };

  memoryLedger.unshift(sRow, dRow);
  return { sourceRow: sRow, destRow: dRow };
}

export async function fulfillOrder(params: {
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
  const {
    orderId,
    sourcePrefix = 'ORD',
    orderRef,
    originalSku,
    actualSku,
    priceDelta,
    cashCollected,
    overrideReason,
    locationId,
    staffId,
    notes
  } = params;

  await ensureSkuExists(actualSku);

  const isSwap = originalSku !== actualSku;
  const eventType: 'Dispatch' | 'Swap' = isSwap ? 'Swap' : 'Dispatch';

  const fulfillmentPayload = {
    order_id: orderId,
    source_prefix: sourcePrefix,
    order_ref: orderRef,
    original_sku: originalSku,
    actual_sku: actualSku,
    price_delta: priceDelta,
    cash_collected: cashCollected,
    override_reason: overrideReason || null,
    location_id: locationId,
    staff_id: staffId,
    notes: notes || null
  };

  let createdFulfillment: Fulfillment;

  try {
    const { data: fulData, error: fulErr } = await supabase
      .from('fulfillments')
      .insert(fulfillmentPayload)
      .select()
      .single();

    if (!fulErr && fulData) {
      createdFulfillment = fulData;
      await supabase.from('orders').update({ status: 'fulfilled' }).eq('id', orderId);
    } else {
      throw new Error(fulErr?.message || 'Fulfillment insert failed');
    }
  } catch {
    createdFulfillment = {
      ...fulfillmentPayload,
      id: 'ful-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      fulfilled_at: new Date().toISOString()
    };
    const ordIndex = memoryOrders.findIndex(o => o.id === orderId);
    if (ordIndex !== -1) {
      memoryOrders[ordIndex].status = 'fulfilled';
    }
  }

  memoryFulfillments.unshift(createdFulfillment);

  const ledgerPayload: Omit<LedgerRow, 'id' | 'timestamp'> = {
    type: eventType,
    sku: actualSku,
    quantity_delta: -1,
    location_id: locationId,
    staff_id: staffId,
    order_id: orderId,
    fulfillment_id: createdFulfillment.id,
    amount: cashCollected,
    notes: isSwap
      ? `Swapped from ${originalSku} to ${actualSku}${overrideReason ? ` (${overrideReason})` : ''}`
      : 'Standard order dispatch'
  };

  let createdLedgerRow: LedgerRow;

  try {
    const { data: ledData, error: ledErr } = await supabase
      .from('ledger')
      .insert(ledgerPayload)
      .select()
      .single();

    if (!ledErr && ledData) {
      createdLedgerRow = ledData;
    } else {
      throw new Error(ledErr?.message || 'Ledger write failed');
    }
  } catch {
    createdLedgerRow = {
      ...ledgerPayload,
      id: 'led-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString()
    };
  }

  memoryLedger.unshift(createdLedgerRow);

  return {
    fulfillment: createdFulfillment,
    ledgerRow: createdLedgerRow
  };
}

export async function quickWalkUpFulfill(params: {
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
  await ensureSkuExists(params.originalSku);
  await ensureSkuExists(params.actualSku);

  const sourcePrefix = params.sourcePrefix || 'MANUAL';
  const cleanRef = params.orderRef.toUpperCase().trim();

  let matchedOrder: Order | null = null;

  try {
    const { data: existing } = await supabase
      .from('orders')
      .select('*')
      .eq('order_ref', cleanRef)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      matchedOrder = existing;
    }
  } catch {
    const memFound = memoryOrders.find(o => o.order_ref === cleanRef && o.status === 'pending');
    if (memFound) matchedOrder = memFound;
  }

  let finalOrder: Order;

  if (!matchedOrder) {
    const orderPayload = {
      source_prefix: sourcePrefix,
      order_ref: cleanRef,
      original_sku: params.originalSku,
      amount_paid: params.amountPaid,
      customer_name: params.customerName || null,
      customer_phone: params.customerPhone || null,
      channel: params.channel || 'Event',
      status: 'pending' as const
    };

    try {
      const { data, error } = await supabase.from('orders').insert(orderPayload).select().single();
      if (!error && data) {
        finalOrder = data;
      } else {
        throw new Error(error?.message || 'Order insert failed');
      }
    } catch {
      finalOrder = {
        ...orderPayload,
        id: 'ord-direct-' + Date.now(),
        created_at: new Date().toISOString()
      };
    }
    memoryOrders.unshift(finalOrder);
  } else {
    finalOrder = matchedOrder;
    if (params.customerName || params.customerPhone) {
      finalOrder.customer_name = params.customerName || finalOrder.customer_name;
      finalOrder.customer_phone = params.customerPhone || finalOrder.customer_phone;
      try {
        await supabase.from('orders').update({
          customer_name: finalOrder.customer_name,
          customer_phone: finalOrder.customer_phone
        }).eq('id', finalOrder.id);
      } catch {}
    }
  }

  const catalog = await getCatalog();
  const origPrice = catalog.find(c => c.sku === finalOrder.original_sku)?.price || params.amountPaid || 0;
  const actPrice = catalog.find(c => c.sku === params.actualSku)?.price || 0;
  const priceDelta = actPrice - origPrice;

  const { fulfillment, ledgerRow } = await fulfillOrder({
    orderId: finalOrder.id,
    sourcePrefix: finalOrder.source_prefix,
    orderRef: finalOrder.order_ref,
    originalSku: finalOrder.original_sku || params.originalSku,
    actualSku: params.actualSku,
    priceDelta: priceDelta,
    cashCollected: params.cashCollected,
    overrideReason: params.overrideReason,
    locationId: params.locationId,
    staffId: params.staffId,
    notes: params.notes || 'Direct counter dispatch'
  });

  return {
    order: finalOrder,
    fulfillment,
    ledgerRow
  };
}



export async function importTikoHubOrders(
  rawOrders: RawParsedOrder[],
  staffId: string = 'Operator'
): Promise<{ inserted: number; duplicates: number; prefixesCreated: string[] }> {
  if (rawOrders.length === 0) return { inserted: 0, duplicates: 0, prefixesCreated: [] };

  // 1. Ensure SKUs exist in catalog
  for (const o of rawOrders) {
    await ensureSkuExists(o.original_sku, o.amount_paid);
  }

  // 2. Discover and automatically upsert prefixes into order_prefixes config table
  const uniquePrefixes = Array.from(new Set(rawOrders.map(r => r.source_prefix)));
  const existingPrefixes = await getOrderPrefixes();
  const existingPrefixSet = new Set(existingPrefixes.map(p => p.prefix));
  const newPrefixes: string[] = [];

  for (const prefix of uniquePrefixes) {
    if (!existingPrefixSet.has(prefix)) {
      newPrefixes.push(prefix);
      const newPrefixRow = {
        prefix,
        label: `Auto-ingested ${prefix} orders`,
        active: true,
        created_at: new Date().toISOString()
      };
      try {
        await supabase.from('order_prefixes').insert({
          prefix,
          label: newPrefixRow.label,
          active: true
        });
      } catch {}
      memoryPrefixes.push(newPrefixRow);
    }
  }

  // 3. Fetch existing orders to deduplicate by (source_prefix, order_ref, original_sku)
  const existingOrders = await getOrders();
  const existingRefMap = new Map<string, number>();

  for (const eo of existingOrders) {
    const key = `${eo.source_prefix}||${eo.order_ref}||${eo.original_sku}`;
    existingRefMap.set(key, (existingRefMap.get(key) || 0) + 1);
  }

  const incomingDecidedMap = new Map<string, number>();
  const toInsert: any[] = [];
  let duplicates = 0;

  for (const ro of rawOrders) {
    const key = `${ro.source_prefix}||${ro.order_ref}||${ro.original_sku}`;
    const existingCount = existingRefMap.get(key) || 0;
    const decidedCount = incomingDecidedMap.get(key) || 0;

    const totalBatchCount = rawOrders.filter(
      r => r.source_prefix === ro.source_prefix && r.order_ref === ro.order_ref && r.original_sku === ro.original_sku
    ).length;

    if (existingCount + decidedCount >= totalBatchCount) {
      duplicates++;
    } else {
      toInsert.push({
        source_prefix: ro.source_prefix,
        order_ref: ro.order_ref,
        original_sku: ro.original_sku,
        amount_paid: ro.amount_paid,
        customer_name: ro.customer_name || null,
        customer_phone: ro.customer_phone || null,
        channel: ro.channel,
        status: 'pending'
      });
      incomingDecidedMap.set(key, decidedCount + 1);
    }
  }

  if (toInsert.length > 0) {
    try {
      const { data, error } = await supabase.from('orders').insert(toInsert).select();
      if (!error && data) {
        memoryOrders.unshift(...data);
      } else {
        throw new Error(error?.message);
      }
    } catch {
      for (const item of toInsert) {
        memoryOrders.unshift({
          ...item,
          id: 'ord-' + Math.random().toString(36).substr(2, 9),
          created_at: new Date().toISOString()
        });
      }
    }
  }

  return {
    inserted: toInsert.length,
    duplicates,
    prefixesCreated: newPrefixes
  };
}

export async function resetDatabase(): Promise<void> {
  try {
    await supabase.from('fulfillments').delete().neq('order_ref', 'never_match_xyz');
    await supabase.from('ledger').delete().neq('staff_id', 'never_match_xyz');
    await supabase.from('orders').delete().neq('order_ref', 'never_match_xyz');
    await supabase.from('order_prefixes').delete().neq('prefix', 'never_match_xyz');
    await supabase.from('catalog').delete().neq('sku', 'never_match_xyz');
    await supabase.from('locations').delete().neq('id', 'never_match_xyz');

    await supabase.from('locations').insert(INITIAL_LOCATIONS);
    await supabase.from('order_prefixes').insert(INITIAL_PREFIXES);
    await supabase.from('catalog').insert(INITIAL_CATALOG);
    await supabase.from('ledger').insert(INITIAL_LEDGER);
    await supabase.from('orders').insert(INITIAL_ORDERS);
  } catch (e) {
    console.warn("Supabase reset query failed, resetting memory database:", e);
  }

  memoryLocations = [...INITIAL_LOCATIONS];
  memoryPrefixes = [...INITIAL_PREFIXES];
  memoryCatalog = [...INITIAL_CATALOG];
  memoryOrders = [...INITIAL_ORDERS];
  memoryFulfillments = [];
  memoryLedger = [...INITIAL_LEDGER];
}
