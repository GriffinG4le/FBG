'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import {
  getLocationsAction,
  getOrderPrefixesAction,
  updateOrderPrefixLabelAction,
  getCatalogAction,
  upsertCatalogItemAction,
  getDerivedStockOnHandAction,
  getOrdersAction,
  getFulfillmentsAction,
  getLedgerAction,
  logWarehouseStockInAction,
  allocateStockTransferAction,
  fulfillOrderAction,
  quickWalkUpFulfillAction,
  importTikoHubOrdersAction,
  resetDatabaseAction
} from './actions';
import {
  Location,
  OrderPrefix,
  CatalogItem,
  Order,
  Fulfillment,
  LedgerRow,
  StockOnHandItem
} from '../lib/db';
import { parseTikoHubCSV, ParseResult } from '../lib/csvParser';
import {
  enqueueOfflineAction,
  getOfflineQueue,
  syncOfflineQueue,
  clearOfflineQueue
} from '../lib/offlineQueue';

export default function Dashboard() {
  // Navigation & Location Scoping
  const [activeTab, setActiveTab] = useState<'fulfillment' | 'stock' | 'importer' | 'reports'>('fulfillment');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('evt-sp7s');

  // Core Data
  const [locations, setLocations] = useState<Location[]>([]);
  const [prefixes, setPrefixes] = useState<OrderPrefix[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [stockOnHand, setStockOnHand] = useState<StockOnHandItem[]>([]);

  // Connectivity & Offline Queue
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queueSize, setQueueSize] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Order Logging Form State
  const [logPrefix, setLogPrefix] = useState<string>('ORD');
  const [logOrderRef, setLogOrderRef] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Fan Jersey');
  const [selectedColor, setSelectedColor] = useState<string>('White');
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [logAmountPaid, setLogAmountPaid] = useState<string>('2500');
  const [logCashCollected, setLogCashCollected] = useState<string>('0');
  const [logCustomerName, setLogCustomerName] = useState<string>('');
  const [logCustomerPhone, setLogCustomerPhone] = useState<string>('');
  const [logDestination, setLogDestination] = useState<string>('');
  const [logChannel, setLogChannel] = useState<'Online' | 'Event' | 'Card'>('Event');
  const [logNotes, setLogNotes] = useState<string>('');
  const [showOptionalDetails, setShowOptionalDetails] = useState<boolean>(false);

  // Search & Filter
  const [recentSearchQuery, setRecentSearchQuery] = useState<string>('');

  // Admin Catalog Manager Form
  const [newCatalogCategory, setNewCatalogCategory] = useState<string>('Fan Jersey');
  const [newCatalogColor, setNewCatalogColor] = useState<string>('White');
  const [newCatalogSize, setNewCatalogSize] = useState<string>('M');
  const [newCatalogPrice, setNewCatalogPrice] = useState<number>(2500);
  const [newCatalogThreshold, setNewCatalogThreshold] = useState<number>(10);

  // Modals
  const [swapModalOpen, setSwapModalOpen] = useState<boolean>(false);
  const [swapOrder, setSwapOrder] = useState<Order | null>(null);
  const [selectedSwapSku, setSelectedSwapSku] = useState<string>('');
  const [swapCashOverride, setSwapCashOverride] = useState<string>('');
  const [swapOverrideReason, setSwapOverrideReason] = useState<string>('');
  const [swapChannel, setSwapChannel] = useState<'Event' | 'Card'>('Event');
  const [swapNotes, setSwapNotes] = useState<string>('');

  // Warehouse Stock-In Form
  const [stockInSku, setStockInSku] = useState<string>('');
  const [stockInQty, setStockInQty] = useState<number>(50);
  const [stockInNotes, setStockInNotes] = useState<string>('SportPesa supplier intake');

  // Stock Transfer Form
  const [transferSku, setTransferSku] = useState<string>('');
  const [transferQty, setTransferQty] = useState<number>(20);
  const [transferDestLocation, setTransferDestLocation] = useState<string>('evt-sp7s');
  const [transferNotes, setTransferNotes] = useState<string>('Tent allocation');

  // CSV Importer
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  // Prefix Management Editing
  const [editingPrefix, setEditingPrefix] = useState<string | null>(null);
  const [editingPrefixLabel, setEditingPrefixLabel] = useState<string>('');

  const [isPending, startTransition] = useTransition();

  // Load Data on Mount
  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const handleOnline = () => {
      setIsOnline(true);
      autoSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleQueueUpdate = () => setQueueSize(getOfflineQueue().length);
    window.addEventListener('fbg_queue_updated', handleQueueUpdate);
    updateQueueCount();

    loadAllData();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('fbg_queue_updated', handleQueueUpdate);
    };
  }, []);

  const updateQueueCount = () => {
    setQueueSize(getOfflineQueue().length);
  };

  const loadAllData = async () => {
    try {
      const [locs, prefs, cats, ords, fuls, leds, stocks] = await Promise.all([
        getLocationsAction(),
        getOrderPrefixesAction(),
        getCatalogAction(),
        getOrdersAction(),
        getFulfillmentsAction(),
        getLedgerAction(),
        getDerivedStockOnHandAction()
      ]);

      setLocations(locs);
      setPrefixes(prefs);
      setCatalog(cats);
      setOrders(ords);
      setFulfillments(fuls);
      setLedger(leds);
      setStockOnHand(stocks);

      if (cats.length > 0) {
        if (!stockInSku) setStockInSku(cats[0].sku);
        if (!transferSku) setTransferSku(cats[0].sku);
      }
    } catch (err) {
      console.error("Error loading application data:", err);
    }
  };

  // Auto Sync
  const autoSync = async () => {
    if (getOfflineQueue().length > 0) {
      handleManualSync();
    }
  };

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      await syncOfflineQueue();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
      updateQueueCount();
      loadAllData();
    }
  };

  // Active Location Info
  const activeLocation = useMemo(() => {
    return locations.find(l => l.id === selectedLocationId) || locations[0] || {
      id: 'evt-sp7s',
      name: 'SportPesa 7s (RFUEA Ground)',
      type: 'event' as const,
      status: 'active' as const,
      created_at: new Date().toISOString()
    };
  }, [locations, selectedLocationId]);

  // Derived Dynamic Categories & Colors from Catalog
  const availableCategories = useMemo(() => {
    return [...new Set(catalog.map(c => c.category))].filter(Boolean);
  }, [catalog]);

  const availableColorsForSelectedCategory = useMemo(() => {
    return [...new Set(
      catalog
        .filter(c => c.category === selectedCategory)
        .map(c => c.color || 'Standard')
    )];
  }, [catalog, selectedCategory]);

  const availableSizesForSelectedCategoryColor = useMemo(() => {
    const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL', 'None'];
    const sizes = catalog
      .filter(c => c.category === selectedCategory && (c.color || 'Standard') === selectedColor)
      .map(c => c.size || 'None');
    
    return [...new Set(sizes)].sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return a.localeCompare(b);
    });
  }, [catalog, selectedCategory, selectedColor]);

  // Auto-lookup Price for Current Selection
  const currentSelectedSku = useMemo(() => {
    return `${selectedCategory}|${selectedColor}|${selectedSize}`;
  }, [selectedCategory, selectedColor, selectedSize]);

  const currentSkuPrice = useMemo(() => {
    const item = catalog.find(c => 
      c.category === selectedCategory && 
      (c.color || 'Standard') === selectedColor && 
      (c.size || 'None') === selectedSize
    );
    return item ? item.price : 2500;
  }, [catalog, selectedCategory, selectedColor, selectedSize]);

  useEffect(() => {
    setLogAmountPaid(currentSkuPrice.toString());
  }, [currentSkuPrice]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    const colors = [...new Set(catalog.filter(c => c.category === cat).map(c => c.color || 'Standard'))];
    if (colors.length > 0) {
      setSelectedColor(colors[0]);
      const sizes = catalog.filter(c => c.category === cat && (c.color || 'Standard') === colors[0]).map(c => c.size || 'None');
      if (sizes.length > 0) setSelectedSize(sizes[0]);
    }
  };

  const handleColorChange = (col: string) => {
    setSelectedColor(col);
    const sizes = catalog.filter(c => c.category === selectedCategory && (c.color || 'Standard') === col).map(c => c.size || 'None');
    if (sizes.length > 0) setSelectedSize(sizes[0]);
  };

  const getStockRemainingAtLocation = (sku: string) => {
    const item = stockOnHand.find(s => s.location_id === selectedLocationId && s.sku === sku);
    return item ? item.stock_on_hand : 0;
  };

  // Orders & Fulfillments Joined List
  const enrichedOrders = useMemo(() => {
    return orders.map(ord => {
      const ful = fulfillments.find(f => f.order_id === ord.id);
      return {
        ...ord,
        fulfillment: ful
      };
    });
  }, [orders, fulfillments]);

  // Recent Fulfillments at this location
  const recentFulfillmentsAtLocation = useMemo(() => {
    let list = enrichedOrders.filter(o => o.status === 'fulfilled');
    if (selectedLocationId !== 'wh-main') {
      list = list.filter(o => o.fulfillment?.location_id === selectedLocationId);
    }
    if (recentSearchQuery.trim()) {
      const q = recentSearchQuery.trim().toLowerCase();
      list = list.filter(o =>
        o.order_ref.toLowerCase().includes(q) ||
        o.original_sku.toLowerCase().includes(q) ||
        (o.fulfillment?.actual_sku && o.fulfillment.actual_sku.toLowerCase().includes(q)) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(q))
      );
    }
    return list.slice(0, 15);
  }, [enrichedOrders, selectedLocationId, recentSearchQuery]);

  // Collision detection for currently typed Order Ref
  const typedCollision = useMemo(() => {
    if (!logOrderRef || logOrderRef.trim().length < 3) return null;
    const clean = logOrderRef.trim().toUpperCase();
    const matches = orders.filter(o => o.order_ref.toUpperCase() === clean);
    if (matches.length > 1) {
      const prefixes = new Set(matches.map(m => m.source_prefix));
      if (prefixes.size > 1) {
        return matches;
      }
    }
    return null;
  }, [logOrderRef, orders]);

  // Event KPIs
  const eventMetrics = useMemo(() => {
    const totalOrdersCount = orders.length;
    const fulfilledCount = fulfillments.filter(f => selectedLocationId === 'wh-main' ? true : f.location_id === selectedLocationId).length;
    const pendingCount = orders.filter(o => o.status === 'pending').length;
    const totalCashDelta = fulfillments
      .filter(f => selectedLocationId === 'wh-main' ? true : f.location_id === selectedLocationId)
      .reduce((sum, f) => sum + Number(f.cash_collected || 0), 0);

    const eventStockTotal = stockOnHand
      .filter(s => s.location_id === selectedLocationId)
      .reduce((sum, s) => sum + s.stock_on_hand, 0);

    return {
      totalOrdersCount,
      fulfilledCount,
      pendingCount,
      totalCashDelta,
      eventStockTotal
    };
  }, [orders, fulfillments, stockOnHand, selectedLocationId]);

  // Dispatch Action
  const handleLogAndDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logOrderRef.trim()) {
      alert("Please enter the 5-character Order ID (e.g. 04CA7, JW6FU).");
      return;
    }

    const cleanRef = logOrderRef.trim().toUpperCase();
    const actualSku = currentSelectedSku;
    const amountPaid = parseFloat(logAmountPaid) || currentSkuPrice;
    const cashCollected = parseFloat(logCashCollected) || 0;

    const payload = {
      sourcePrefix: logPrefix,
      orderRef: cleanRef,
      originalSku: actualSku,
      actualSku: actualSku,
      amountPaid: amountPaid,
      cashCollected: cashCollected,
      overrideReason: null,
      locationId: selectedLocationId,
      staffId: 'Staff',
      customerName: logCustomerName.trim() || null,
      customerPhone: logCustomerPhone.trim() || null,
      channel: logChannel,
      notes: logNotes.trim() || (logDestination.trim() ? `Destination: ${logDestination.trim()}` : 'Direct counter dispatch')
    };

    const mockOrder: Order = {
      id: 'temp-ord-' + Date.now(),
      source_prefix: payload.sourcePrefix,
      order_ref: payload.orderRef,
      original_sku: payload.originalSku,
      amount_paid: payload.amountPaid,
      customer_name: payload.customerName,
      customer_phone: payload.customerPhone,
      channel: payload.channel,
      status: 'fulfilled',
      created_at: new Date().toISOString()
    };

    const mockFulfillment: Fulfillment = {
      id: 'temp-ful-' + Date.now(),
      order_id: mockOrder.id,
      source_prefix: payload.sourcePrefix,
      order_ref: payload.orderRef,
      original_sku: payload.originalSku,
      actual_sku: payload.actualSku,
      price_delta: 0,
      cash_collected: payload.cashCollected,
      override_reason: null,
      location_id: selectedLocationId,
      staff_id: 'Staff',
      notes: payload.notes,
      fulfilled_at: new Date().toISOString()
    };

    setOrders(prev => [mockOrder, ...prev]);
    setFulfillments(prev => [mockFulfillment, ...prev]);

    setStockOnHand(prev => prev.map(s => 
      s.location_id === selectedLocationId && s.sku === payload.actualSku
        ? { ...s, stock_on_hand: s.stock_on_hand - 1 }
        : s
    ));

    setLogOrderRef('');
    setLogCustomerName('');
    setLogCustomerPhone('');
    setLogDestination('');
    setLogNotes('');
    setLogCashCollected('0');

    if (isOnline) {
      try {
        await quickWalkUpFulfillAction(payload);
        loadAllData();
      } catch (err) {
        enqueueOfflineAction('walkup', payload);
        updateQueueCount();
      }
    } else {
      enqueueOfflineAction('walkup', payload);
      updateQueueCount();
    }
  };

  // Open Swap Modal
  const openSwapModal = (order: Order) => {
    setSwapOrder(order);
    setSelectedSwapSku(order.original_sku);
    setSwapCashOverride('');
    setSwapOverrideReason('');
    setSwapChannel('Event');
    setSwapNotes('');
    setSwapModalOpen(true);
  };

  const computedSwapDelta = useMemo(() => {
    if (!swapOrder || !selectedSwapSku) return 0;
    const origPrice = catalog.find(c => c.sku === swapOrder.original_sku)?.price || 0;
    const actPrice = catalog.find(c => c.sku === selectedSwapSku)?.price || 0;
    return actPrice - origPrice;
  }, [swapOrder, selectedSwapSku, catalog]);

  const finalCashCollected = useMemo(() => {
    if (swapCashOverride.trim() !== '') {
      const parsed = parseFloat(swapCashOverride);
      return isNaN(parsed) ? 0 : parsed;
    }
    return computedSwapDelta;
  }, [swapCashOverride, computedSwapDelta]);

  const handleSwapSubmit = async () => {
    if (!swapOrder || !selectedSwapSku) return;

    const payload = {
      orderId: swapOrder.id,
      sourcePrefix: swapOrder.source_prefix,
      orderRef: swapOrder.order_ref,
      originalSku: swapOrder.original_sku,
      actualSku: selectedSwapSku,
      priceDelta: computedSwapDelta,
      cashCollected: finalCashCollected,
      overrideReason: swapCashOverride.trim() !== '' ? (swapOverrideReason || 'Manual Price Override') : null,
      locationId: selectedLocationId,
      staffId: 'Staff',
      notes: `Swapped to ${selectedSwapSku}. ${swapNotes}`
    };

    const optimisticFulfillment: Fulfillment = {
      id: 'temp-ful-' + Date.now(),
      order_id: swapOrder.id,
      source_prefix: swapOrder.source_prefix,
      order_ref: swapOrder.order_ref,
      original_sku: swapOrder.original_sku,
      actual_sku: selectedSwapSku,
      price_delta: computedSwapDelta,
      cash_collected: finalCashCollected,
      override_reason: payload.overrideReason,
      location_id: selectedLocationId,
      staff_id: 'Staff',
      notes: payload.notes,
      fulfilled_at: new Date().toISOString()
    };

    setOrders(prev => prev.map(o => o.id === swapOrder.id ? { ...o, status: 'fulfilled' } : o));
    setFulfillments(prev => [optimisticFulfillment, ...prev]);

    setStockOnHand(prev => prev.map(s => {
      if (s.location_id === selectedLocationId && s.sku === selectedSwapSku) {
        return { ...s, stock_on_hand: s.stock_on_hand - 1 };
      }
      return s;
    }));

    setSwapModalOpen(false);
    setSwapOrder(null);

    if (isOnline) {
      try {
        await fulfillOrderAction(payload);
        loadAllData();
      } catch (err) {
        enqueueOfflineAction('fulfill', payload);
        updateQueueCount();
      }
    } else {
      enqueueOfflineAction('fulfill', payload);
      updateQueueCount();
    }
  };

  // Submit Warehouse Stock-In
  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockInSku || stockInQty <= 0) return;

    startTransition(async () => {
      try {
        await logWarehouseStockInAction(stockInSku, stockInQty, 'wh-main', 'Warehouse', stockInNotes);
        alert(`Stock-In Recorded: +${stockInQty} units of ${stockInSku} added to Main Warehouse.`);
        loadAllData();
      } catch (err) {
        alert(`Stock-in failed: ${(err as Error).message}`);
      }
    });
  };

  // Submit Stock Transfer to Event
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferSku || transferQty <= 0) return;

    startTransition(async () => {
      try {
        await allocateStockTransferAction(
          transferSku,
          transferQty,
          'wh-main',
          transferDestLocation,
          'Admin',
          transferNotes
        );
        const destName = locations.find(l => l.id === transferDestLocation)?.name || transferDestLocation;
        alert(`Stock Dispatched: ${transferQty} units of ${transferSku} allocated to ${destName}.`);
        loadAllData();
      } catch (err) {
        alert(`Transfer failed: ${(err as Error).message}`);
      }
    });
  };

  // Admin Add / Update Catalog Item
  const handleSaveCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const sku = `${newCatalogCategory}|${newCatalogColor}|${newCatalogSize}`;
    const item: CatalogItem = {
      sku,
      category: newCatalogCategory,
      color: newCatalogColor === 'None' ? null : newCatalogColor,
      size: newCatalogSize === 'None' ? null : newCatalogSize,
      price: newCatalogPrice,
      low_stock_threshold: newCatalogThreshold
    };

    startTransition(async () => {
      try {
        await upsertCatalogItemAction(item);
        alert(`Catalog SKU Saved: ${sku} @ ${newCatalogPrice} KES.`);
        loadAllData();
      } catch (err) {
        alert(`Failed to save catalog SKU.`);
      }
    });
  };

  // CSV Importer
  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseTikoHubCSV(content);
      setParseResult(parsed);
    };
    reader.readAsText(file);
  };

  const handleImportExecute = () => {
    if (!parseResult || parseResult.orders.length === 0) return;

    startTransition(async () => {
      try {
        const res = await importTikoHubOrdersAction(parseResult.orders, 'Admin');
        alert(`Import Complete. Successfully created: ${res.inserted} orders. Ignored duplicates: ${res.duplicates} rows.`);
        setCsvFileName('');
        setParseResult(null);
        loadAllData();
        setActiveTab('fulfillment');
      } catch (err) {
        alert(`Import failed: ${(err as Error).message}`);
      }
    });
  };

  const handleSavePrefixLabel = async (prefix: string) => {
    try {
      await updateOrderPrefixLabelAction(prefix, editingPrefixLabel);
      setPrefixes(prev => prev.map(p => p.prefix === prefix ? { ...p, label: editingPrefixLabel } : p));
      setEditingPrefix(null);
    } catch (err) {
      alert("Failed to update prefix label.");
    }
  };

  const handleDbReset = async () => {
    if (confirm("WARNING: This will reset all orders, fulfillments, prefixes, and stock ledger to clean standard seeds. Proceed?")) {
      try {
        await resetDatabaseAction();
        clearOfflineQueue();
        alert("Database successfully reset to initial seed state.");
        loadAllData();
        updateQueueCount();
      } catch (err) {
        alert("Reset failed.");
      }
    }
  };

  const reportCategoryBreakdown = useMemo(() => {
    const catMap = new Map<string, { ordered: number; dispatched: number; swaps: number; cashDelta: number }>();

    for (const ord of enrichedOrders) {
      const cat = ord.original_sku.split('|')[0] || 'Unknown';
      if (!catMap.has(cat)) {
        catMap.set(cat, { ordered: 0, dispatched: 0, swaps: 0, cashDelta: 0 });
      }
      const entry = catMap.get(cat)!;
      entry.ordered++;

      if (ord.fulfillment) {
        entry.dispatched++;
        if (ord.fulfillment.actual_sku !== ord.original_sku) {
          entry.swaps++;
        }
        entry.cashDelta += Number(ord.fulfillment.cash_collected || 0);
      }
    }

    return Array.from(catMap.entries()).map(([category, stats]) => ({
      category,
      ...stats
    }));
  }, [enrichedOrders]);

  const getPrefixClass = (p: string) => {
    const clean = p.toLowerCase();
    if (['ord', 'sh', 'tkh', 'manual'].includes(clean)) return clean;
    return 'custom';
  };

  return (
    <main className="app-wrapper">
      {/* Minimalist Clean Header */}
      <header className="app-header">
        <div className="brand-logo">
          Fulfilled by <span>Griphine</span>
        </div>

        <select
          className="location-picker"
          value={selectedLocationId}
          onChange={(e) => setSelectedLocationId(e.target.value)}
          title="Active Location"
        >
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </header>

      {/* Segmented Tabs */}
      <nav className="tabs-nav">
        <button
          onClick={() => setActiveTab('fulfillment')}
          className={`tab-btn ${activeTab === 'fulfillment' ? 'active' : ''}`}
        >
          Log & Dispatch
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
        >
          Stock & Catalog
        </button>
        <button
          onClick={() => setActiveTab('importer')}
          className={`tab-btn ${activeTab === 'importer' ? 'active' : ''}`}
        >
          CSV Import
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
        >
          Reconciliation
        </button>
      </nav>

      {/* ========================================================================= */}
      {/* TAB 1: LOG & DISPATCH STATION */}
      {/* ========================================================================= */}
      {activeTab === 'fulfillment' && (
        <div className="main-grid">
          {/* LEFT COLUMN: ORDER LOGGING & FULFILLMENT CARD */}
          <div>
            <div className="card">
              <div className="card-title">
                <span>Log Order & Dispatch</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>
                  {activeLocation.name.split(' ')[0]}
                </span>
              </div>

              {/* Collision Alert if typed ref has duplicates */}
              {typedCollision && (
                <div className="collision-box" style={{ margin: '0 0 16px 0', background: 'var(--bg-subtle)', borderLeft: '3px solid var(--accent)', padding: '10px 14px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>
                    Collision: #{logOrderRef}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--label-secondary)', marginBottom: '8px' }}>
                    Found {typedCollision.length} orders with this ID across channels:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {typedCollision.map(c => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFFFFF', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}>
                        <span>
                          <strong className={`prefix-tag ${getPrefixClass(c.source_prefix)}`}>{c.source_prefix}</strong> #{c.order_ref} &middot; {c.customer_name || 'Walk-up'}
                        </span>
                        <span style={{ fontWeight: 700 }}>{c.amount_paid} KES</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleLogAndDispatch}>
                <div className="form-group" style={{ margin: '0 0 14px 0', boxShadow: 'none', border: '0.5px solid var(--divider-light)' }}>
                  {/* Field 1: Order ID Input */}
                  <div className="form-row">
                    <span className="row-label">Order ID</span>
                    <div className="row-control" style={{ gap: '8px' }}>
                      <select
                        value={logPrefix}
                        onChange={(e) => setLogPrefix(e.target.value)}
                        style={{ width: 'auto', background: 'var(--bg-screen)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, textAlign: 'left' }}
                        title="Prefix"
                      >
                        {prefixes.map(p => (
                          <option key={p.prefix} value={p.prefix}>{p.prefix}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="5-char code (e.g. 04CA7)"
                        value={logOrderRef}
                        onChange={(e) => setLogOrderRef(e.target.value.toUpperCase())}
                        style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, letterSpacing: '0.5px' }}
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  {/* Field 2: Category Selector */}
                  <div className="form-row">
                    <span className="row-label">Category</span>
                    <div className="row-control">
                      <select
                        value={selectedCategory}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        required
                      >
                        {availableCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Field 3: Color Selector */}
                  <div className="form-row">
                    <span className="row-label">Color</span>
                    <div className="row-control">
                      <select
                        value={selectedColor}
                        onChange={(e) => handleColorChange(e.target.value)}
                        required
                      >
                        {availableColorsForSelectedCategory.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Field 4: Size Selector */}
                  <div className="size-chips-container">
                    {availableSizesForSelectedCategoryColor.map(sz => {
                      const targetSku = `${selectedCategory}|${selectedColor}|${sz}`;
                      const stockRem = getStockRemainingAtLocation(targetSku);
                      const isSelected = selectedSize === sz;
                      const isOut = stockRem <= 0;

                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setSelectedSize(sz)}
                          className={`size-pill ${isSelected ? 'active' : ''} ${isOut ? 'zero-stock' : ''}`}
                        >
                          <span>{sz}</span>
                          <span className="stock-hint">
                            {isOut ? '0' : stockRem}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Field 5: Auto-Populated Amount Paid */}
                  <div className="form-row">
                    <span className="row-label">
                      Amount (KES)
                    </span>
                    <div className="row-control">
                      <input
                        type="number"
                        value={logAmountPaid}
                        onChange={(e) => setLogAmountPaid(e.target.value)}
                        style={{ fontSize: '15px', fontWeight: 700, color: 'var(--label-primary)' }}
                        required
                      />
                    </div>
                  </div>

                  {/* Field 6: Upgrade Cash Delta */}
                  <div className="form-row">
                    <span className="row-label">
                      Cash Delta
                    </span>
                    <div className="row-control">
                      <input
                        type="number"
                        placeholder="0"
                        value={logCashCollected}
                        onChange={(e) => setLogCashCollected(e.target.value)}
                        style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent)' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Optional Delivery & Buyer Details Accordion */}
                <div style={{ marginBottom: '16px' }}>
                  <button
                    type="button"
                    onClick={() => setShowOptionalDetails(!showOptionalDetails)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    {showOptionalDetails ? 'Hide Customer & Delivery Details' : '+ Add Customer / Delivery Details'}
                  </button>

                  {showOptionalDetails && (
                    <div className="form-group" style={{ margin: '10px 0 0 0', boxShadow: 'none', border: '0.5px solid var(--divider-light)' }}>
                      <div className="form-row">
                        <span className="row-label">Buyer Name</span>
                        <div className="row-control">
                          <input
                            type="text"
                            placeholder="e.g. John Doe"
                            value={logCustomerName}
                            onChange={(e) => setLogCustomerName(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <span className="row-label">Phone Number</span>
                        <div className="row-control">
                          <input
                            type="tel"
                            placeholder="e.g. 0712345678"
                            value={logCustomerPhone}
                            onChange={(e) => setLogCustomerPhone(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <span className="row-label">Destination</span>
                        <div className="row-control">
                          <input
                            type="text"
                            placeholder="e.g. Nakuru / Pickup"
                            value={logDestination}
                            onChange={(e) => setLogDestination(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <span className="row-label">Channel</span>
                        <div className="row-control">
                          <select
                            value={logChannel}
                            onChange={(e) => setLogChannel(e.target.value as any)}
                          >
                            <option value="Event">Event Tent (M-Pesa / Cash)</option>
                            <option value="Card">Card Terminal</option>
                            <option value="Online">Online Pre-order</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-row vertical">
                        <label>Notes</label>
                        <textarea
                          rows={2}
                          placeholder="Delivery instructions..."
                          value={logNotes}
                          onChange={(e) => setLogNotes(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Fulfillment Button */}
                <button
                  type="submit"
                  className="btn green block"
                  disabled={isPending}
                >
                  Log Sale & Dispatch Jersey
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT COLUMN: AVAILABLE STOCK & RECENT DISPATCHES */}
          <div>
            {/* Minimalist KPI Row */}
            <div className="kpi-row">
              <div className="kpi-box">
                <span className="kpi-lbl">Dispatched</span>
                <span className="kpi-val" style={{ color: 'var(--success)' }}>
                  {eventMetrics.fulfilledCount} pcs
                </span>
              </div>
              <div className="kpi-box">
                <span className="kpi-lbl">Pending</span>
                <span className="kpi-val" style={{ color: 'var(--warning)' }}>
                  {eventMetrics.pendingCount}
                </span>
              </div>
              <div className="kpi-box">
                <span className="kpi-lbl">Cash Delta</span>
                <span className="kpi-val" style={{ color: 'var(--accent)' }}>
                  +{eventMetrics.totalCashDelta.toLocaleString()} KES
                </span>
              </div>
              <div className="kpi-box">
                <span className="kpi-lbl">Stock on Hand</span>
                <span className="kpi-val">
                  {eventMetrics.eventStockTotal} pcs
                </span>
              </div>
            </div>

            {/* SLEEK & MINIMALIST "AVAILABLE STOCK" CARD */}
            <div className="card">
              <div className="card-title">
                <span>Available Stock</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--label-secondary)' }}>
                  {activeLocation.name}
                </span>
              </div>

              <div className="stock-matrix-grid">
                {availableCategories.map(cat => {
                  const catItems = stockOnHand.filter(s => s.location_id === selectedLocationId && s.category === cat);
                  if (catItems.length === 0) return null;

                  const colors = [...new Set(catItems.map(c => c.color || 'Standard'))];

                  return (
                    <div key={cat} className="stock-category-card">
                      <div className="stock-category-name">{cat}</div>

                      <div>
                        {colors.map(col => {
                          const colItems = catItems.filter(c => (c.color || 'Standard') === col);

                          return (
                            <div key={col} className="stock-variant-row">
                              <span className="stock-color-label">{col}</span>

                              <div className="stock-sizes-row">
                                {colItems.map(item => {
                                  const isZero = item.stock_on_hand <= 0;
                                  const isLow = item.stock_on_hand <= item.low_stock_threshold && !isZero;

                                  return (
                                    <button
                                      key={item.sku}
                                      type="button"
                                      onClick={() => {
                                        setSelectedCategory(cat);
                                        setSelectedColor(col);
                                        setSelectedSize(item.size || 'None');
                                      }}
                                      className={`stock-size-badge ${isZero ? 'zero' : isLow ? 'low' : ''}`}
                                      title="Click to fill order form"
                                    >
                                      <span>{item.size || 'Std'}</span>
                                      <span className="stock-count-num">{item.stock_on_hand}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Dispatches Feed */}
            <div className="card">
              <div className="card-title">
                <span>Recent Dispatches</span>
                <input
                  type="text"
                  placeholder="Filter..."
                  value={recentSearchQuery}
                  onChange={(e) => setRecentSearchQuery(e.target.value)}
                  style={{ width: '110px', fontSize: '12px', background: 'var(--bg-subtle)', padding: '4px 8px', borderRadius: '6px', border: 'none', textAlign: 'left' }}
                />
              </div>

              {recentFulfillmentsAtLocation.length === 0 ? (
                <div className="result-empty">No dispatches logged today at this station.</div>
              ) : (
                <div className="list-group" style={{ margin: 0, boxShadow: 'none' }}>
                  {recentFulfillmentsAtLocation.map(order => {
                    const isSwap = order.fulfillment && order.fulfillment.actual_sku !== order.original_sku;

                    return (
                      <div key={order.id} className="list-row" style={{ padding: '8px 10px', borderBottom: '0.5px solid var(--divider-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <span className={`prefix-tag ${getPrefixClass(order.source_prefix)}`}>
                              {order.source_prefix}
                            </span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)', fontSize: '13px' }}>
                              #{order.order_ref}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>
                              {order.customer_name || 'Walk-up'}
                            </span>
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--label-secondary)' }}>
                            {order.fulfillment?.actual_sku || order.original_sku} &middot; {order.amount_paid} KES
                            {order.fulfillment && order.fulfillment.cash_collected > 0 && ` (+${order.fulfillment.cash_collected} KES)`}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`status-badge ${isSwap ? 'swapped' : 'dispatched'}`}>
                            {isSwap ? 'Swapped' : 'Dispatched'}
                          </span>
                          <button
                            onClick={() => openSwapModal(order)}
                            className="btn secondary small"
                            style={{ fontSize: '11px', height: '26px' }}
                          >
                            Swap / Fix
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MASTER STOCK & CATALOG */}
      {/* ========================================================================= */}
      {activeTab === 'stock' && (
        <div className="two-col-grid">
          {/* Left Column: Admin Catalog Manager */}
          <div>
            <div className="card">
              <div className="card-title">
                <span>SKU Catalog & Pricing</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--label-secondary)', marginBottom: '14px' }}>
                Define jersey categories, sizes, and baseline prices. These prices automatically populate when staff log orders.
              </p>

              <form onSubmit={handleSaveCatalogItem} className="form-group" style={{ margin: '0 0 16px 0', border: '0.5px solid var(--divider-light)', boxShadow: 'none' }}>
                <div className="form-row">
                  <span className="row-label">Category</span>
                  <div className="row-control">
                    <input
                      type="text"
                      placeholder="e.g. Fan Jersey"
                      value={newCatalogCategory}
                      onChange={(e) => setNewCatalogCategory(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <span className="row-label">Color</span>
                  <div className="row-control">
                    <input
                      type="text"
                      placeholder="e.g. White / Red / Navy"
                      value={newCatalogColor}
                      onChange={(e) => setNewCatalogColor(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <span className="row-label">Size</span>
                  <div className="row-control">
                    <input
                      type="text"
                      placeholder="e.g. S, M, L, XL, XXL"
                      value={newCatalogSize}
                      onChange={(e) => setNewCatalogSize(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <span className="row-label">Price (KES)</span>
                  <div className="row-control">
                    <input
                      type="number"
                      value={newCatalogPrice}
                      onChange={(e) => setNewCatalogPrice(parseInt(e.target.value, 10) || 0)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <span className="row-label">Low Stock Threshold</span>
                  <div className="row-control">
                    <input
                      type="number"
                      value={newCatalogThreshold}
                      onChange={(e) => setNewCatalogThreshold(parseInt(e.target.value, 10) || 0)}
                      required
                    />
                  </div>
                </div>

                <div style={{ padding: '12px 18px' }}>
                  <button type="submit" className="btn green block" disabled={isPending}>
                    {isPending ? 'Saving...' : 'Save Catalog SKU & Price'}
                  </button>
                </div>
              </form>

              <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Category</th>
                      <th>Variant</th>
                      <th style={{ textAlign: 'right' }}>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map(c => (
                      <tr key={c.sku}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.sku}</td>
                        <td>{c.category}</td>
                        <td>{c.color || 'Standard'} / {c.size || 'None'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>
                          {c.price} KES
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Warehouse Stock Operations */}
          <div>
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-title">
                <span>Warehouse Stock-In</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--label-secondary)', marginBottom: '12px' }}>
                Record incoming deliveries from suppliers into Main Warehouse stock.
              </p>
              <form onSubmit={handleStockInSubmit} className="form-group" style={{ margin: 0, border: '0.5px solid var(--divider-light)', boxShadow: 'none' }}>
                <div className="form-row">
                  <span className="row-label">Select SKU</span>
                  <div className="row-control">
                    <select value={stockInSku} onChange={(e) => setStockInSku(e.target.value)} required>
                      {catalog.map(c => (
                        <option key={c.sku} value={c.sku}>{c.sku} ({c.price} KES)</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <span className="row-label">Quantity</span>
                  <div className="row-control">
                    <input
                      type="number"
                      min="1"
                      value={stockInQty}
                      onChange={(e) => setStockInQty(parseInt(e.target.value, 10) || 0)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <span className="row-label">Supplier Notes</span>
                  <div className="row-control">
                    <input
                      type="text"
                      value={stockInNotes}
                      onChange={(e) => setStockInNotes(e.target.value)}
                      placeholder="e.g. Official Batch #1"
                    />
                  </div>
                </div>

                <div style={{ padding: '12px 18px' }}>
                  <button type="submit" className="btn green block" disabled={isPending}>
                    {isPending ? 'Recording...' : 'Record Warehouse Stock-In'}
                  </button>
                </div>
              </form>
            </div>

            <div className="card">
              <div className="card-title">
                <span>Stock Transfer to Event Tent</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--label-secondary)', marginBottom: '12px' }}>
                Allocate merchandise from Main Warehouse to a specific event tent.
              </p>
              <form onSubmit={handleTransferSubmit} className="form-group" style={{ margin: 0, border: '0.5px solid var(--divider-light)', boxShadow: 'none' }}>
                <div className="form-row">
                  <span className="row-label">Select SKU</span>
                  <div className="row-control">
                    <select value={transferSku} onChange={(e) => setTransferSku(e.target.value)} required>
                      {catalog.map(c => (
                        <option key={c.sku} value={c.sku}>{c.sku} ({c.price} KES)</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <span className="row-label">Destination</span>
                  <div className="row-control">
                    <select value={transferDestLocation} onChange={(e) => setTransferDestLocation(e.target.value)} required>
                      {locations.filter(l => l.type === 'event').map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <span className="row-label">Quantity</span>
                  <div className="row-control">
                    <input
                      type="number"
                      min="1"
                      value={transferQty}
                      onChange={(e) => setTransferQty(parseInt(e.target.value, 10) || 0)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <span className="row-label">Dispatch Notes</span>
                  <div className="row-control">
                    <input
                      type="text"
                      value={transferNotes}
                      onChange={(e) => setTransferNotes(e.target.value)}
                      placeholder="e.g. Tent initial allocation"
                    />
                  </div>
                </div>

                <div style={{ padding: '12px 18px' }}>
                  <button type="submit" className="btn block" disabled={isPending}>
                    {isPending ? 'Allocating...' : 'Dispatch to Event Tent'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CSV IMPORTER */}
      {/* ========================================================================= */}
      {activeTab === 'importer' && (
        <div style={{ margin: '18px 28px' }}>
          <div className="card">
            <div className="card-title">
              <span>Batch CSV Orders Ingest</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--label-secondary)', marginBottom: '16px' }}>
              Upload CSV exports from TikoHub or Shopify. The system dynamically splits on the first <code>-</code> to capture prefixes, truncates the ID to 5 characters, and expands multi-unit rows.
            </p>

            <div className="form-group" style={{ margin: '0 0 16px 0', border: '0.5px solid var(--divider-light)', boxShadow: 'none' }}>
              <div className="form-row vertical">
                <label htmlFor="csv-file-input">Select CSV Export File</label>
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  onChange={handleCSVFileChange}
                  style={{ textAlign: 'left', cursor: 'pointer', padding: '8px 0', fontSize: '14px', width: '100%' }}
                />
              </div>
            </div>

            {parseResult && (
              <>
                <div className="kpi-row" style={{ marginBottom: '16px' }}>
                  <div className="kpi-box">
                    <span className="kpi-lbl">Orders</span>
                    <span className="kpi-val">{parseResult.totalOrders}</span>
                  </div>
                  <div className="kpi-box">
                    <span className="kpi-lbl">Units</span>
                    <span className="kpi-val" style={{ color: 'var(--accent)' }}>{parseResult.totalUnits}</span>
                  </div>
                  <div className="kpi-box">
                    <span className="kpi-lbl">Prefixes</span>
                    <span className="kpi-val">{parseResult.discoveredPrefixes.join(', ') || 'ORD'}</span>
                  </div>
                </div>

                <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Prefix & Ref</th>
                        <th>SKU</th>
                        <th>Paid</th>
                        <th>Customer</th>
                        <th>Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.orders.map((o, idx) => (
                        <tr key={idx}>
                          <td>
                            <span className={`prefix-tag ${getPrefixClass(o.source_prefix)}`}>
                              {o.source_prefix}
                            </span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, marginLeft: '4px' }}>
                              #{o.order_ref}
                            </span>
                          </td>
                          <td>{o.original_sku}</td>
                          <td>{o.amount_paid} KES</td>
                          <td>{o.customer_name || 'N/A'}</td>
                          <td>{o.unit_index}/{o.total_units}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={handleImportExecute}
                  className="btn green block"
                  disabled={isPending || parseResult.orders.length === 0}
                >
                  {isPending ? 'Importing...' : `Write ${parseResult.orders.length} Orders to Database`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: RECONCILIATION & AUDIT MATRIX */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div style={{ margin: '18px 28px' }}>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-title">
              <span>Category Reconciliation</span>
            </div>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Ordered</th>
                  <th>Dispatched</th>
                  <th>Swaps</th>
                  <th>Upgrade Cash Delta</th>
                </tr>
              </thead>
              <tbody>
                {reportCategoryBreakdown.map(row => (
                  <tr key={row.category}>
                    <td style={{ fontWeight: 600 }}>{row.category}</td>
                    <td>{row.ordered} pcs</td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>{row.dispatched} pcs</td>
                    <td>{row.swaps} swaps</td>
                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>
                      +{row.cashDelta.toLocaleString()} KES
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-title">
              <span>Ordered vs. What Went Out</span>
            </div>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Order Ref</th>
                    <th>Customer</th>
                    <th>Ordered SKU</th>
                    <th>Handed Over</th>
                    <th>Cash Delta</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedOrders.map(order => {
                    const isFulfilled = !!order.fulfillment;
                    const isSwap = isFulfilled && order.fulfillment?.actual_sku !== order.original_sku;

                    return (
                      <tr key={order.id}>
                        <td>
                          <span className={`prefix-tag ${getPrefixClass(order.source_prefix)}`}>
                            {order.source_prefix}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, marginLeft: '4px' }}>
                            #{order.order_ref}
                          </span>
                        </td>
                        <td>{order.customer_name || 'Walk-up'}</td>
                        <td style={{ fontSize: '12px' }}>{order.original_sku}</td>
                        <td style={{ fontSize: '12px', fontWeight: 600, color: isSwap ? 'var(--accent)' : 'var(--label-primary)' }}>
                          {order.fulfillment?.actual_sku || '—'}
                        </td>
                        <td style={{ fontWeight: 600, color: order.fulfillment?.cash_collected ? 'var(--accent)' : 'var(--label-secondary)' }}>
                          {order.fulfillment?.cash_collected ? `+${order.fulfillment.cash_collected} KES` : '0'}
                        </td>
                        <td>
                          {order.fulfillment ? (locations.find(l => l.id === order.fulfillment?.location_id)?.name.split(' ')[0] || order.fulfillment?.location_id) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-title">
              <span>Dynamic Order Prefixes</span>
            </div>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Prefix</th>
                  <th>Channel Description</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {prefixes.map(p => (
                  <tr key={p.prefix}>
                    <td>
                      <span className={`prefix-tag ${getPrefixClass(p.prefix)}`}>
                        {p.prefix}
                      </span>
                    </td>
                    <td>
                      {editingPrefix === p.prefix ? (
                        <input
                          type="text"
                          value={editingPrefixLabel}
                          onChange={(e) => setEditingPrefixLabel(e.target.value)}
                          style={{ border: '0.5px solid var(--divider)', padding: '4px 8px', borderRadius: '6px', fontSize: '13px', width: '100%' }}
                        />
                      ) : (
                        p.label || 'No description'
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--success)' }}>Active</span>
                    </td>
                    <td>
                      {editingPrefix === p.prefix ? (
                        <button onClick={() => handleSavePrefixLabel(p.prefix)} className="btn green small">
                          Save
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingPrefix(p.prefix);
                            setEditingPrefixLabel(p.label);
                          }}
                          className="btn secondary small"
                        >
                          Edit Label
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ borderLeft: '3px solid var(--destructive)' }}>
            <div className="card-title" style={{ fontSize: '14px' }}>Developer Reset</div>
            <p style={{ fontSize: '12px', color: 'var(--label-secondary)', marginBottom: '12px' }}>
              Reset orders, fulfillments, and stock movements to clean standard seeds.
            </p>
            <button onClick={handleDbReset} className="btn danger small">
              Reset Database
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SWAP SKU */}
      {/* ========================================================================= */}
      {swapModalOpen && swapOrder && (
        <div className="modal">
          <div className="modal-content">
            <div className="card-title">
              <span>Swap / Upgrade SKU</span>
              <button onClick={() => setSwapModalOpen(false)} className="btn small secondary">Cancel</button>
            </div>

            <div className="form-group" style={{ margin: '0 0 16px 0', border: '0.5px solid var(--divider-light)', boxShadow: 'none' }}>
              <div className="form-row">
                <span className="row-label">Order Ref</span>
                <span className="row-control" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                  {swapOrder.source_prefix}-{swapOrder.order_ref}
                </span>
              </div>
              <div className="form-row">
                <span className="row-label">Original SKU</span>
                <span className="row-control" style={{ fontSize: '13px', color: 'var(--label-secondary)' }}>
                  {swapOrder.original_sku} ({swapOrder.amount_paid} KES)
                </span>
              </div>
              <div className="form-row">
                <span className="row-label">Replacement SKU</span>
                <div className="row-control">
                  <select
                    value={selectedSwapSku}
                    onChange={(e) => setSelectedSwapSku(e.target.value)}
                  >
                    {catalog.map(c => (
                      <option key={c.sku} value={c.sku}>
                        {c.sku} — {c.price} KES
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className={`delta-box ${computedSwapDelta > 0 ? 'upgrade' : computedSwapDelta < 0 ? 'refund' : 'even'}`}>
              <span>Price Delta</span>
              <span>
                {computedSwapDelta > 0 ? `+${computedSwapDelta} KES (Upgrade)` : computedSwapDelta < 0 ? `${computedSwapDelta} KES (Refund)` : '0 KES (Even Swap)'}
              </span>
            </div>

            <div className="form-group" style={{ margin: '0 0 16px 0', border: '0.5px solid var(--divider-light)', boxShadow: 'none' }}>
              <div className="form-row">
                <span className="row-label">Cash Collected</span>
                <div className="row-control">
                  <input
                    type="number"
                    placeholder={computedSwapDelta.toString()}
                    value={swapCashOverride}
                    onChange={(e) => setSwapCashOverride(e.target.value)}
                  />
                </div>
              </div>

              {swapCashOverride.trim() !== '' && (
                <div className="form-row">
                  <span className="row-label">Reason</span>
                  <div className="row-control">
                    <input
                      type="text"
                      placeholder="e.g. Lead approved even swap"
                      value={swapOverrideReason}
                      onChange={(e) => setSwapOverrideReason(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="form-row">
                <span className="row-label">Notes</span>
                <div className="row-control">
                  <input
                    type="text"
                    placeholder="e.g. Sizing adjustment"
                    value={swapNotes}
                    onChange={(e) => setSwapNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <button onClick={handleSwapSubmit} className="btn green block">
              Confirm Swap & Dispatch
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer-bar">
        Fulfilled by Griphine &middot; Event Inventory & Dispatch System
      </footer>
    </main>
  );
}
