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

type NavigationTab = 'dashboard' | 'fulfillment' | 'stock' | 'importer' | 'reports';
type TimeframeFilter = 'today' | 'week' | 'month' | 'all';

export default function Dashboard() {
  // Navigation & Scoping
  const [activeTab, setActiveTab] = useState<NavigationTab>('fulfillment');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('evt-sp7s');
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('today');

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

  // Form State
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

  // Right-side category filter
  const [stockViewCategory, setStockViewCategory] = useState<string>('all');

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
  const [swapNotes, setSwapNotes] = useState<string>('');

  // Warehouse Stock-In Form
  const [stockInSku, setStockInSku] = useState<string>('');
  const [stockInQty, setStockInQty] = useState<number>(50);
  const [stockInNotes, setStockInNotes] = useState<string>('Official batch intake');

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

  // Derived Dynamic Categories & Colors
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

  // Current SKU Selection & Auto-Price
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
    setLogAmountPaid(currentSkuPrice.toLocaleString());
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

  // Joined Enriched Orders
  const enrichedOrders = useMemo(() => {
    return orders.map(ord => {
      const ful = fulfillments.find(f => f.order_id === ord.id);
      return {
        ...ord,
        fulfillment: ful
      };
    });
  }, [orders, fulfillments]);

  // Station KPI Bar Stats
  const stationStats = useMemo(() => {
    const fulfilledCount = fulfillments.filter(f => selectedLocationId === 'wh-main' ? true : f.location_id === selectedLocationId).length;
    const pendingCount = orders.filter(o => o.status === 'pending').length;
    const totalCashDelta = fulfillments
      .filter(f => selectedLocationId === 'wh-main' ? true : f.location_id === selectedLocationId)
      .reduce((sum, f) => sum + Number(f.cash_collected || 0), 0);

    const eventStockTotal = stockOnHand
      .filter(s => s.location_id === selectedLocationId)
      .reduce((sum, s) => sum + s.stock_on_hand, 0);

    return {
      fulfilledCount,
      pendingCount,
      totalCashDelta,
      eventStockTotal
    };
  }, [orders, fulfillments, stockOnHand, selectedLocationId]);

  // Dashboard Analytics Filter Engine
  const dashboardAnalytics = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const filteredFulfillments = fulfillments.filter(f => {
      if (selectedLocationId !== 'all' && f.location_id !== selectedLocationId) return false;
      const time = new Date(f.fulfilled_at).getTime();
      if (timeframe === 'today' && time < startOfToday) return false;
      if (timeframe === 'week' && time < startOfWeek) return false;
      if (timeframe === 'month' && time < startOfMonth) return false;
      return true;
    });

    const totalDispatchedUnits = filteredFulfillments.length;
    const baseRevenue = filteredFulfillments.reduce((sum, f) => {
      const ord = orders.find(o => o.id === f.order_id);
      return sum + (ord ? ord.amount_paid : 2500);
    }, 0);
    const upgradeCashDelta = filteredFulfillments.reduce((sum, f) => sum + Number(f.cash_collected || 0), 0);
    const grossSalesRevenue = baseRevenue + upgradeCashDelta;

    const catSalesMap = new Map<string, { units: number; revenue: number }>();
    for (const f of filteredFulfillments) {
      const cat = (f.actual_sku || f.original_sku).split('|')[0] || 'Unknown';
      const ord = orders.find(o => o.id === f.order_id);
      const price = (ord ? ord.amount_paid : 2500) + Number(f.cash_collected || 0);

      if (!catSalesMap.has(cat)) catSalesMap.set(cat, { units: 0, revenue: 0 });
      const c = catSalesMap.get(cat)!;
      c.units += 1;
      c.revenue += price;
    }

    const categoryBreakdown = Array.from(catSalesMap.entries()).map(([category, data]) => ({
      category,
      units: data.units,
      revenue: data.revenue,
      percentage: totalDispatchedUnits > 0 ? Math.round((data.units / totalDispatchedUnits) * 100) : 0
    })).sort((a, b) => b.units - a.units);

    return {
      totalDispatchedUnits,
      grossSalesRevenue,
      upgradeCashDelta,
      categoryBreakdown
    };
  }, [fulfillments, orders, timeframe, selectedLocationId]);

  // Dispatch Action
  const handleLogAndDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logOrderRef.trim()) {
      alert("Please enter the 5-character Order ID (e.g. 04CA7).");
      return;
    }

    const cleanRef = logOrderRef.trim().toUpperCase();
    const actualSku = currentSelectedSku;
    const amountPaid = parseFloat(logAmountPaid.replace(/,/g, '')) || currentSkuPrice;
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

  // Submit Stock Transfer
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

  // Save Catalog SKU
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
        alert(`Import Complete. Created ${res.inserted} orders. Ignored ${res.duplicates} duplicates.`);
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

  // Reconciliation Breakdown
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

  return (
    <div className="app">
      {/* Header */}
      <header>
        <div className="brand">
          <div className="mark display">FBG</div>
          <div className="brand-name">Fulfilled by <b>Griphine</b></div>
        </div>
        <div className="loc-switch">
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
          >
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.4"/></svg>
        </div>
      </header>

      {/* Navigation */}
      <nav>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={activeTab === 'dashboard' ? 'active' : ''}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('fulfillment')}
          className={activeTab === 'fulfillment' ? 'active' : ''}
        >
          Log & dispatch
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={activeTab === 'stock' ? 'active' : ''}
        >
          Stock & catalog
        </button>
        <button
          onClick={() => setActiveTab('importer')}
          className={activeTab === 'importer' ? 'active' : ''}
        >
          CSV import
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={activeTab === 'reports' ? 'active' : ''}
        >
          Reconciliation
        </button>
      </nav>

      {/* Stats Connected Hero Box */}
      <div className="stats">
        <div className="stat">
          <div className="label">DISPATCHED</div>
          <div className="value success">
            {stationStats.fulfilledCount} <span className="unit">pcs</span>
          </div>
        </div>
        <div className="stat">
          <div className="label">PENDING</div>
          <div className="value amber">
            {stationStats.pendingCount}
          </div>
        </div>
        <div className="stat">
          <div className="label">CASH DELTA</div>
          <div className="value">
            +{stationStats.totalCashDelta.toLocaleString()} <span className="unit">KES</span>
          </div>
        </div>
        <div className="stat">
          <div className="label">STOCK ON HAND</div>
          <div className="value">
            {stationStats.eventStockTotal} <span className="unit">pcs</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 0: DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && (
        <div>
          <div className="timeframe-bar">
            <div className="timeframe-pills">
              <button
                onClick={() => setTimeframe('today')}
                className={`timeframe-pill ${timeframe === 'today' ? 'active' : ''}`}
              >
                Today
              </button>
              <button
                onClick={() => setTimeframe('week')}
                className={`timeframe-pill ${timeframe === 'week' ? 'active' : ''}`}
              >
                This week
              </button>
              <button
                onClick={() => setTimeframe('month')}
                className={`timeframe-pill ${timeframe === 'month' ? 'active' : ''}`}
              >
                This month
              </button>
              <button
                onClick={() => setTimeframe('all')}
                className={`timeframe-pill ${timeframe === 'all' ? 'active' : ''}`}
              >
                All time
              </button>
            </div>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Gross sales: <strong style={{ color: 'var(--ink)' }}>{dashboardAnalytics.grossSalesRevenue.toLocaleString()} KES</strong>
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div className="card">
              <div className="card-head">Sales by merchandise category</div>
              <div className="progress-list">
                {dashboardAnalytics.categoryBreakdown.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '12px 0' }}>No volume recorded in this timeframe.</div>
                ) : (
                  dashboardAnalytics.categoryBreakdown.map(cat => (
                    <div key={cat.category}>
                      <div className="progress-item-head">
                        <span style={{ fontWeight: 500 }}>{cat.category}</span>
                        <span style={{ color: 'var(--muted)' }}>
                          <strong>{cat.units} pcs</strong> &middot; {cat.revenue.toLocaleString()} KES ({cat.percentage}%)
                        </span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${Math.max(cat.percentage, 4)}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head">Recent dispatches today</div>
              <div style={{ padding: '8px 0' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>SKU</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedOrders.filter(o => o.status === 'fulfilled').slice(0, 5).map(o => (
                      <tr key={o.id}>
                        <td className="mono" style={{ fontWeight: 600 }}>{o.source_prefix}-{o.order_ref}</td>
                        <td style={{ fontSize: '12px' }}>{o.fulfillment?.actual_sku || o.original_sku}</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{o.amount_paid} KES</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: LOG & DISPATCH (MAIN STATION) */}
      {/* ========================================================================= */}
      {activeTab === 'fulfillment' && (
        <div className="layout">
          {/* Left Column: Form */}
          <div className="card">
            <div className="card-head">Log order & dispatch</div>
            <form className="form" onSubmit={handleLogAndDispatch}>
              {/* Order ID */}
              <div className="field">
                <span className="field-label">Order ID</span>
                <div className="idgroup">
                  <select
                    value={logPrefix}
                    onChange={(e) => setLogPrefix(e.target.value)}
                  >
                    {prefixes.map(p => (
                      <option key={p.prefix} value={p.prefix}>{p.prefix}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    maxLength={5}
                    placeholder="04CA7"
                    value={logOrderRef}
                    onChange={(e) => setLogOrderRef(e.target.value.toUpperCase())}
                    autoFocus
                    required
                  />
                </div>
              </div>

              {/* Category */}
              <div className="field">
                <span className="field-label">Category</span>
                <select
                  className="plain"
                  value={selectedCategory}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                >
                  {availableCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Colour */}
              <div className="field">
                <span className="field-label">Colour</span>
                <select
                  className="plain"
                  value={selectedColor}
                  onChange={(e) => handleColorChange(e.target.value)}
                >
                  {availableColorsForSelectedCategory.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              {/* Size */}
              <div className="field block-field">
                <span className="field-label" style={{ display: 'block', marginBottom: '10px' }}>Size</span>
                <div className="sizes">
                  {availableSizesForSelectedCategoryColor.map(sz => {
                    const targetSku = `${selectedCategory}|${selectedColor}|${sz}`;
                    const stockRem = getStockRemainingAtLocation(targetSku);
                    const isSelected = selectedSize === sz;
                    const isZero = stockRem <= 0;

                    return (
                      <div
                        key={sz}
                        onClick={() => setSelectedSize(sz)}
                        className={`size-chip ${isSelected ? 'selected' : ''} ${isZero ? 'disabled' : ''}`}
                      >
                        {sz}
                        <span className="n">{stockRem}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Amount */}
              <div className="field">
                <span className="field-label">Amount (KES)</span>
                <span className="amount-value">{logAmountPaid}</span>
              </div>

              {/* Cash Delta */}
              <div className="field">
                <span className="field-label">Cash delta</span>
                <input
                  type="number"
                  placeholder="0"
                  value={logCashCollected}
                  onChange={(e) => setLogCashCollected(e.target.value)}
                  className={`delta-value ${parseFloat(logCashCollected) > 0 ? 'active' : ''}`}
                  style={{ width: '80px', border: 'none', background: 'transparent', textAlign: 'right', outline: 'none' }}
                />
              </div>

              {/* Customer / Delivery Link */}
              <div className="link-row">
                <button
                  type="button"
                  onClick={() => setShowOptionalDetails(!showOptionalDetails)}
                >
                  {showOptionalDetails ? 'Hide details' : '+ Add customer / delivery details'}
                </button>
              </div>

              {showOptionalDetails && (
                <div style={{ padding: '8px 0 12px 0' }}>
                  <div className="field">
                    <span className="field-label">Buyer Name</span>
                    <input
                      type="text"
                      placeholder="e.g. John"
                      value={logCustomerName}
                      onChange={(e) => setLogCustomerName(e.target.value)}
                      style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter' }}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">Phone</span>
                    <input
                      type="tel"
                      placeholder="e.g. 0712345678"
                      value={logCustomerPhone}
                      onChange={(e) => setLogCustomerPhone(e.target.value)}
                      style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter' }}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">Destination</span>
                    <input
                      type="text"
                      placeholder="e.g. Nakuru"
                      value={logDestination}
                      onChange={(e) => setLogDestination(e.target.value)}
                      style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter' }}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">Notes</span>
                    <input
                      type="text"
                      placeholder="Special packaging..."
                      value={logNotes}
                      onChange={(e) => setLogNotes(e.target.value)}
                      style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter' }}
                    />
                  </div>
                </div>
              )}

              <button type="submit" className="submit" disabled={isPending}>
                Log sale & dispatch jersey
              </button>
            </form>
          </div>

          {/* Right Column: Available Stock Ledger */}
          <div className="card">
            <div className="ledger-head">
              <span className="title">Available stock</span>
              <div className="cat-select-wrap">
                <span className="scope">{activeLocation.name}</span>
                <select
                  className="cat-select"
                  value={stockViewCategory}
                  onChange={(e) => setStockViewCategory(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {availableCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              {availableCategories
                .filter(cat => stockViewCategory === 'all' || stockViewCategory === cat)
                .map(cat => {
                  const catItems = stockOnHand.filter(s => s.location_id === selectedLocationId && s.category === cat);
                  if (catItems.length === 0) return null;

                  const colors = [...new Set(catItems.map(c => c.color || 'Standard'))];

                  return (
                    <div key={cat} className="category-block">
                      <div className="category-title">{cat}</div>

                      {colors.map(col => {
                        const colItems = catItems.filter(c => (c.color || 'Standard') === col);

                        return (
                          <div key={col} className="color-row">
                            <span className="color-name">{col}</span>
                            <div className="size-figures">
                              {colItems.map(item => {
                                const isZero = item.stock_on_hand <= 0;
                                const isLow = item.stock_on_hand <= item.low_stock_threshold && !isZero;

                                return (
                                  <span
                                    key={item.sku}
                                    className={`${isLow ? 'low' : ''} ${isZero ? 'zero' : ''}`}
                                    onClick={() => {
                                      setSelectedCategory(cat);
                                      setSelectedColor(col);
                                      setSelectedSize(item.size || 'None');
                                    }}
                                    title="Click to select in form"
                                  >
                                    {item.size || 'Std'} <b>{item.stock_on_hand}</b>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: STOCK & CATALOG */}
      {/* ========================================================================= */}
      {activeTab === 'stock' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Warehouse Stock-In */}
          <div className="card">
            <div className="card-head">Warehouse stock-in</div>
            <form className="form" onSubmit={handleStockInSubmit}>
              <div className="field">
                <span className="field-label">Select SKU</span>
                <select
                  className="plain"
                  value={stockInSku}
                  onChange={(e) => setStockInSku(e.target.value)}
                  required
                >
                  {catalog.map(c => (
                    <option key={c.sku} value={c.sku}>{c.sku} ({c.price} KES)</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <span className="field-label">Quantity</span>
                <input
                  type="number"
                  min="1"
                  value={stockInQty}
                  onChange={(e) => setStockInQty(parseInt(e.target.value, 10) || 0)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontFamily: 'IBM Plex Mono', fontSize: '14px' }}
                  required
                />
              </div>

              <div className="field">
                <span className="field-label">Notes</span>
                <input
                  type="text"
                  value={stockInNotes}
                  onChange={(e) => setStockInNotes(e.target.value)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter' }}
                />
              </div>

              <button type="submit" className="submit" disabled={isPending}>
                Record warehouse stock-in
              </button>
            </form>
          </div>

          {/* Stock Transfer */}
          <div className="card">
            <div className="card-head">Stock transfer to tent</div>
            <form className="form" onSubmit={handleTransferSubmit}>
              <div className="field">
                <span className="field-label">Select SKU</span>
                <select
                  className="plain"
                  value={transferSku}
                  onChange={(e) => setTransferSku(e.target.value)}
                  required
                >
                  {catalog.map(c => (
                    <option key={c.sku} value={c.sku}>{c.sku} ({c.price} KES)</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <span className="field-label">Destination</span>
                <select
                  className="plain"
                  value={transferDestLocation}
                  onChange={(e) => setTransferDestLocation(e.target.value)}
                  required
                >
                  {locations.filter(l => l.type === 'event').map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <span className="field-label">Quantity</span>
                <input
                  type="number"
                  min="1"
                  value={transferQty}
                  onChange={(e) => setTransferQty(parseInt(e.target.value, 10) || 0)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontFamily: 'IBM Plex Mono', fontSize: '14px' }}
                  required
                />
              </div>

              <div className="field">
                <span className="field-label">Notes</span>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter' }}
                />
              </div>

              <button type="submit" className="submit" disabled={isPending}>
                Dispatch transfer to tent
              </button>
            </form>
          </div>

          {/* Catalog & OG Pricing */}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-head">SKU catalog & baseline OG pricing</div>
            <div style={{ padding: '0 0 12px 0' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Color / Size</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map(c => (
                    <tr key={c.sku}>
                      <td className="mono" style={{ fontWeight: 600 }}>{c.sku}</td>
                      <td>{c.category}</td>
                      <td>{c.color || 'Std'} / {c.size || 'None'}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{c.price.toLocaleString()} KES</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CSV IMPORT */}
      {/* ========================================================================= */}
      {activeTab === 'importer' && (
        <div className="card">
          <div className="card-head">Batch CSV orders ingest</div>
          <div className="form">
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px 0' }}>
              Upload CSV exports from TikoHub or Shopify. The system automatically extracts prefixes, truncates IDs to 5 characters, and expands multi-unit orders.
            </p>

            <div className="field" style={{ display: 'block' }}>
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVFileChange}
                style={{ fontSize: '13px', width: '100%', cursor: 'pointer' }}
              />
            </div>

            {parseResult && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '13px', marginBottom: '12px' }}>
                  Identified: <strong>{parseResult.totalOrders} orders</strong> ({parseResult.totalUnits} units expanded).
                </div>

                <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Prefix & Ref</th>
                        <th>SKU</th>
                        <th>Amount</th>
                        <th>Customer</th>
                        <th>Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.orders.map((o, idx) => (
                        <tr key={idx}>
                          <td className="mono" style={{ fontWeight: 600 }}>{o.source_prefix}-{o.order_ref}</td>
                          <td>{o.original_sku}</td>
                          <td className="mono">{o.amount_paid} KES</td>
                          <td>{o.customer_name || 'N/A'}</td>
                          <td>{o.unit_index}/{o.total_units}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={handleImportExecute}
                  className="submit"
                  disabled={isPending}
                >
                  Write {parseResult.orders.length} orders to database
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: RECONCILIATION */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div>
          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-head">Category reconciliation</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Ordered</th>
                  <th>Dispatched</th>
                  <th>Swaps</th>
                  <th style={{ textAlign: 'right' }}>Cash delta</th>
                </tr>
              </thead>
              <tbody>
                {reportCategoryBreakdown.map(r => (
                  <tr key={r.category}>
                    <td style={{ fontWeight: 500 }}>{r.category}</td>
                    <td>{r.ordered} pcs</td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>{r.dispatched} pcs</td>
                    <td>{r.swaps}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>+{r.cashDelta.toLocaleString()} KES</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-head">Ordered vs. Dispatched audit matrix</div>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Customer</th>
                    <th>Ordered SKU</th>
                    <th>Handed over</th>
                    <th>Cash delta</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedOrders.map(o => (
                    <tr key={o.id}>
                      <td className="mono" style={{ fontWeight: 600 }}>{o.source_prefix}-{o.order_ref}</td>
                      <td>{o.customer_name || 'Walk-up'}</td>
                      <td style={{ fontSize: '12px' }}>{o.original_sku}</td>
                      <td style={{ fontSize: '12px', fontWeight: 600 }}>{o.fulfillment?.actual_sku || '—'}</td>
                      <td className="mono">+{o.fulfillment?.cash_collected || 0} KES</td>
                      <td>{o.fulfillment ? (locations.find(l => l.id === o.fulfillment?.location_id)?.name.split(' ')[0] || o.fulfillment?.location_id) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-head">Developer reset</div>
            <div className="form">
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 14px 0' }}>
                Reset orders, fulfillments, and stock ledger to clean standard seeds.
              </p>
              <button
                type="button"
                onClick={handleDbReset}
                className="submit"
                style={{ background: 'var(--amber)', width: 'auto', padding: '8px 16px' }}
              >
                Reset database
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap Modal */}
      {swapModalOpen && swapOrder && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="card-head" style={{ padding: 0, marginBottom: '16px' }}>
              <span>Swap / upgrade SKU</span>
              <button
                onClick={() => setSwapModalOpen(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '13px' }}
              >
                Cancel
              </button>
            </div>

            <div className="field">
              <span className="field-label">Order Ref</span>
              <span className="mono" style={{ fontWeight: 600 }}>{swapOrder.source_prefix}-{swapOrder.order_ref}</span>
            </div>

            <div className="field">
              <span className="field-label">Replacement SKU</span>
              <select
                className="plain"
                value={selectedSwapSku}
                onChange={(e) => setSelectedSwapSku(e.target.value)}
              >
                {catalog.map(c => (
                  <option key={c.sku} value={c.sku}>{c.sku} ({c.price} KES)</option>
                ))}
              </select>
            </div>

            <div className="field">
              <span className="field-label">Price delta</span>
              <span className="mono" style={{ fontWeight: 600 }}>+{computedSwapDelta} KES</span>
            </div>

            <div className="field">
              <span className="field-label">Cash collected</span>
              <input
                type="number"
                placeholder={computedSwapDelta.toString()}
                value={swapCashOverride}
                onChange={(e) => setSwapCashOverride(e.target.value)}
                style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontFamily: 'IBM Plex Mono', fontSize: '14px' }}
              />
            </div>

            <button type="button" onClick={handleSwapSubmit} className="submit" style={{ marginTop: '16px' }}>
              Confirm swap & dispatch
            </button>
          </div>
        </div>
      )}

      <div className="footer-credit">
        Fulfilled by Griphine &middot; Event Inventory & Dispatch System
      </div>
    </div>
  );
}
