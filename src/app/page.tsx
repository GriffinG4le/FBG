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

    // Group pending orders by order_ref
    const matchingPending = orders.filter(o => o.status === 'pending' && o.order_ref.toUpperCase().includes(cleanQ));
    const refGroups = new Map<string, Order[]>();

    for (const ord of matchingPending) {
      const existing = refGroups.get(ord.order_ref) || [];
      existing.push(ord);
      refGroups.set(ord.order_ref, existing);
    }

    // Find any group with > 1 distinct prefixes
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

    // Optimistic UI update
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

  // Helper to render prefix tag CSS class
  const getPrefixClass = (p: string) => {
    const clean = p.toLowerCase();
    if (['ord', 'sh', 'tkh', 'manual'].includes(clean)) return clean;
    return 'custom';
  };

  return (
    <main className="app-wrapper">
      {/* Top Header & Multi-Tenant Control Bar */}
      <header className="top-bar">
        <div className="branding-group">
          <div className="logo-badge">FBG</div>
          <div className="brand-text">
            <h1>Fulfilled By Griphine</h1>
            <span>Warehouse & Multi-Tenant Event Dispatch</span>
          </div>
        </div>

        <div className="controls-group">
          {/* Online / Offline Status */}
          <div className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
            <span className="status-dot"></span>
            {isOnline ? 'Online' : 'Offline Mode'}
          </div>

          {/* Location Selector (Tenant Scoping) */}
          <select
            className={`tenant-selector ${activeLocation.type === 'event' ? 'event-scoped' : ''}`}
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            disabled={!currentStaff.assigned_location_ids.includes('*') && currentStaff.assigned_location_ids.length === 1}
            title="Select Active Location / Event Tenant"
          >
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>
                {loc.type === 'warehouse' ? '🏢 ' : '🎪 '}
                {loc.name}
              </option>
            ))}
          </select>

          {/* Staff Selector */}
          <select
            className="staff-selector"
            value={currentStaff.id}
            onChange={(e) => handleStaffChange(e.target.value)}
            title="Current Operator Profile"
          >
            {STAFF_PROFILES.map(s => (
              <option key={s.id} value={s.id}>
                👤 {s.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Offline Queue Sync Alert Banner */}
      {queueSize > 0 && (
        <div className="queue-alert-banner">
          <div>
            <strong style={{ color: 'var(--warning)' }}>⚠️ {queueSize} Offline Action{queueSize > 1 ? 's' : ''} Queued</strong>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {syncStatusText || 'Transactions saved locally in tent offline store. Ready to sync.'}
            </div>
          </div>
          {isOnline && (
            <button
              onClick={handleManualSync}
              className="btn btn-warning btn-sm"
              disabled={isSyncing}
            >
              {isSyncing ? 'Syncing...' : 'Sync Now ⚡'}
            </button>
          )}
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="tabs-nav">
        <button
          onClick={() => setActiveTab('fulfillment')}
          className={`tab-btn ${activeTab === 'fulfillment' ? 'active' : ''}`}
        >
          ⚡ Fulfillment Tent
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
        >
          📦 Stock & Allocation
        </button>
        <button
          onClick={() => setActiveTab('importer')}
          className={`tab-btn ${activeTab === 'importer' ? 'active' : ''}`}
        >
          📥 CSV Importer
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
        >
          📊 Reconciliation & Audit
        </button>
      </nav>

      {/* ========================================================================= */}
      {/* TAB 1: FULFILLMENT STATION (THE TENT WORKHORSE) */}
      {/* ========================================================================= */}
      {activeTab === 'fulfillment' && (
        <div>
          {/* Live KPI Metric Cards */}
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-title">Tent Location</span>
              <span className="stat-val" style={{ fontSize: '16px', color: 'var(--accent)' }}>
                {activeLocation.name}
              </span>
              <span className="stat-sub">{activeLocation.type.toUpperCase()} SCOPE</span>
            </div>
            <div className="stat-card">
              <span className="stat-title">Dispatched Units</span>
              <span className="stat-val" style={{ color: 'var(--success)' }}>
                {eventMetrics.fulfilledCount}
              </span>
              <span className="stat-sub">of {eventMetrics.totalOrdersCount} Total Orders</span>
            </div>
            <div className="stat-card">
              <span className="stat-title">Pending Fulfillments</span>
              <span className="stat-val" style={{ color: 'var(--warning)' }}>
                {eventMetrics.pendingCount}
              </span>
              <span className="stat-sub">Awaiting Pickup</span>
            </div>
            <div className="stat-card">
              <span className="stat-title">Upgrade Cash Delta</span>
              <span className="stat-val" style={{ color: '#a78bfa' }}>
                +{eventMetrics.totalCashDelta.toLocaleString()} KES
              </span>
              <span className="stat-sub">Collected at Tent</span>
            </div>
            <div className="stat-card">
              <span className="stat-title">Allocated Stock Left</span>
              <span className="stat-val" style={{ color: eventMetrics.eventStockTotal < 15 ? 'var(--danger)' : 'var(--text-primary)' }}>
                {eventMetrics.eventStockTotal} pcs
              </span>
              <span className="stat-sub">Physical Stock on Hand</span>
            </div>
          </div>

          {/* Search, Filter & Action Toolbar */}
          <div className="toolbar-row">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Type 5-char code (e.g. 04CA7, JW6FU), SKU, customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="clear-search-btn">✕</button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="tenant-selector"
              style={{ width: 'auto' }}
            >
              <option value="all">All Orders ({enrichedOrders.length})</option>
              <option value="pending">Pending ({eventMetrics.pendingCount})</option>
              <option value="fulfilled">Fulfilled ({enrichedOrders.length - eventMetrics.pendingCount})</option>
            </select>

            <button
              onClick={openWalkUpModal}
              className="btn btn-primary"
            >
              ⚡ + Walk-Up Direct Fulfill
            </button>
          </div>

          {/* COLLISION DISAMBIGUATION CARD (Surfaced ONLY when genuine truncated ID conflict exists) */}
          {collisionMatches && (
            <div className="collision-disambiguation-box">
              <div className="collision-header">
                <span style={{ fontSize: '18px' }}>⚡</span>
                <div>
                  <div className="collision-title">
                    Truncated Reference Collision: #{collisionMatches.collidingRef}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Multiple orders share this 5-character code across different sources. Please select the matching customer:
                  </div>
                </div>
              </div>

              <div className="collision-grid">
                {collisionMatches.orders.map(cOrder => (
                  <div key={cOrder.id} className="collision-candidate-card">
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span className={`prefix-tag ${getPrefixClass(cOrder.source_prefix)}`}>
                          {cOrder.source_prefix}-{cOrder.order_ref}
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '13px' }}>
                          {cOrder.amount_paid} KES
                        </span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        👤 {cOrder.customer_name || 'Anonymous Customer'}
                      </div>
                      {cOrder.customer_phone && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          📞 {cOrder.customer_phone}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        👕 {cOrder.original_sku}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleFulfillExact(cOrder)}
                        className="btn btn-success btn-sm"
                        style={{ flex: 1 }}
                      >
                        ✓ Fulfill This Order
                      </button>
                      <button
                        onClick={() => openSwapModal(cOrder)}
                        className="btn btn-secondary btn-sm"
                      >
                        ⇄ Swap
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Orders Results List */}
          <div className="orders-list">
            {filteredOrders.length === 0 ? (
              <div className="content-card empty-state">
                <p>No matching orders found.</p>
                <span style={{ fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  Use the CSV Importer tab or click <strong>+ Walk-Up Direct Fulfill</strong> to log a customer.
                </span>
              </div>
            ) : (
              filteredOrders.map(order => {
                const isFulfilled = order.status === 'fulfilled';
                const isSwap = order.fulfillment && order.fulfillment.actual_sku !== order.original_sku;
                const [cat, col, sz] = order.original_sku.split('|');

                return (
                  <div key={order.id} className={`order-card ${isFulfilled ? 'fulfilled' : ''}`}>
                    <div className="order-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`prefix-tag ${getPrefixClass(order.source_prefix)}`}>
                          {order.source_prefix}
                        </span>
                        <span className="order-ref">#{order.order_ref}</span>

                        {isFulfilled ? (
                          isSwap ? (
                            <span className="badge badge-swap">Swapped & Dispatched ✓</span>
                          ) : (
                            <span className="badge badge-fulfilled">Dispatched Exact ✓</span>
                          )
                        ) : (
                          <span className="badge badge-pending">Pending Pickup</span>
                        )}
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          via {order.channel}
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        📅 {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &middot; {new Date(order.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="order-body">
                      <div className="sku-info">
                        <div className="sku-name">
                          {cat} &middot; <span style={{ color: 'var(--text-secondary)' }}>Color: {col || 'None'}</span> &middot; <span style={{ color: 'var(--accent)' }}>Size: {sz || 'None'}</span>
                        </div>
                        <div className="sku-meta">
                          Paid: <strong>{order.amount_paid} KES</strong>
                          {order.customer_name && ` &middot; Customer: ${order.customer_name}`}
                          {order.customer_phone && ` (${order.customer_phone})`}
                        </div>

                        {/* If fulfilled, show fulfillment details */}
                        {order.fulfillment && (
                          <div style={{ marginTop: '6px', fontSize: '12px', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
                            {isSwap ? (
                              <span style={{ color: '#c4b5fd', fontWeight: 600 }}>
                                ↳ Handed Over: {order.fulfillment.actual_sku} {order.fulfillment.cash_collected > 0 ? `(+${order.fulfillment.cash_collected} KES Collected)` : ''}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--success)' }}>
                                ↳ Handed Over: {order.fulfillment.actual_sku}
                              </span>
                            )}
                            <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                              Logged by {order.fulfillment.staff_id}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="order-actions">
                        {!isFulfilled ? (
                          <>
                            <button
                              onClick={() => handleFulfillExact(order)}
                              className="btn btn-success btn-sm"
                            >
                              ✓ Fulfill Exact
                            </button>
                            <button
                              onClick={() => openSwapModal(order)}
                              className="btn btn-secondary btn-sm"
                            >
                              ⇄ Swap / Upgrade
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                            Complete
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: STOCK & MULTI-LOCATION ALLOCATION */}
      {/* ========================================================================= */}
      {activeTab === 'stock' && (
        <div>
          {/* Multi-Location Stock On Hand Table */}
          <div className="content-card">
            <div className="section-header">
              <h2 className="section-title">
                <span>📦 Derived Stock on Hand by Location</span>
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="tenant-selector"
                  style={{ width: 'auto' }}
                >
                  <option value="all">All Categories</option>
                  <option value="Fan Jersey">Fan Jerseys</option>
                  <option value="Crew Neck">Crew Necks</option>
                  <option value="KRU Replica">KRU Replicas</option>
                  <option value="Bucket Hat">Bucket Hats</option>
                  <option value="Tank Top">Tank Tops</option>
                </select>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>SKU Code</th>
                    <th>Category</th>
                    <th>Variant</th>
                    <th>Price</th>
                    <th>Stock on Hand</th>
                    <th>Status Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {stockOnHand
                    .filter(s => categoryFilter === 'all' || s.category === categoryFilter)
                    .map((item, idx) => {
                      const isCritical = item.stock_on_hand <= 5 && item.stock_on_hand > 0;
                      const isWarning = item.stock_on_hand <= item.low_stock_threshold && item.stock_on_hand > 5;
                      const isZero = item.stock_on_hand <= 0;
                      const isHealthy = item.stock_on_hand > item.low_stock_threshold;

                      return (
                        <tr key={`${item.location_id}-${item.sku}-${idx}`}>
                          <td style={{ fontWeight: 600 }}>
                            {item.location_type === 'warehouse' ? '🏢 ' : '🎪 '}
                            {item.location_name}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.sku}</td>
                          <td>{item.category}</td>
                          <td>{item.color || 'None'} / {item.size || 'None'}</td>
                          <td>{item.price} KES</td>
                          <td style={{ fontWeight: 700, fontSize: '14px' }}>
                            {item.stock_on_hand} pcs
                          </td>
                          <td>
                            {isZero && <span className="stock-pill zero">Out of Stock</span>}
                            {isCritical && <span className="stock-pill critical">Critical (&lt;5)</span>}
                            {isWarning && <span className="stock-pill warning">Low Stock</span>}
                            {isHealthy && <span className="stock-pill healthy">Optimal</span>}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Warehouse Stock Operations Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
            {/* 1. Log Warehouse Stock-In */}
            <div className="content-card">
              <div className="section-header">
                <h3 className="section-title">📥 1. Warehouse Stock-In</h3>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Log incoming merchandise from suppliers into Main Warehouse stock.
              </p>
              <form onSubmit={handleStockInSubmit}>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Select SKU</label>
                  <select
                    value={stockInSku}
                    onChange={(e) => setStockInSku(e.target.value)}
                    required
                  >
                    {catalog.map(c => (
                      <option key={c.sku} value={c.sku}>
                        {c.sku} ({c.price} KES)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Quantity to Stock-In</label>
                  <input
                    type="number"
                    min="1"
                    value={stockInQty}
                    onChange={(e) => setStockInQty(parseInt(e.target.value, 10) || 0)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label>Supplier / Batch Notes</label>
                  <input
                    type="text"
                    value={stockInNotes}
                    onChange={(e) => setStockInNotes(e.target.value)}
                    placeholder="e.g. SportPesa 7s official delivery batch #1"
                  />
                </div>

                <button type="submit" className="btn btn-success" disabled={isPending} style={{ width: '100%' }}>
                  {isPending ? 'Logging...' : 'Record Warehouse Stock-In'}
                </button>
              </form>
            </div>

            {/* 2. Stock Allocation Dispatcher */}
            <div className="content-card">
              <div className="section-header">
                <h3 className="section-title">🚚 2. Stock Transfer to Event Tent</h3>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Allocate merchandise from Main Warehouse to a specific Event tent.
              </p>
              <form onSubmit={handleTransferSubmit}>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Select SKU to Transfer</label>
                  <select
                    value={transferSku}
                    onChange={(e) => setTransferSku(e.target.value)}
                    required
                  >
                    {catalog.map(c => (
                      <option key={c.sku} value={c.sku}>
                        {c.sku} ({c.price} KES)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Destination Event Tent</label>
                  <select
                    value={transferDestLocation}
                    onChange={(e) => setTransferDestLocation(e.target.value)}
                    required
                  >
                    {locations.filter(l => l.type === 'event').map(l => (
                      <option key={l.id} value={l.id}>
                        🎪 {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Quantity to Transfer</label>
                  <input
                    type="number"
                    min="1"
                    value={transferQty}
                    onChange={(e) => setTransferQty(parseInt(e.target.value, 10) || 0)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label>Dispatch Notes</label>
                  <input
                    type="text"
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    placeholder="e.g. Tent replenishment batch"
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={isPending} style={{ width: '100%' }}>
                  {isPending ? 'Allocating...' : 'Dispatch Stock to Event Tent'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CSV IMPORTER */}
      {/* ========================================================================= */}
      {activeTab === 'importer' && (
        <div className="content-card">
          <div className="section-header">
            <h2 className="section-title">📥 Ingest TikoHub Shop Orders</h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Upload the CSV export from TikoHub / Shopify. The system dynamically splits on the first <code>-</code> to capture any <code>source_prefix</code> (e.g. <code>ORD</code>, <code>SH</code>, <code>TKH</code>), truncates the ID to 5 characters, expands multi-unit rows, and automatically registers new prefix configs.
          </p>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label htmlFor="csv-file-input">Select CSV Export File</label>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              onChange={handleCSVFileChange}
              style={{ cursor: 'pointer', padding: '12px' }}
            />
          </div>

          {parseResult && (
            <div>
              <div className="stat-grid" style={{ marginBottom: '16px' }}>
                <div className="stat-card">
                  <span className="stat-title">Orders Identified</span>
                  <span className="stat-val">{parseResult.totalOrders}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-title">Expanded Units</span>
                  <span className="stat-val" style={{ color: 'var(--accent)' }}>{parseResult.totalUnits}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-title">Discovered Prefixes</span>
                  <span className="stat-val" style={{ color: '#a78bfa' }}>
                    {parseResult.discoveredPrefixes.join(', ') || 'ORD'}
                  </span>
                </div>
              </div>

              {parseResult.errors.length > 0 && (
                <div className="queue-alert-banner" style={{ borderLeftColor: 'var(--danger)', marginBottom: '16px' }}>
                  <div>
                    <strong style={{ color: 'var(--danger)' }}>Validation Warnings ({parseResult.errors.length}):</strong>
                    <ul style={{ paddingLeft: '16px', marginTop: '4px', fontSize: '12px' }}>
                      {parseResult.errors.map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Sample Parsed Records Preview (First 5 Units):
                </h4>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Prefix</th>
                        <th>Truncated Ref</th>
                        <th>Original SKU</th>
                        <th>Amount Paid</th>
                        <th>Customer</th>
                        <th>Unit Index</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.orders.slice(0, 5).map((o, idx) => (
                        <tr key={idx}>
                          <td>
                            <span className={`prefix-tag ${getPrefixClass(o.source_prefix)}`}>
                              {o.source_prefix}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>
                            #{o.order_ref}
                          </td>
                          <td>{o.original_sku}</td>
                          <td>{o.amount_paid} KES</td>
                          <td>{o.customer_name || 'N/A'}</td>
                          <td>Unit {o.unit_index} of {o.total_units}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <button
                onClick={handleImportExecute}
                className="btn btn-success"
                disabled={isPending || parseResult.orders.length === 0}
                style={{ width: '100%' }}
              >
                {isPending ? 'Importing...' : `Write ${parseResult.orders.length} Order Records to Database`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: RECONCILIATION & AUDIT REPORTING */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div>
          {/* Category & Executive Breakdown */}
          <div className="content-card">
            <div className="section-header">
              <h2 className="section-title">📊 Merchandise Category Reconciliation</h2>
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Merchandise Category</th>
                    <th>Total Ordered</th>
                    <th>Total Dispatched</th>
                    <th>Swaps / Upgrades</th>
                    <th>Upgrade Cash Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {reportCategoryBreakdown.map(row => (
                    <tr key={row.category}>
                      <td style={{ fontWeight: 600 }}>{row.category}</td>
                      <td>{row.ordered} pcs</td>
                      <td style={{ color: 'var(--success)', fontWeight: 600 }}>{row.dispatched} pcs</td>
                      <td style={{ color: '#a78bfa' }}>{row.swaps} swaps</td>
                      <td style={{ fontWeight: 700, color: 'var(--accent)' }}>
                        +{row.cashDelta.toLocaleString()} KES
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ordered vs What Went Out (The Bottleneck Fix) */}
          <div className="content-card">
            <div className="section-header">
              <h2 className="section-title">🎯 Ordered vs. What Went Out (Audit Matrix)</h2>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              One-click reconciliation audit comparing what customers originally paid for vs what was physically handed over.
            </p>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Source & Ref</th>
                    <th>Customer</th>
                    <th>Original SKU Ordered</th>
                    <th>Actual SKU Handed Over</th>
                    <th>Resolution</th>
                    <th>Cash Delta</th>
                    <th>Location</th>
                    <th>Staff</th>
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
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)', marginLeft: '6px' }}>
                            #{order.order_ref}
                          </span>
                        </td>
                        <td>{order.customer_name || 'Walk-up'}</td>
                        <td>{order.original_sku}</td>
                        <td style={{ fontWeight: 600, color: isSwap ? '#c4b5fd' : 'var(--text-primary)' }}>
                          {order.fulfillment?.actual_sku || '—'}
                        </td>
                        <td>
                          {!isFulfilled && <span className="badge badge-pending">Pending</span>}
                          {isFulfilled && !isSwap && <span className="badge badge-fulfilled">Exact Dispatch</span>}
                          {isFulfilled && isSwap && <span className="badge badge-swap">SKU Swap</span>}
                        </td>
                        <td style={{ fontWeight: 600, color: order.fulfillment?.cash_collected ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {order.fulfillment?.cash_collected ? `+${order.fulfillment.cash_collected} KES` : '0 KES'}
                        </td>
                        <td>
                          {order.fulfillment ? (locations.find(l => l.id === order.fulfillment?.location_id)?.name || order.fulfillment?.location_id) : '—'}
                        </td>
                        <td>{order.fulfillment?.staff_id || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dynamic Order Prefixes Config Table */}
          <div className="content-card">
            <div className="section-header">
              <h2 className="section-title">⚙️ Dynamic Order Prefixes (Config Table)</h2>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Prefixes are discovered automatically at ingest. Admins can annotate labels for reporting context.
            </p>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Prefix Code</th>
                    <th>Descriptive Label</th>
                    <th>Active</th>
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
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}
                          />
                        ) : (
                          p.label || <span style={{ color: 'var(--text-muted)' }}>No description</span>
                        )}
                      </td>
                      <td>
                        <span className="stock-pill healthy">Active</span>
                      </td>
                      <td>
                        {editingPrefix === p.prefix ? (
                          <button
                            onClick={() => handleSavePrefixLabel(p.prefix)}
                            className="btn btn-success btn-sm"
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingPrefix(p.prefix);
                              setEditingPrefixLabel(p.label);
                            }}
                            className="btn btn-secondary btn-sm"
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
          </div>

          {/* Append-Only Ledger Movement Log */}
          <div className="content-card">
            <div className="section-header">
              <h2 className="section-title">📜 Immutable Stock Movement Ledger</h2>
            </div>
            <div className="table-responsive" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Type</th>
                    <th>SKU Code</th>
                    <th>Qty Delta</th>
                    <th>Location</th>
                    <th>Staff</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map(row => (
                    <tr key={row.id}>
                      <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {new Date(row.timestamp).toLocaleDateString()} {new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '11px',
                          color: row.type === 'StockIn' ? 'var(--success)' : row.type === 'Transfer' ? 'var(--accent)' : row.type === 'Swap' ? '#a78bfa' : 'var(--warning)'
                        }}>
                          {row.type}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{row.sku}</td>
                      <td style={{ fontWeight: 700, color: row.quantity_delta > 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {row.quantity_delta > 0 ? `+${row.quantity_delta}` : row.quantity_delta}
                      </td>
                      <td>{locations.find(l => l.id === row.location_id)?.name || row.location_id}</td>
                      <td>{row.staff_id}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="content-card" style={{ borderLeft: '4px solid var(--danger)' }}>
            <h3 style={{ fontSize: '14px', color: 'var(--danger)', marginBottom: '4px' }}>Developer Reset Hook</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Wipe live database transactions and restore clean standard seed data for testing.
            </p>
            <button onClick={handleDbReset} className="btn btn-danger btn-sm">
              Reset Entire Database to Seeds
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SWAP / UPGRADE SKU */}
      {/* ========================================================================= */}
      {swapModalOpen && swapOrder && (
        <div className="modal-backdrop">
          <div className="modal-sheet">
            <div className="modal-title-bar">
              <h3>⇄ Swap / Upgrade SKU</h3>
              <button onClick={() => setSwapModalOpen(false)} className="modal-close-btn">✕</button>
            </div>

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Order Reference</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`prefix-tag ${getPrefixClass(swapOrder.source_prefix)}`}>
                  {swapOrder.source_prefix}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: 'var(--accent)' }}>
                  #{swapOrder.order_ref}
                </span>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Originally Ordered SKU</label>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {swapOrder.original_sku} (Paid: {swapOrder.amount_paid} KES)
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Select Replacement SKU (Handed Over)</label>
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

            {/* Live Auto-Price Delta Box */}
            <div className={`delta-box ${computedSwapDelta > 0 ? 'upgrade' : computedSwapDelta < 0 ? 'refund' : 'even'}`}>
              <span>Catalog Price Delta</span>
              <span>
                {computedSwapDelta > 0 ? `+${computedSwapDelta} KES (Upgrade)` : computedSwapDelta < 0 ? `${computedSwapDelta} KES (Refund)` : '0 KES (Even Swap)'}
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Actual Cash Collected (Override if Discount Applies)</label>
              <input
                type="number"
                placeholder={computedSwapDelta.toString()}
                value={swapCashOverride}
                onChange={(e) => setSwapCashOverride(e.target.value)}
              />
            </div>

            {swapCashOverride.trim() !== '' && (
              <div className="form-group" style={{ marginBottom: '10px' }}>
                <label>Override Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Lead approved even swap, promotional discount"
                  value={swapOverrideReason}
                  onChange={(e) => setSwapOverrideReason(e.target.value)}
                />
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Payment Channel</label>
              <select
                value={swapChannel}
                onChange={(e) => setSwapChannel(e.target.value as any)}
              >
                <option value="Event">Event Tent (M-Pesa / Cash)</option>
                <option value="Card">PDQ Terminal Card Payment</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Operator Audit Notes</label>
              <input
                type="text"
                placeholder="e.g. Customer wanted size L instead of M"
                value={swapNotes}
                onChange={(e) => setSwapNotes(e.target.value)}
              />
            </div>

            <button
              onClick={handleSwapSubmit}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Confirm Swap & Hand Over Jersey
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: WALK-UP DIRECT ENTRY & FULFILLMENT */}
      {/* ========================================================================= */}
      {walkUpModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-sheet">
            <div className="modal-title-bar">
              <h3>⚡ Walk-Up Direct Order & Fulfill</h3>
              <button onClick={() => setWalkUpModalOpen(false)} className="modal-close-btn">✕</button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Log an untracked customer directly at the tent in 1 touch.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '10px', marginBottom: '10px' }}>
              <div className="form-group">
                <label>Source Prefix</label>
                <select
                  value={walkUpPrefix}
                  onChange={(e) => setWalkUpPrefix(e.target.value)}
                >
                  {prefixes.map(p => (
                    <option key={p.prefix} value={p.prefix}>{p.prefix}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Truncated Ref (5 chars)</label>
                <input
                  type="text"
                  placeholder="e.g. 04CA7, JW6FU, 9B3D1"
                  value={walkUpRef}
                  onChange={(e) => setWalkUpRef(e.target.value.toUpperCase())}
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Original SKU Ordered / Paid For</label>
              <select
                value={walkUpOrigSku}
                onChange={(e) => handleWalkUpOrigSkuChange(e.target.value)}
              >
                {catalog.map(c => (
                  <option key={c.sku} value={c.sku}>
                    {c.sku} — {c.price} KES
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Actual SKU Handed Over</label>
              <select
                value={walkUpActualSku}
                onChange={(e) => handleWalkUpActualSkuChange(e.target.value)}
              >
                {catalog.map(c => (
                  <option key={c.sku} value={c.sku}>
                    {c.sku} — {c.price} KES
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div className="form-group">
                <label>Amount Originally Paid (KES)</label>
                <input
                  type="number"
                  value={walkUpPaid}
                  onChange={(e) => setWalkUpPaid(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Upgrade Cash Collected (KES)</label>
                <input
                  type="number"
                  value={walkUpCashDelta}
                  onChange={(e) => setWalkUpCashDelta(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div className="form-group">
                <label>Customer Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Kevin O."
                  value={walkUpCustomerName}
                  onChange={(e) => setWalkUpCustomerName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Phone Number (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 0712345678"
                  value={walkUpCustomerPhone}
                  onChange={(e) => setWalkUpCustomerPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Audit Notes</label>
              <input
                type="text"
                placeholder="e.g. Collected at main entrance tent"
                value={walkUpNotes}
                onChange={(e) => setWalkUpNotes(e.target.value)}
              />
            </div>

            <button
              onClick={handleWalkUpSubmit}
              className="btn btn-success"
              style={{ width: '100%' }}
            >
              Log Order & Hand Over Jersey ✓
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer-bar">
        FBG Inventory, Dispatch & Multi-Tenant Event System &middot; Append-Only Ledger &middot; PWA Offline Ready
      </footer>
    </main>
  );
}
