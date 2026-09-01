// ==============================================================================
// TikoHub CSV Parser with Automatic Dynamic Prefix & Truncated ID Extraction
// ==============================================================================

export interface RawParsedOrder {
  source_prefix: string;
  order_ref: string;
  original_sku: string;
  amount_paid: number;
  customer_name?: string;
  customer_phone?: string;
  channel: 'Online' | 'Event' | 'Card' | 'Manual';
  unit_index?: number;
  total_units?: number;
}

export interface ParseResult {
  orders: RawParsedOrder[];
  discoveredPrefixes: string[];
  totalOrders: number;
  totalUnits: number;
  errors: string[];
}

/**
 * Dynamic prefix & truncated reference extractor:
 * Splits on the first '-' (or '_') to separate source_prefix from the rest of the ID,
 * and extracts the first 5 characters of the body as the truncated order_ref.
 *
 * Examples:
 * - "ORD-04CA76BD"    -> { prefix: "ORD", ref: "04CA7" }
 * - "SH-JW6FUHND5V"    -> { prefix: "SH",  ref: "JW6FU" }
 * - "TKH-9B3D188"      -> { prefix: "TKH", ref: "9B3D1" }
 * - "CUSTOM-12345678"  -> { prefix: "CUSTOM", ref: "12345" }
 * - "04CA76BD"         -> { prefix: "ORD", ref: "04CA7" }
 */
export function extractPrefixAndTruncatedRef(rawRef: string): { prefix: string; ref: string } {
  if (!rawRef) return { prefix: 'ORD', ref: '' };

  const clean = rawRef.trim().replace(/^#/, '');

  if (clean.includes('-') || clean.includes('_')) {
    const delimiter = clean.includes('-') ? '-' : '_';
    const firstDelimIdx = clean.indexOf(delimiter);
    const prefixPart = clean.substring(0, firstDelimIdx).trim().toUpperCase();
    const bodyPart = clean.substring(firstDelimIdx + 1).trim();

    const prefix = prefixPart || 'ORD';
    const ref = bodyPart.substring(0, 5).toUpperCase();
    return { prefix, ref };
  }

  // Fallback if no delimiter: default prefix 'ORD', first 5 chars
  return {
    prefix: 'ORD',
    ref: clean.substring(0, 5).toUpperCase()
  };
}

/**
 * Normalizes SKU strings to Category|Color|Size format
 */
export function normalizeSku(rawSku: string): string {
  if (!rawSku) return 'Unknown|None|None';
  let s = rawSku.trim();

  // If formatted with dashes e.g. "Fan Jersey - Red - L"
  if (s.includes(' - ')) {
    s = s.replace(/\s+-\s+/g, '|');
  } else if (s.includes(' / ')) {
    s = s.replace(/\s+\/\s+/g, '|');
  }

  return s;
}

// Helper to parse CSV lines respecting double quotes
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map(val => val.replace(/^"|"$/g, ''));
}

export function parseTikoHubCSV(csvContent: string): ParseResult {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  const errors: string[] = [];
  const orders: RawParsedOrder[] = [];
  const discoveredPrefixes = new Set<string>();

  if (lines.length < 2) {
    return { orders: [], discoveredPrefixes: [], totalOrders: 0, totalUnits: 0, errors: ['CSV file is empty or missing data rows.'] };
  }

  // Parse headers
  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase());

  // Find column indices
  let orderRefIdx = headers.findIndex(h => ['order id', 'order reference', 'order number', 'id', 'reference', 'order_ref', 'ref', 'order'].includes(h));
  let skuIdx = headers.findIndex(h => ['sku', 'item sku', 'lineitem sku', 'product sku', 'item', 'skus', 'product'].includes(h));
  let qtyIdx = headers.findIndex(h => ['quantity', 'qty', 'lineitem qty', 'lineitem quantity', 'count', 'units'].includes(h));
  let priceIdx = headers.findIndex(h => ['price', 'item price', 'lineitem price', 'amount', 'total', 'paid'].includes(h));
  let nameIdx = headers.findIndex(h => ['customer name', 'name', 'customer', 'buyer', 'client'].includes(h));
  let phoneIdx = headers.findIndex(h => ['phone', 'customer phone', 'mobile', 'telephone'].includes(h));

  // Fallbacks
  if (orderRefIdx === -1) orderRefIdx = 0;
  if (skuIdx === -1) {
    skuIdx = headers.findIndex(h => h.includes('sku') || h.includes('item'));
    if (skuIdx === -1) skuIdx = 1;
  }
  if (qtyIdx === -1) {
    qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity'));
    if (qtyIdx === -1) qtyIdx = 2;
  }

  const uniqueOrders = new Set<string>();
  let totalUnits = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    if (values.length < 2) continue;

    const rawRef = values[orderRefIdx]?.trim();
    let rawSku = values[skuIdx]?.trim();
    const qtyStr = qtyIdx !== -1 ? values[qtyIdx]?.trim() : '1';
    const priceStr = priceIdx !== -1 ? values[priceIdx]?.trim() : '0';
    const customerName = nameIdx !== -1 ? values[nameIdx]?.trim() : undefined;
    const customerPhone = phoneIdx !== -1 ? values[phoneIdx]?.trim() : undefined;

    if (!rawRef || !rawSku) {
      errors.push(`Row ${i + 1}: Order Reference or SKU is empty.`);
      continue;
    }

    const { prefix, ref: truncatedRef } = extractPrefixAndTruncatedRef(rawRef);
    discoveredPrefixes.add(prefix);

    const sku = normalizeSku(rawSku);
    const qty = parseInt(qtyStr, 10) || 1;
    const cleanPrice = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;

    const orderCompositeKey = `${prefix}-${truncatedRef}`;
    uniqueOrders.add(orderCompositeKey);
    totalUnits += qty;

    // Expand multi-unit orders into 1 item per unit
    for (let u = 0; u < qty; u++) {
      orders.push({
        source_prefix: prefix,
        order_ref: truncatedRef,
        original_sku: sku,
        amount_paid: cleanPrice > 0 ? (cleanPrice / qty) : 0,
        customer_name: customerName,
        customer_phone: customerPhone,
        channel: 'Online',
        unit_index: u + 1,
        total_units: qty
      });
    }
  }

  return {
    orders,
    discoveredPrefixes: Array.from(discoveredPrefixes),
    totalOrders: uniqueOrders.size,
    totalUnits,
    errors
  };
}
