'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import {
  getLocationsAction,
  getOrderPrefixesAction,
  updateOrderPrefixLabelAction,
  getCatalogAction,
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
  StockOnHandItem,
  StaffProfile
} from '../lib/db';
import { parseTikoHubCSV, ParseResult } from '../lib/csvParser';
import {
  enqueueOfflineAction,
  getOfflineQueue,
  syncOfflineQueue,
  clearOfflineQueue
} from '../lib/offlineQueue';

const STAFF_PROFILES: StaffProfile[] = [
  { id: 'staff-winston', name: 'Winston (Admin)', role: 'admin', assigned_location_ids: ['*'] },
  { id: 'staff-sarah', name: 'Sarah (Warehouse)', role: 'warehouse', assigned_location_ids: ['wh-main'] },
  { id: 'staff-mwai', name: 'Mwai (SportPesa 7s)', role: 'event_staff', assigned_location_ids: ['evt-sp7s'] },
  { id: 'staff-george', name: 'George (Driftwood 7s)', role: 'event_staff', assigned_location_ids: ['evt-driftwood'] }
];

export default function Dashboard() {
  // Navigation & Tenant Scoping
  const [activeTab, setActiveTab] = useState<'fulfillment' | 'stock' | 'importer' | 'reports'>('fulfillment');
  const [currentStaff, setCurrentStaff] = useState<StaffProfile>(STAFF_PROFILES[0]);
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
  const [syncStatusText, setSyncStatusText] = useState<string>('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'fulfilled'>('all');

  // Modals
  const [swapModalOpen, setSwapModalOpen] = useState<boolean>(false);
  const [swapOrder, setSwapOrder] = useState<Order | null>(null);
  const [selectedSwapSku, setSelectedSwapSku] = useState<string>('');
  const [swapCashOverride, setSwapCashOverride] = useState<string>('');
  const [swapOverrideReason, setSwapOverrideReason] = useState<string>('');
  const [swapChannel, setSwapChannel] = useState<'Event' | 'Card'>('Event');
  const [swapNotes, setSwapNotes] = useState<string>('');

  const [walkUpModalOpen, setWalkUpModalOpen] = useState<boolean>(false);
  const [walkUpPrefix, setWalkUpPrefix] = useState<string>('MANUAL');
  const [walkUpRef, setWalkUpRef] = useState<string>('');
  const [walkUpOrigSku, setWalkUpOrigSku] = useState<string>('');
  const [walkUpActualSku, setWalkUpActualSku] = useState<string>('');
  const [walkUpPaid, setWalkUpPaid] = useState<string>('2500');
  const [walkUpCashDelta, setWalkUpCashDelta] = useState<string>('0');
  const [walkUpCustomerName, setWalkUpCustomerName] = useState<string>('');
  const [walkUpCustomerPhone, setWalkUpCustomerPhone] = useState<string>('');
  const [walkUpChannel, setWalkUpChannel] = useState<'Event' | 'Card'>('Event');
  const [walkUpNotes, setWalkUpNotes] = useState<string>('');

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
        if (!walkUpOrigSku) setWalkUpOrigSku(cats[0].sku);
        if (!walkUpActualSku) setWalkUpActualSku(cats[0].sku);
      }
    } catch (err) {
      console.error("Error loading application data:", err);
    }
  };

  // Staff Profile Selector
  const handleStaffChange = (staffId: string) => {
    const staff = STAFF_PROFILES.find(s => s.id === staffId) || STAFF_PROFILES[0];
    setCurrentStaff(staff);
    if (!staff.assigned_location_ids.includes('*')) {
      setSelectedLocationId(staff.assigned_location_ids[0]);
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
    setSyncStatusText('Syncing offline transactions...');

    try {
      const res = await syncOfflineQueue((index, total) => {
        setSyncStatusText(`Syncing transaction ${index} of ${total}...`);
      });

      if (res.success) {
        setSyncStatusText('All offline transactions synced!');
        setTimeout(() => setSyncStatusText(''), 3000);
      } else {
        setSyncStatusText(`Sync complete with ${res.errors.length} errors.`);
        alert(`Sync Errors:\n${res.errors.join('\n')}`);
      }
    } catch (err) {
      console.error(err);
      setSyncStatusText('Sync failed.');
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

  // Orders Map & Join with Fulfillments
  const enrichedOrders = useMemo(() => {
    return orders.map(ord => {
      const ful = fulfillments.find(f => f.order_id === ord.id);
      return {
        ...ord,
        fulfillment: ful
      };
    });
  }, [orders, fulfillments]);

  // Filtered Orders for Fulfillment Tab
  const filteredOrders = useMemo(() => {
    let list = enrichedOrders;

    if (statusFilter !== 'all') {
      list = list.filter(o => o.status === statusFilter);
    }

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(o => 
        o.order_ref.toLowerCase().includes(q) ||
        `${o.source_prefix}-${o.order_ref}`.toLowerCase().includes(q) ||
        o.original_sku.toLowerCase().includes(q) ||
        (o.fulfillment?.actual_sku && o.fulfillment.actual_sku.toLowerCase().includes(q)) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
        (o.customer_phone && o.customer_phone.toLowerCase().includes(q))
      );
    }

    return list;
  }, [enrichedOrders, statusFilter, searchQuery]);

  // COLLISION DETECTION: Check if search query matches multiple orders with same order_ref across different prefixes
  const collisionMatches = useMemo(() => {
    if (!searchQuery || searchQuery.trim().length < 3) return null;
    const cleanQ = searchQuery.trim().toUpperCase();

    const matchingPending = orders.filter(o => o.status === 'pending' && o.order_ref.toUpperCase().includes(cleanQ));
    const refGroups = new Map<string, Order[]>();

    for (const ord of matchingPending) {
      const existing = refGroups.get(ord.order_ref) || [];
      existing.push(ord);
      refGroups.set(ord.order_ref, existing);
    }

    for (const [ref, group] of Array.from(refGroups.entries())) {
      const prefixesInGroup = new Set(group.map(g => g.source_prefix));
      if (prefixesInGroup.size > 1) {
        return {
          collidingRef: ref,
          orders: group
        };
      }
    }

    return null;
  }, [searchQuery, orders]);

  // Event KPIs (Derived dynamically)
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

  // Handle 1-Tap Exact Fulfillment
  const handleFulfillExact = async (order: Order) => {
    const payload = {
      orderId: order.id,
      sourcePrefix: order.source_prefix,
      orderRef: order.order_ref,
      originalSku: order.original_sku,
      actualSku: order.original_sku,
      priceDelta: 0,
      cashCollected: 0,
      overrideReason: null,
      locationId: selectedLocationId,
      staffId: currentStaff.name,
      notes: 'Standard exact fulfillment'
    };

    const optimisticFulfillment: Fulfillment = {
      id: 'temp-ful-' + Date.now(),
      order_id: order.id,
      source_prefix: order.source_prefix,
      order_ref: order.order_ref,
      original_sku: order.original_sku,
      actual_sku: order.original_sku,
      price_delta: 0,
      cash_collected: 0,
      override_reason: null,
      location_id: selectedLocationId,
      staff_id: currentStaff.name,
      notes: 'Standard exact fulfillment',
      fulfilled_at: new Date().toISOString()
    };

    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'fulfilled' } : o));
    setFulfillments(prev => [optimisticFulfillment, ...prev]);

    setStockOnHand(prev => prev.map(s => 
      s.location_id === selectedLocationId && s.sku === order.original_sku
        ? { ...s, stock_on_hand: s.stock_on_hand - 1 }
        : s
    ));

    if (isOnline) {
      try {
        await fulfillOrderAction(payload);
        loadAllData();
      } catch (err) {
        console.warn("Online dispatch failed, queuing offline:", err);
        enqueueOfflineAction('fulfill', payload);
        updateQueueCount();
      }
    } else {
      enqueueOfflineAction('fulfill', payload);
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

  // Computed Auto Cash Delta for Swap
  const computedSwapDelta = useMemo(() => {
    if (!swapOrder || !selectedSwapSku) return 0;
    const origPrice = catalog.find(c => c.sku === swapOrder.original_sku)?.price || 0;
    const actPrice = catalog.find(c => c.sku === selectedSwapSku)?.price || 0;
    return actPrice - origPrice;
  }, [swapOrder, selectedSwapSku, catalog]);

  // Final Cash Collected
  const finalCashCollected = useMemo(() => {
    if (swapCashOverride.trim() !== '') {
      const parsed = parseFloat(swapCashOverride);
      return isNaN(parsed) ? 0 : parsed;
    }
    return computedSwapDelta;
  }, [swapCashOverride, computedSwapDelta]);

  // Submit Swap
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
      staffId: currentStaff.name,
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
      staff_id: currentStaff.name,
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
        console.warn("Online swap failed, queuing offline:", err);
        enqueueOfflineAction('fulfill', payload);
        updateQueueCount();
      }
    } else {
      enqueueOfflineAction('fulfill', payload);
      updateQueueCount();
    }
  };

  // Open Walk-Up Modal
  const openWalkUpModal = () => {
    setWalkUpRef('');
    setWalkUpPrefix('MANUAL');
    if (catalog.length > 0) {
      setWalkUpOrigSku(catalog[0].sku);
      setWalkUpActualSku(catalog[0].sku);
      setWalkUpPaid(catalog[0].price.toString());
    }
    setWalkUpCashDelta('0');
    setWalkUpCustomerName('');
    setWalkUpCustomerPhone('');
    setWalkUpChannel('Event');
    setWalkUpNotes('');
    setWalkUpModalOpen(true);
  };

  const handleWalkUpOrigSkuChange = (sku: string) => {
    setWalkUpOrigSku(sku);
    const cat = catalog.find(c => c.sku === sku);
    if (cat) {
      setWalkUpPaid(cat.price.toString());
    }
    const origPrice = cat?.price || 0;
    const actPrice = catalog.find(c => c.sku === walkUpActualSku)?.price || 0;
    setWalkUpCashDelta((actPrice - origPrice).toString());
  };

  const handleWalkUpActualSkuChange = (sku: string) => {
    setWalkUpActualSku(sku);
    const origPrice = catalog.find(c => c.sku === walkUpOrigSku)?.price || 0;
    const actPrice = catalog.find(c => c.sku === sku)?.price || 0;
    setWalkUpCashDelta((actPrice - origPrice).toString());
  };

  const handleWalkUpSubmit = async () => {
    if (!walkUpRef.trim()) {
      alert("Please enter a truncated Order ID (e.g. 04CA7).");
      return;
    }

    const payload = {
      sourcePrefix: walkUpPrefix || 'MANUAL',
      orderRef: walkUpRef.trim().toUpperCase(),
      originalSku: walkUpOrigSku,
      actualSku: walkUpActualSku,
      amountPaid: parseFloat(walkUpPaid) || 0,
      cashCollected: parseFloat(walkUpCashDelta) || 0,
      overrideReason: null,
      locationId: selectedLocationId,
      staffId: currentStaff.name,
      customerName: walkUpCustomerName.trim() || null,
      customerPhone: walkUpCustomerPhone.trim() || null,
      channel: walkUpChannel,
      notes: walkUpNotes.trim() || 'Tent Walk-Up Entry'
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
      price_delta: payload.cashCollected,
      cash_collected: payload.cashCollected,
      override_reason: null,
      location_id: selectedLocationId,
      staff_id: currentStaff.name,
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

    setWalkUpModalOpen(false);

    if (isOnline) {
      try {
        await quickWalkUpFulfillAction(payload);
        loadAllData();
      } catch (err) {
        console.warn("Online walk-up failed, queuing offline:", err);
        enqueueOfflineAction('walkup', payload);
        updateQueueCount();
      }
    } else {
      enqueueOfflineAction('walkup', payload);
      updateQueueCount();
    }
  };

  // Submit Warehouse Stock-In
  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockInSku || stockInQty <= 0) return;

    startTransition(async () => {
      try {
        await logWarehouseStockInAction(stockInSku, stockInQty, 'wh-main', currentStaff.name, stockInNotes);
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
          currentStaff.name,
          transferNotes
        );
        const destName = locations.find(l => l.id === transferDestLocation)?.name || transferDestLocation;
        alert(`Stock Dispatched: ${transferQty} units of ${transferSku} allocated from Warehouse to ${destName}.`);
        loadAllData();
      } catch (err) {
        alert(`Transfer failed: ${(err as Error).message}`);
      }
    });
  };

  // CSV Importer: File load
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

  // Execute CSV Import
  const handleImportExecute = () => {
    if (!parseResult || parseResult.orders.length === 0) return;

    startTransition(async () => {
      try {
        const res = await importTikoHubOrdersAction(parseResult.orders, currentStaff.name);
        const prefixMsg = res.prefixesCreated.length > 0 
          ? `\nRegistered ${res.prefixesCreated.length} new source prefix(es): ${res.prefixesCreated.join(', ')}`
          : '';

        alert(`Import Complete!\n\nSuccessfully created: ${res.inserted} orders.\nIgnored duplicates: ${res.duplicates} rows.${prefixMsg}`);
        setCsvFileName('');
        setParseResult(null);
        loadAllData();
        setActiveTab('fulfillment');
      } catch (err) {
        alert(`Import failed: ${(err as Error).message}`);
      }
    });
  };

  // Save Prefix Label Edit
  const handleSavePrefixLabel = async (prefix: string) => {
    try {
      await updateOrderPrefixLabelAction(prefix, editingPrefixLabel);
      setPrefixes(prev => prev.map(p => p.prefix === prefix ? { ...p, label: editingPrefixLabel } : p));
      setEditingPrefix(null);
    } catch (err) {
      alert("Failed to update prefix label.");
    }
  };

  // Database Reset
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

  // Reconciliation & Category Breakdown
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
      {/* iOS Header (Matches HIG) */}
      <header className="ios-header">
        <div className="branding">
          <div className="pre-title">Fulfilled By Griphine</div>
          <h1>
            {activeTab === 'fulfillment' && 'Fulfillment Tent'}
            {activeTab === 'stock' && 'Stock & Allocation'}
            {activeTab === 'importer' && 'CSV Importer'}
            {activeTab === 'reports' && 'Reconciliation & Audit'}
          </h1>
        </div>

        <div className="header-controls">
          <div className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
            <span className="status-dot"></span>
            {isOnline ? 'Online' : 'Offline'}
          </div>

          <select
            className={`tenant-selector ${activeLocation.type === 'event' ? 'event-scoped' : ''}`}
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            disabled={!currentStaff.assigned_location_ids.includes('*') && currentStaff.assigned_location_ids.length === 1}
            title="Active Location"
          >
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>
                {loc.type === 'warehouse' ? '🏢 ' : '🎪 '}
                {loc.name}
              </option>
            ))}
          </select>

          <select
            className="staff-selector"
            value={currentStaff.id}
            onChange={(e) => handleStaffChange(e.target.value)}
            title="Staff Profile"
          >
            {STAFF_PROFILES.map(s => (
              <option key={s.id} value={s.id}>
                👤 {s.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* iOS Segmented Navigation Tabs */}
      <nav className="tabs-nav">
        <button
          onClick={() => setActiveTab('fulfillment')}
          className={`tab-btn ${activeTab === 'fulfillment' ? 'active' : ''}`}
        >
          ⚡ Fulfillment
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
        >
          📦 Stock & Dispatch
        </button>
        <button
          onClick={() => setActiveTab('importer')}
          className={`tab-btn ${activeTab === 'importer' ? 'active' : ''}`}
        >
          📥 CSV Import
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
        >
          📊 Reconciliation
        </button>
      </nav>

      {/* Offline Alert Banner */}
      {queueSize > 0 && (
        <div className="alert-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div>
              <strong>{queueSize} offline transaction{queueSize > 1 ? 's' : ''} queued!</strong>
              <div style={{ fontSize: '11px', color: 'var(--label-secondary)' }}>
                {syncStatusText || 'Saved locally in tent queue. Ready to sync to server.'}
              </div>
            </div>
          </div>
          {isOnline && (
            <button
              onClick={handleManualSync}
              className="btn green small"
              disabled={isSyncing}
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: FULFILLMENT STATION */}
      {/* ========================================================================= */}
      {activeTab === 'fulfillment' && (
        <div>
          {/* Event Metrics Card */}
          <div className="section-title">Event Overview &middot; {activeLocation.name}</div>
          <div className="event-metrics">
            <div className="metric-item">
              <span className="metric-lbl">Dispatched</span>
              <span className="metric-val" style={{ color: 'var(--success)' }}>
                {eventMetrics.fulfilledCount} / {eventMetrics.totalOrdersCount}
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-lbl">Pending</span>
              <span className="metric-val" style={{ color: 'var(--warning)' }}>
                {eventMetrics.pendingCount}
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-lbl">Cash Delta</span>
              <span className="metric-val" style={{ color: 'var(--accent)' }}>
                +{eventMetrics.totalCashDelta.toLocaleString()} KES
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-lbl">Tent Stock</span>
              <span className="metric-val" style={{ color: eventMetrics.eventStockTotal < 15 ? 'var(--destructive)' : 'var(--label-primary)' }}>
                {eventMetrics.eventStockTotal} pcs
              </span>
            </div>
          </div>

          {/* Search Bar (iOS Inset) */}
          <div className="search-container">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search 5-char code (e.g. 04CA7, JW6FU), SKU, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="search-clear-btn">✕</button>
            )}
          </div>

          {/* Actions & Filters */}
          <div style={{ display: 'flex', gap: '8px', margin: '0 16px 12px 16px', alignItems: 'center' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="tenant-selector"
              style={{ flex: 1 }}
            >
              <option value="all">All Orders ({enrichedOrders.length})</option>
              <option value="pending">Pending Pickup ({eventMetrics.pendingCount})</option>
              <option value="fulfilled">Collected ({enrichedOrders.length - eventMetrics.pendingCount})</option>
            </select>

            <button
              onClick={openWalkUpModal}
              className="btn small"
              style={{ flexShrink: 0, padding: '0 14px', height: '36px', fontSize: '13px' }}
            >
              + Walk-Up Sale
            </button>
          </div>

          {/* COLLISION DISAMBIGUATION ALERT (Only on conflict) */}
          {collisionMatches && (
            <div className="collision-box">
              <div className="collision-title">
                <span>⚡ Code Collision: #{collisionMatches.collidingRef}</span>
              </div>
              <div className="collision-subtitle">
                Multiple orders share this 5-character ID across different sources. Please select the matching customer:
              </div>

              <div className="collision-grid">
                {collisionMatches.orders.map(cOrder => (
                  <div key={cOrder.id} className="collision-card-item">
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span className={`prefix-tag ${getPrefixClass(cOrder.source_prefix)}`}>
                          {cOrder.source_prefix}-{cOrder.order_ref}
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--label-primary)', fontSize: '13px' }}>
                          {cOrder.amount_paid} KES
                        </span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--label-primary)' }}>
                        👤 {cOrder.customer_name || 'Walk-up Customer'}
                      </div>
                      {cOrder.customer_phone && (
                        <div style={{ fontSize: '12px', color: 'var(--label-secondary)' }}>
                          📞 {cOrder.customer_phone}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: 'var(--label-secondary)', marginTop: '4px' }}>
                        👕 {cOrder.original_sku}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleFulfillExact(cOrder)}
                        className="btn green small"
                        style={{ flex: 1 }}
                      >
                        ✓ Fulfill Exact
                      </button>
                      <button
                        onClick={() => openSwapModal(cOrder)}
                        className="btn secondary small"
                      >
                        ⇄ Swap
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Orders Grouped List */}
          <div className="section-title">Matching Orders ({filteredOrders.length})</div>
          {filteredOrders.length === 0 ? (
            <div className="card">
              <div className="result-empty">
                No matching orders found.<br />
                Search a 5-char code or tap <strong>+ Walk-Up Sale</strong>.
              </div>
            </div>
          ) : (
            <div className="list-group">
              {filteredOrders.map(order => {
                const isFulfilled = order.status === 'fulfilled';
                const isSwap = order.fulfillment && order.fulfillment.actual_sku !== order.original_sku;
                const [cat, col, sz] = order.original_sku.split('|');

                return (
                  <div key={order.id} className="list-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`prefix-tag ${getPrefixClass(order.source_prefix)}`}>
                          {order.source_prefix}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: 'var(--accent)' }}>
                          #{order.order_ref}
                        </span>
                      </div>

                      <span className={`status-badge ${isFulfilled ? (isSwap ? 'status-Pending-Delivery' : 'status-Collected') : 'status-Uncollected'}`}>
                        {isFulfilled ? (isSwap ? 'Swapped ✓' : 'Collected ✓') : 'Pending'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2px' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--label-primary)' }}>
                          {cat} &middot; <span style={{ fontWeight: 400, color: 'var(--label-secondary)' }}>{col || 'None'}</span> &middot; <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{sz || 'None'}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--label-secondary)', marginTop: '2px' }}>
                          Paid: <strong>{order.amount_paid} KES</strong>
                          {order.customer_name && ` &middot; 👤 ${order.customer_name}`}
                          {order.customer_phone && ` (${order.customer_phone})`}
                        </div>

                        {order.fulfillment && (
                          <div style={{ fontSize: '12px', color: isSwap ? 'var(--accent)' : 'var(--success)', fontWeight: 600, marginTop: '4px' }}>
                            ↳ Handed Over: {order.fulfillment.actual_sku} {order.fulfillment.cash_collected > 0 ? `(+${order.fulfillment.cash_collected} KES)` : ''}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        {!isFulfilled ? (
                          <>
                            <button
                              onClick={() => handleFulfillExact(order)}
                              className="btn green small"
                            >
                              ✓ Fulfill
                            </button>
                            <button
                              onClick={() => openSwapModal(order)}
                              className="btn secondary small"
                            >
                              ⇄ Swap
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--label-secondary)', fontWeight: 600 }}>
                            Done
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: STOCK & ALLOCATION */}
      {/* ========================================================================= */}
      {activeTab === 'stock' && (
        <div>
          <div className="section-title">Derived Stock on Hand</div>
          <div className="card" style={{ padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 8px 16px' }}>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="tenant-selector"
              >
                <option value="all">All Categories</option>
                <option value="Fan Jersey">Fan Jerseys</option>
                <option value="Crew Neck">Crew Necks</option>
                <option value="KRU Replica">KRU Replicas</option>
                <option value="Bucket Hat">Bucket Hats</option>
                <option value="Tank Top">Tank Tops</option>
              </select>
            </div>

            <table className="stock-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>SKU Code</th>
                  <th>Price</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {stockOnHand
                  .filter(s => categoryFilter === 'all' || s.category === categoryFilter)
                  .map((item, idx) => (
                    <tr key={`${item.location_id}-${item.sku}-${idx}`}>
                      <td style={{ fontSize: '13px', fontWeight: 600 }}>
                        {item.location_type === 'warehouse' ? '🏢 ' : '🎪 '}
                        {item.location_name.split(' ')[0]}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                        {item.sku}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--label-secondary)' }}>
                        {item.price} KES
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`stock-badge ${item.stock_on_hand <= 0 ? 'zero' : item.stock_on_hand <= item.low_stock_threshold ? 'low' : 'remaining'}`}>
                          {item.stock_on_hand} pcs
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Warehouse Stock-In Form */}
          <div className="section-title">1. Warehouse Stock-In</div>
          <form onSubmit={handleStockInSubmit} className="form-group">
            <div className="form-row">
              <span className="row-label">SKU</span>
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
              <span className="row-label">Notes</span>
              <div className="row-control">
                <input
                  type="text"
                  value={stockInNotes}
                  onChange={(e) => setStockInNotes(e.target.value)}
                  placeholder="e.g. SportPesa Batch #1"
                />
              </div>
            </div>

            <div style={{ padding: '12px 16px' }}>
              <button type="submit" className="btn green" style={{ width: '100%', margin: 0 }} disabled={isPending}>
                {isPending ? 'Recording...' : 'Add Stock to Warehouse'}
              </button>
            </div>
          </form>

          {/* Stock Transfer to Event Form */}
          <div className="section-title">2. Allocate Stock to Event Tent</div>
          <form onSubmit={handleTransferSubmit} className="form-group">
            <div className="form-row">
              <span className="row-label">SKU to Transfer</span>
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
                    <option key={l.id} value={l.id}>🎪 {l.name}</option>
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
              <span className="row-label">Notes</span>
              <div className="row-control">
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="e.g. Tent replenishment"
                />
              </div>
            </div>

            <div style={{ padding: '12px 16px' }}>
              <button type="submit" className="btn" style={{ width: '100%', margin: 0 }} disabled={isPending}>
                {isPending ? 'Allocating...' : 'Dispatch to Event Tent'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CSV IMPORTER */}
      {/* ========================================================================= */}
      {activeTab === 'importer' && (
        <div>
          <div className="section-title">Ingest Shop Orders</div>
          <div className="form-group">
            <div className="form-row vertical">
              <label htmlFor="csv-file-input">Select TikoHub / Shopify CSV Export</label>
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
              <div className="section-title">Parsing Metrics</div>
              <div className="event-metrics">
                <div className="metric-item">
                  <span className="metric-lbl">Orders Identified</span>
                  <span className="metric-val">{parseResult.totalOrders}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-lbl">Expanded Units</span>
                  <span className="metric-val" style={{ color: 'var(--accent)' }}>{parseResult.totalUnits}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-lbl">Prefixes</span>
                  <span className="metric-val">{parseResult.discoveredPrefixes.join(', ') || 'ORD'}</span>
                </div>
              </div>

              {parseResult.errors.length > 0 && (
                <div className="alert-banner" style={{ borderLeftColor: 'var(--destructive)' }}>
                  <div>
                    <strong>Validation Warnings ({parseResult.errors.length}):</strong>
                    <ul style={{ paddingLeft: '16px', marginTop: '4px', fontSize: '12px' }}>
                      {parseResult.errors.map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="section-title">Preview (First 5 Rows)</div>
              <div className="card" style={{ padding: '8px 0' }}>
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Prefix & Ref</th>
                      <th>SKU</th>
                      <th>Paid</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.orders.slice(0, 5).map((o, idx) => (
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
                        <td>{o.unit_index}/{o.total_units}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleImportExecute}
                className="btn green"
                disabled={isPending || parseResult.orders.length === 0}
              >
                {isPending ? 'Importing...' : `Write ${parseResult.orders.length} Orders to Database`}
              </button>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: RECONCILIATION & AUDIT */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div>
          <div className="section-title">Category Sales Breakdown</div>
          <div className="card" style={{ padding: '8px 0' }}>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Ordered</th>
                  <th>Sent</th>
                  <th>Swaps</th>
                  <th>Cash Delta</th>
                </tr>
              </thead>
              <tbody>
                {reportCategoryBreakdown.map(row => (
                  <tr key={row.category}>
                    <td style={{ fontWeight: 600 }}>{row.category}</td>
                    <td>{row.ordered} pcs</td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>{row.dispatched} pcs</td>
                    <td>{row.swaps}</td>
                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>
                      +{row.cashDelta.toLocaleString()} KES
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-title">Ordered vs. What Went Out (Audit Matrix)</div>
          <div className="card" style={{ padding: '8px 0' }}>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Ordered</th>
                  <th>Dispatched</th>
                  <th>Delta</th>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="section-title">Data Source Prefixes</div>
          <div className="card" style={{ padding: '8px 0' }}>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Prefix</th>
                  <th>Channel Label</th>
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
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-title">Stock Movement Ledger Log</div>
          <div className="card" style={{ padding: '8px 0', maxHeight: '300px', overflowY: 'auto' }}>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Staff</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontSize: '11px', color: 'var(--label-secondary)' }}>
                      {new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ fontSize: '11px', fontWeight: 700, color: row.type === 'StockIn' ? 'var(--success)' : row.type === 'Transfer' ? 'var(--accent)' : 'var(--warning)' }}>
                      {row.type}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{row.sku}</td>
                    <td style={{ fontWeight: 700, color: row.quantity_delta > 0 ? 'var(--success)' : 'var(--destructive)' }}>
                      {row.quantity_delta > 0 ? `+${row.quantity_delta}` : row.quantity_delta}
                    </td>
                    <td style={{ fontSize: '11px', color: 'var(--label-secondary)' }}>{row.staff_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ borderLeft: '4px solid var(--destructive)' }}>
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
      {/* MODAL: SWAP SKU (iOS Bottom Sheet) */}
      {/* ========================================================================= */}
      {swapModalOpen && swapOrder && (
        <div className="modal">
          <div className="modal-content">
            <div className="card-title">
              <span>⇄ Swap / Upgrade SKU</span>
              <button onClick={() => setSwapModalOpen(false)} className="btn small secondary">Cancel</button>
            </div>

            <div className="form-group" style={{ margin: '0 0 16px 0' }}>
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
                <span className="row-label">Replacement</span>
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

            <div className="form-group" style={{ margin: '0 0 16px 0' }}>
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
                <span className="row-label">Channel</span>
                <div className="row-control">
                  <select
                    value={swapChannel}
                    onChange={(e) => setSwapChannel(e.target.value as any)}
                  >
                    <option value="Event">Event Tent (M-Pesa / Cash)</option>
                    <option value="Card">PDQ Terminal Card Payment</option>
                  </select>
                </div>
              </div>

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

            <button onClick={handleSwapSubmit} className="btn" style={{ width: '100%', margin: 0 }}>
              Confirm Swap & Hand Over
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: WALK-UP DIRECT SALE (iOS Bottom Sheet) */}
      {/* ========================================================================= */}
      {walkUpModalOpen && (
        <div className="modal">
          <div className="modal-content">
            <div className="card-title">
              <span>⚡ Walk-Up Direct Sale</span>
              <button onClick={() => setWalkUpModalOpen(false)} className="btn small secondary">Cancel</button>
            </div>

            <div className="form-group" style={{ margin: '0 0 16px 0' }}>
              <div className="form-row">
                <span className="row-label">Source Prefix</span>
                <div className="row-control">
                  <select value={walkUpPrefix} onChange={(e) => setWalkUpPrefix(e.target.value)}>
                    {prefixes.map(p => (
                      <option key={p.prefix} value={p.prefix}>{p.prefix}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <span className="row-label">Order Code</span>
                <div className="row-control">
                  <input
                    type="text"
                    placeholder="5-char code (e.g. 04CA7)"
                    value={walkUpRef}
                    onChange={(e) => setWalkUpRef(e.target.value.toUpperCase())}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <span className="row-label">Ordered SKU</span>
                <div className="row-control">
                  <select value={walkUpOrigSku} onChange={(e) => handleWalkUpOrigSkuChange(e.target.value)}>
                    {catalog.map(c => (
                      <option key={c.sku} value={c.sku}>{c.sku} — {c.price} KES</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <span className="row-label">Handed Over</span>
                <div className="row-control">
                  <select value={walkUpActualSku} onChange={(e) => handleWalkUpActualSkuChange(e.target.value)}>
                    {catalog.map(c => (
                      <option key={c.sku} value={c.sku}>{c.sku} — {c.price} KES</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <span className="row-label">Paid (KES)</span>
                <div className="row-control">
                  <input
                    type="number"
                    value={walkUpPaid}
                    onChange={(e) => setWalkUpPaid(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <span className="row-label">Cash Delta</span>
                <div className="row-control">
                  <input
                    type="number"
                    value={walkUpCashDelta}
                    onChange={(e) => setWalkUpCashDelta(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <span className="row-label">Customer</span>
                <div className="row-control">
                  <input
                    type="text"
                    placeholder="Name (Optional)"
                    value={walkUpCustomerName}
                    onChange={(e) => setWalkUpCustomerName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <span className="row-label">Phone</span>
                <div className="row-control">
                  <input
                    type="text"
                    placeholder="07XXXXXXXX"
                    value={walkUpCustomerPhone}
                    onChange={(e) => setWalkUpCustomerPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <button onClick={handleWalkUpSubmit} className="btn green" style={{ width: '100%', margin: 0 }}>
              Log Sale & Hand Over
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer-bar">
        Fulfilled By Griphine &middot; Append-Only Ledger &middot; Apple HIG System
      </footer>
    </main>
  );
}
