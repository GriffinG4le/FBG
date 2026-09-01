'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import {
  getLocationsAction,
  createEventLocationAction,
  getOrderPrefixesAction,
  updateOrderPrefixLabelAction,
  getCatalogAction,
  upsertCatalogItemAction,
  getDerivedStockOnHandAction,
  getOrdersAction,
  getFulfillmentsAction,
  getLedgerAction,
  logWarehouseStockInAction,
  logDynamicWarehouseStockInAction,
  logBatchWarehouseStockInAction,
  allocateStockTransferAction,
  getEventTransfersAction,
  dispatchBatchToEventAction,
  submitTentStaffReturnCountAction,
  verifyWarehouseReturnIntakeAction,
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
  EventStockTransfer
} from '../lib/db';
import { parseTikoHubCSV, ParseResult } from '../lib/csvParser';
import {
  enqueueOfflineAction,
  getOfflineQueue,
  syncOfflineQueue,
  clearOfflineQueue
} from '../lib/offlineQueue';

type NavigationTab = 'dashboard' | 'fulfillment' | 'events' | 'stock' | 'importer' | 'reports';

// Notes annotation metadata from event spreadsheet
const SPREADSHEET_NOTES: Record<string, string> = {
  'Fan Jersey|White|L': '70 Stored',
  'Fan Jersey|Red|L': '10 missing',
  'Fan Jersey|White|XL': '160 Stored, 3 Missing'
};

export default function Dashboard() {
  // Navigation & Scoping
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('evt-sp7s');

  // Core Data
  const [locations, setLocations] = useState<Location[]>([]);
  const [prefixes, setPrefixes] = useState<OrderPrefix[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [stockOnHand, setStockOnHand] = useState<StockOnHandItem[]>([]);
  const [eventTransfers, setEventTransfers] = useState<EventStockTransfer[]>([]);

  // Connectivity & Offline Queue
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queueSize, setQueueSize] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Form State for Log & Dispatch
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

  // Right-side category filter for available stock ledger
  const [stockViewCategory, setStockViewCategory] = useState<string>('all');

  // Dynamic Warehouse Stock-In Form (Blank by default on deployment)
  const [stockInMode, setStockInMode] = useState<'single' | 'multi'>('single');
  const [stockInCategory, setStockInCategory] = useState<string>('');
  const [stockInColor, setStockInColor] = useState<string>('');
  const [stockInSingleSize, setStockInSingleSize] = useState<string>('One Size');
  const [stockInPrice, setStockInPrice] = useState<string>('');
  const [stockInSingleQty, setStockInSingleQty] = useState<string>('');
  const [stockInNotes, setStockInNotes] = useState<string>('');
  const [stockInMultiSizes, setStockInMultiSizes] = useState<{ size: string; quantity: string }[]>([
    { size: 'XS', quantity: '' },
    { size: 'S', quantity: '' },
    { size: 'M', quantity: '' },
    { size: 'L', quantity: '' },
    { size: 'XL', quantity: '' },
    { size: '2XL', quantity: '' },
    { size: '3XL', quantity: '' },
    { size: '4XL', quantity: '' },
    { size: '5XL', quantity: '' }
  ]);

  // Event Lifecycle States
  const [newEventName, setNewEventName] = useState<string>('');
  const [newEventVenue, setNewEventVenue] = useState<string>('');
  const [eventDispatchEventId, setEventDispatchEventId] = useState<string>('');
  const [eventDispatchSku, setEventDispatchSku] = useState<string>('');
  const [eventDispatchQty, setEventDispatchQty] = useState<string>('');
  const [eventDispatchNotes, setEventDispatchNotes] = useState<string>('');

  // Tent Staff Closeout Count Modal
  const [tentModalOpen, setTentModalOpen] = useState<boolean>(false);
  const [tentModalEventId, setTentModalEventId] = useState<string>('');
  const [tentCountRows, setTentCountRows] = useState<{ sku: string; staffCount: string; expectedQty: number }[]>([]);
  const [tentCountStaffName, setTentCountStaffName] = useState<string>('');
  const [tentCountNotes, setTentCountNotes] = useState<string>('');

  // Warehouse Verification Modal
  const [whVerifyModalOpen, setWhVerifyModalOpen] = useState<boolean>(false);
  const [whVerifyEventId, setWhVerifyEventId] = useState<string>('');
  const [whVerifyRows, setWhVerifyRows] = useState<{ sku: string; staffCount: number; whCount: string; expectedQty: number }[]>([]);
  const [whVerifyStaffName, setWhVerifyStaffName] = useState<string>('');
  const [whVerifyNotes, setWhVerifyNotes] = useState<string>('');

  // Modals for swaps
  const [swapModalOpen, setSwapModalOpen] = useState<boolean>(false);
  const [swapOrder, setSwapOrder] = useState<Order | null>(null);
  const [selectedSwapSku, setSelectedSwapSku] = useState<string>('');
  const [swapCashOverride, setSwapCashOverride] = useState<string>('');
  const [swapOverrideReason, setSwapOverrideReason] = useState<string>('');
  const [swapNotes, setSwapNotes] = useState<string>('');

  // CSV Importer
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

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
      const [locs, prefs, cats, ords, fuls, leds, stocks, etrans] = await Promise.all([
        getLocationsAction(),
        getOrderPrefixesAction(),
        getCatalogAction(),
        getOrdersAction(),
        getFulfillmentsAction(),
        getLedgerAction(),
        getDerivedStockOnHandAction(),
        getEventTransfersAction()
      ]);

      setLocations(locs);
      setPrefixes(prefs);
      setCatalog(cats);
      setOrders(ords);
      setFulfillments(fuls);
      setLedger(leds);
      setStockOnHand(stocks);
      setEventTransfers(etrans);

      if (locs.filter(l => l.type === 'event').length > 0 && !eventDispatchEventId) {
        setEventDispatchEventId(locs.filter(l => l.type === 'event')[0].id);
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

  // Dynamic Categories & Colors
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
    const order = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'None', 'One Size', 'Standard'];
    const sizes = catalog
      .filter(c => c.category === selectedCategory && (c.color || 'Standard') === selectedColor)
      .map(c => c.size || 'One Size');
    
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
      (c.size || 'One Size') === selectedSize
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
      const sizes = catalog.filter(c => c.category === cat && (c.color || 'Standard') === colors[0]).map(c => c.size || 'One Size');
      if (sizes.length > 0) setSelectedSize(sizes[0]);
    }
  };

  const handleColorChange = (col: string) => {
    setSelectedColor(col);
    const sizes = catalog.filter(c => c.category === selectedCategory && (c.color || 'Standard') === col).map(c => c.size || 'One Size');
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

  // =========================================================================
  // GOOGLE SHEET ACCURATE DASHBOARD CALCULATIONS
  // =========================================================================

  const sizeColorBreakdown = useMemo(() => {
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
    const colorOrder = ['White', 'Red'];

    const rows = [];
    let sumReceived = 0;
    let sumDelivered = 0;
    let sumNotDelivered = 0;
    let sumRemaining = 0;

    for (const sz of sizeOrder) {
      for (const col of colorOrder) {
        const sku = `Fan Jersey|${col}|${sz}`;

        const received = ledger
          .filter(l => l.location_id === selectedLocationId && l.sku === sku && l.quantity_delta > 0)
          .reduce((sum, l) => sum + l.quantity_delta, 0);

        const delivered = Math.abs(
          ledger
            .filter(l => l.location_id === selectedLocationId && l.sku === sku && l.quantity_delta < 0 && l.type === 'Dispatch')
            .reduce((sum, l) => sum + l.quantity_delta, 0)
        );

        const notDelivered = orders.filter(o => o.status === 'pending' && o.original_sku === sku).length;
        const remaining = received - delivered - notDelivered;

        sumReceived += received;
        sumDelivered += delivered;
        sumNotDelivered += notDelivered;
        sumRemaining += remaining;

        const note = SPREADSHEET_NOTES[sku] || '';

        rows.push({
          sku,
          size: sz,
          color: col,
          received,
          delivered,
          notDelivered,
          remaining,
          note
        });
      }
    }

    return {
      rows,
      totals: {
        received: sumReceived,
        delivered: sumDelivered,
        notDelivered: sumNotDelivered,
        remaining: sumRemaining
      }
    };
  }, [ledger, orders, selectedLocationId]);

  const paymentChannelSales = useMemo(() => {
    const channels = [
      { name: 'Online (Site Checkout)', count: 411, revenue: 1027500 },
      { name: 'Giveaway', count: 10, revenue: 0 },
      { name: 'Event — Card', count: 3, revenue: 7500 },
      { name: 'Event — M-Pesa', count: 0, revenue: 0 },
      { name: 'Free', count: 43, revenue: 107500 }
    ];

    const sessionWalkUps = fulfillments.filter(f => !f.id.startsWith('ful-f'));
    const liveCardCount = sessionWalkUps.filter(f => orders.find(o => o.id === f.order_id)?.channel === 'Card').length;
    const liveEventCount = sessionWalkUps.filter(f => orders.find(o => o.id === f.order_id)?.channel === 'Event').length;

    channels[2].count += liveCardCount;
    channels[2].revenue += liveCardCount * 2500;

    channels[3].count += liveEventCount;
    channels[3].revenue += liveEventCount * 2500;

    const totalCount = channels.reduce((sum, c) => sum + c.count, 0);
    const totalRevenue = channels.reduce((sum, c) => sum + c.revenue, 0);

    return {
      channels,
      totalCount,
      totalRevenue
    };
  }, [fulfillments, orders]);

  // Main Dispatch Action
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

  // Submit Dynamic Warehouse Stock-In
  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockInCategory.trim()) {
      alert("Please enter the merchandise item name / category (e.g. Bucket Hat, Concert Merch, Crewneck Jersey).");
      return;
    }
    if (!stockInColor.trim()) {
      alert("Please enter the colourway (e.g. Beige, Black, White, Red).");
      return;
    }

    const price = parseFloat(stockInPrice) || 2500;

    startTransition(async () => {
      try {
        if (stockInMode === 'single') {
          const qty = parseInt(stockInSingleQty, 10) || 0;
          if (qty <= 0) {
            alert("Please enter a valid received quantity (> 0).");
            return;
          }

          await logDynamicWarehouseStockInAction({
            category: stockInCategory.trim(),
            color: stockInColor.trim(),
            size: stockInSingleSize.trim() || 'One Size',
            price,
            quantity: qty,
            locationId: 'wh-main',
            staffId: 'Warehouse Staff',
            notes: stockInNotes.trim() || `Warehouse stock intake for ${stockInCategory.trim()}`
          });

          alert(`Stock-In Recorded: +${qty} units of ${stockInCategory.trim()} (${stockInColor.trim()} / ${stockInSingleSize.trim()}) added to Main Warehouse.`);
        } else {
          const variants = stockInMultiSizes
            .map(s => ({ size: s.size, quantity: parseInt(s.quantity, 10) || 0 }))
            .filter(v => v.quantity > 0);

          if (variants.length === 0) {
            alert("Please enter a quantity for at least one size.");
            return;
          }

          const totalQty = variants.reduce((sum, v) => sum + v.quantity, 0);

          await logBatchWarehouseStockInAction({
            category: stockInCategory.trim(),
            color: stockInColor.trim(),
            price,
            variants,
            locationId: 'wh-main',
            staffId: 'Warehouse Staff',
            notes: stockInNotes.trim() || `Batch intake for ${stockInCategory.trim()} (${totalQty} units total)`
          });

          alert(`Batch Stock-In Recorded: +${totalQty} units of ${stockInCategory.trim()} (${stockInColor.trim()}) across ${variants.length} sizes added to Main Warehouse.`);
        }

        setStockInCategory('');
        setStockInColor('');
        setStockInPrice('');
        setStockInSingleQty('');
        setStockInNotes('');
        setStockInMultiSizes(prev => prev.map(s => ({ ...s, quantity: '' })));

        loadAllData();
      } catch (err) {
        alert(`Stock-in failed: ${(err as Error).message}`);
      }
    });
  };

  // Create Event Action
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim()) {
      alert("Please enter an event name (e.g. Kabras 7s, Blankets & Wine).");
      return;
    }

    startTransition(async () => {
      try {
        const newLoc = await createEventLocationAction(newEventName.trim(), newEventVenue.trim());
        alert(`Event Station Created: ${newLoc.name}`);
        setNewEventName('');
        setNewEventVenue('');
        setEventDispatchEventId(newLoc.id);
        setSelectedLocationId(newLoc.id);
        loadAllData();
      } catch (err) {
        alert(`Failed to create event station.`);
      }
    });
  };

  // Dispatch Stock to Event Action
  const handleDispatchStockToEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventDispatchEventId) {
      alert("Please select a destination event.");
      return;
    }
    if (!eventDispatchSku) {
      alert("Please select an item to dispatch.");
      return;
    }
    const qty = parseInt(eventDispatchQty, 10) || 0;
    if (qty <= 0) {
      alert("Please enter a valid dispatch quantity (> 0).");
      return;
    }

    startTransition(async () => {
      try {
        await dispatchBatchToEventAction(
          eventDispatchEventId,
          [{ sku: eventDispatchSku, quantity: qty }],
          'Admin',
          eventDispatchNotes.trim() || 'Outbound event allocation'
        );
        const eventName = locations.find(l => l.id === eventDispatchEventId)?.name || eventDispatchEventId;
        alert(`Stock Dispatched: ${qty} units of ${eventDispatchSku} sent to ${eventName}.`);
        setEventDispatchSku('');
        setEventDispatchQty('');
        setEventDispatchNotes('');
        loadAllData();
      } catch (err) {
        alert(`Dispatch failed: ${(err as Error).message}`);
      }
    });
  };

  // Open Tent Staff Return Count Modal
  const openTentCloseoutModal = (eventId: string) => {
    setTentModalEventId(eventId);
    // Find all SKUs currently held or allocated to this event
    const eventItems = stockOnHand.filter(s => s.location_id === eventId);
    const rows = eventItems.map(item => ({
      sku: item.sku,
      expectedQty: item.stock_on_hand,
      staffCount: item.stock_on_hand.toString()
    }));

    setTentCountRows(rows);
    setTentCountStaffName('');
    setTentCountNotes('');
    setTentModalOpen(true);
  };

  // Submit Tent Staff Return Count
  const handleTentCloseoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tentCountRows.length === 0) return;

    const payload = tentCountRows.map(r => ({
      sku: r.sku,
      staffCount: parseInt(r.staffCount, 10) || 0
    }));

    startTransition(async () => {
      try {
        await submitTentStaffReturnCountAction(
          tentModalEventId,
          payload,
          tentCountStaffName.trim() || 'Tent Staff',
          tentCountNotes.trim()
        );
        alert(`Event Stock Handover Logged! Status is now: In Transit to Warehouse.`);
        setTentModalOpen(false);
        loadAllData();
      } catch (err) {
        alert(`Failed to log return count.`);
      }
    });
  };

  // Open Warehouse Verification Modal
  const openWhVerifyModal = (eventId: string) => {
    setWhVerifyEventId(eventId);
    const transfers = eventTransfers.filter(t => t.event_id === eventId);
    const eventStock = stockOnHand.filter(s => s.location_id === eventId);

    // Build comparison rows
    const uniqueSkus = [...new Set([...transfers.map(t => t.sku), ...eventStock.map(s => s.sku)])];
    const rows = uniqueSkus.map(sku => {
      const trans = transfers.find(t => t.sku === sku);
      const stock = eventStock.find(s => s.sku === sku)?.stock_on_hand || 0;
      const staffCount = trans?.tent_staff_return_count ?? stock;

      return {
        sku,
        staffCount,
        whCount: staffCount.toString(),
        expectedQty: stock
      };
    });

    setWhVerifyRows(rows);
    setWhVerifyStaffName('');
    setWhVerifyNotes('');
    setWhVerifyModalOpen(true);
  };

  // Submit Warehouse Verification & Closeout
  const handleWhVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (whVerifyRows.length === 0) return;

    const payload = whVerifyRows.map(r => ({
      sku: r.sku,
      whCount: parseInt(r.whCount, 10) || 0
    }));

    startTransition(async () => {
      try {
        await verifyWarehouseReturnIntakeAction(
          whVerifyEventId,
          payload,
          whVerifyStaffName.trim() || 'Warehouse Rep',
          whVerifyNotes.trim()
        );
        alert(`Warehouse Verification Complete! Stock successfully added back to Main Warehouse.`);
        setWhVerifyModalOpen(false);
        loadAllData();
      } catch (err) {
        alert(`Failed to verify warehouse return intake.`);
      }
    });
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

    setOrders(prev => prev.map(o => o.id === swapOrder.id ? { ...o, status: 'fulfilled' } : o));
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
          onClick={() => setActiveTab('events')}
          className={activeTab === 'events' ? 'active' : ''}
        >
          Events & transfers
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
          <div className="label">TOTAL STOCK RECEIVED</div>
          <div className="value">
            {sizeColorBreakdown.totals.received} <span className="unit">pcs</span>
          </div>
        </div>
        <div className="stat">
          <div className="label">TOTAL DELIVERED</div>
          <div className="value success">
            {sizeColorBreakdown.totals.delivered} <span className="unit">pcs</span>
          </div>
        </div>
        <div className="stat">
          <div className="label">NOT DELIVERED (PENDING)</div>
          <div className="value amber">
            {sizeColorBreakdown.totals.notDelivered}
          </div>
        </div>
        <div className="stat">
          <div className="label">TOTAL REMAINING STOCK</div>
          <div className="value" style={{ color: sizeColorBreakdown.totals.remaining < 50 ? 'var(--amber)' : 'var(--ink)' }}>
            {sizeColorBreakdown.totals.remaining} <span className="unit">pcs</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 0: DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && (
        <div>
          {/* Section 1: Stock by Size & Color Matrix */}
          <div className="card">
            <div className="card-head">
              <span>Stock by Size & Color — {activeLocation.name}</span>
              <span className="mono" style={{ fontSize: '13px', color: 'var(--muted)' }}>
                Baseline Jersey Price: <strong>2,500 KES</strong>
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>Color</th>
                    <th className="num-cell">Stock Received</th>
                    <th className="num-cell">Delivered</th>
                    <th className="num-cell">Not Delivered</th>
                    <th className="num-cell">Remaining Stock</th>
                    <th>Notes / Storage Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sizeColorBreakdown.rows.map((row) => {
                    const isZero = row.remaining === 0;
                    const isNegative = row.remaining < 0;
                    const isLow = row.remaining > 0 && row.remaining <= 10;

                    return (
                      <tr key={row.sku}>
                        <td className="mono" style={{ fontWeight: 600 }}>{row.size}</td>
                        <td>{row.color}</td>
                        <td className="num-cell">{row.received}</td>
                        <td className="num-cell tag-green">{row.delivered}</td>
                        <td className="num-cell tag-amber">{row.notDelivered}</td>
                        <td className={`num-cell ${isNegative ? 'tag-negative' : isLow ? 'tag-amber' : ''}`}>
                          <strong>{row.remaining}</strong>
                        </td>
                        <td style={{ fontSize: '12px', color: row.note.includes('missing') ? '#DC2626' : 'var(--muted)' }}>
                          {row.note || '—'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="total-row">
                    <td>TOTAL</td>
                    <td></td>
                    <td className="num-cell">{sizeColorBreakdown.totals.received}</td>
                    <td className="num-cell tag-green">{sizeColorBreakdown.totals.delivered}</td>
                    <td className="num-cell tag-amber">{sizeColorBreakdown.totals.notDelivered}</td>
                    <td className="num-cell"><strong>{sizeColorBreakdown.totals.remaining}</strong></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Sales Breakdown by Payment Type / Channel */}
          <div className="card">
            <div className="card-head">
              <span>Sales Breakdown by Payment Channel</span>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                Total Revenue: <strong className="mono" style={{ color: 'var(--ink)' }}>{paymentChannelSales.totalRevenue.toLocaleString()} KES</strong>
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th className="num-cell">Count Sold</th>
                    <th className="num-cell" style={{ textAlign: 'right' }}>Revenue (KES)</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentChannelSales.channels.map((chan) => (
                    <tr key={chan.name}>
                      <td style={{ fontWeight: 500 }}>{chan.name}</td>
                      <td className="num-cell">{chan.count} pcs</td>
                      <td className="num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {chan.revenue.toLocaleString()} KES
                      </td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td>TOTAL</td>
                    <td className="num-cell">{paymentChannelSales.totalCount} pcs</td>
                    <td className="num-cell" style={{ textAlign: 'right' }}>
                      {paymentChannelSales.totalRevenue.toLocaleString()} KES
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: LOG & DISPATCH */}
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

              {/* Customer Details */}
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
                                      setSelectedSize(item.size || 'One Size');
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
      {/* TAB 2: EVENTS & TRANSFERS (COMPLETE 2-STEP LIFECYCLE) */}
      {/* ========================================================================= */}
      {activeTab === 'events' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            {/* Create Event Card */}
            <div className="card">
              <div className="card-head">Create new event station</div>
              <form className="form" onSubmit={handleCreateEvent}>
                <div className="field">
                  <span className="field-label">Event Name</span>
                  <input
                    type="text"
                    placeholder="e.g. Kabras 7s, Blankets & Wine"
                    value={newEventName}
                    onChange={(e) => setNewEventName(e.target.value)}
                    style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter', width: '220px' }}
                    required
                  />
                </div>
                <div className="field">
                  <span className="field-label">Venue / City</span>
                  <input
                    type="text"
                    placeholder="e.g. Kakamega Sports Club"
                    value={newEventVenue}
                    onChange={(e) => setNewEventVenue(e.target.value)}
                    style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter', width: '220px' }}
                  />
                </div>
                <button type="submit" className="submit" disabled={isPending}>
                  Create event station
                </button>
              </form>
            </div>

            {/* Outbound Stock Transfer to Event */}
            <div className="card">
              <div className="card-head">Dispatch stock to event tent</div>
              <form className="form" onSubmit={handleDispatchStockToEvent}>
                <div className="field">
                  <span className="field-label">Destination Event</span>
                  <select
                    className="plain"
                    value={eventDispatchEventId}
                    onChange={(e) => setEventDispatchEventId(e.target.value)}
                    required
                  >
                    <option value="">Select Event...</option>
                    {locations.filter(l => l.type === 'event').map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <span className="field-label">Select SKU</span>
                  <select
                    className="plain"
                    value={eventDispatchSku}
                    onChange={(e) => setEventDispatchSku(e.target.value)}
                    required
                  >
                    <option value="">Select warehouse stock...</option>
                    {catalog.map(c => {
                      const whItem = stockOnHand.find(s => s.location_id === 'wh-main' && s.sku === c.sku);
                      const qty = whItem ? whItem.stock_on_hand : 0;
                      return (
                        <option key={c.sku} value={c.sku}>
                          {c.sku} ({qty} pcs in WH)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="field">
                  <span className="field-label">Dispatch Quantity</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 50"
                    value={eventDispatchQty}
                    onChange={(e) => setEventDispatchQty(e.target.value)}
                    style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontFamily: 'IBM Plex Mono', fontSize: '14px', width: '100px' }}
                    required
                  />
                </div>

                <div className="field">
                  <span className="field-label">Notes</span>
                  <input
                    type="text"
                    placeholder="e.g. Initial tent batch allocation"
                    value={eventDispatchNotes}
                    onChange={(e) => setEventDispatchNotes(e.target.value)}
                    style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter', width: '200px' }}
                  />
                </div>

                <button type="submit" className="submit" disabled={isPending}>
                  Dispatch stock to tent
                </button>
              </form>
            </div>
          </div>

          {/* Active Events & 2-Step Handover Overview */}
          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-head">
              <span>Active events & 2-step stock return verification</span>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {locations.filter(l => l.type === 'event').map(loc => {
                  const eventTrans = eventTransfers.filter(t => t.event_id === loc.id);
                  const totalAllocated = eventTrans.reduce((sum, t) => sum + t.allocated_qty, 0);
                  const eventStock = stockOnHand.filter(s => s.location_id === loc.id);
                  const totalCurrentStock = eventStock.reduce((sum, s) => sum + s.stock_on_hand, 0);

                  const isReturnCounted = eventTrans.some(t => t.status === 'return_counted_by_staff');
                  const isVerified = eventTrans.length > 0 && eventTrans.every(t => t.status === 'verified_in_warehouse');

                  return (
                    <div
                      key={loc.id}
                      style={{
                        border: '1px solid var(--line)',
                        borderRadius: '10px',
                        padding: '16px',
                        background: 'var(--panel)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '15px' }}>{loc.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                            Created: {new Date(loc.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <span
                          className="mono"
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '5px',
                            background: isVerified ? 'var(--success-bg)' : isReturnCounted ? 'var(--amber-bg)' : 'var(--bg)',
                            color: isVerified ? 'var(--success)' : isReturnCounted ? 'var(--amber)' : 'var(--ink)'
                          }}
                        >
                          {isVerified ? 'RECONCILED IN WH' : isReturnCounted ? 'IN TRANSIT TO WH' : 'ACTIVE ON GROUND'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '12px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', marginBottom: '14px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>OUTBOUND ALLOCATED</div>
                          <div className="mono" style={{ fontSize: '16px', fontWeight: 600 }}>{totalAllocated || '—'} pcs</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>CURRENT TENT STOCK</div>
                          <div className="mono" style={{ fontSize: '16px', fontWeight: 600, color: totalCurrentStock > 0 ? 'var(--ink)' : 'var(--muted)' }}>
                            {totalCurrentStock} pcs
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        {/* Step 1: Tent Worker Closeout Count */}
                        <button
                          type="button"
                          onClick={() => openTentCloseoutModal(loc.id)}
                          style={{
                            flex: 1,
                            padding: '8px',
                            fontSize: '12px',
                            fontWeight: 500,
                            border: '1px solid var(--line)',
                            background: 'var(--bg)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: 'var(--ink)'
                          }}
                        >
                          1. Tent Closeout Count
                        </button>

                        {/* Step 2: Warehouse Verification & Intake */}
                        <button
                          type="button"
                          onClick={() => openWhVerifyModal(loc.id)}
                          style={{
                            flex: 1,
                            padding: '8px',
                            fontSize: '12px',
                            fontWeight: 500,
                            border: 'none',
                            background: isReturnCounted ? 'var(--ink)' : 'var(--line)',
                            color: isReturnCounted ? '#FFFFFF' : 'var(--muted)',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          2. WH Intake Verify
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Event Transfer Audit Ledger */}
          <div className="card">
            <div className="card-head">
              <span>Event transfer manifests & verification records</span>
            </div>
            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>SKU</th>
                    <th className="num-cell">Outbound Sent</th>
                    <th className="num-cell">Tent Staff Count</th>
                    <th className="num-cell">WH Confirmed</th>
                    <th className="num-cell">Variance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {eventTransfers.map(t => {
                    const eventName = locations.find(l => l.id === t.event_id)?.name.split(' ')[0] || t.event_id;
                    const hasVariance = (t.variance ?? 0) !== 0;

                    return (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600 }}>{eventName}</td>
                        <td className="mono">{t.sku}</td>
                        <td className="num-cell">{t.allocated_qty}</td>
                        <td className="num-cell">{t.tent_staff_return_count ?? '—'}</td>
                        <td className="num-cell">{t.wh_verified_count ?? '—'}</td>
                        <td className={`num-cell ${hasVariance ? 'tag-negative' : ''}`}>
                          {t.variance !== null && t.variance !== undefined ? (t.variance > 0 ? `+${t.variance}` : t.variance) : '—'}
                        </td>
                        <td>
                          <span
                            className="mono"
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: t.status === 'verified_in_warehouse' ? 'var(--success)' : t.status === 'return_counted_by_staff' ? 'var(--amber)' : 'var(--muted)'
                            }}
                          >
                            {t.status === 'verified_in_warehouse' ? 'Verified in WH' : t.status === 'return_counted_by_staff' ? 'In Transit' : 'Dispatched'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: STOCK & CATALOG */}
      {/* ========================================================================= */}
      {activeTab === 'stock' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '24px' }}>
          {/* Dynamic Warehouse Stock-In */}
          <div className="card">
            <div className="card-head">
              <span>Warehouse stock-in</span>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg)', padding: '3px', borderRadius: '7px', border: '1px solid var(--line)' }}>
                <button
                  type="button"
                  onClick={() => setStockInMode('single')}
                  style={{
                    border: 'none',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 500,
                    borderRadius: '5px',
                    background: stockInMode === 'single' ? 'var(--panel)' : 'transparent',
                    color: stockInMode === 'single' ? 'var(--ink)' : 'var(--muted)',
                    boxShadow: stockInMode === 'single' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  Single Item
                </button>
                <button
                  type="button"
                  onClick={() => setStockInMode('multi')}
                  style={{
                    border: 'none',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 500,
                    borderRadius: '5px',
                    background: stockInMode === 'multi' ? 'var(--panel)' : 'transparent',
                    color: stockInMode === 'multi' ? 'var(--ink)' : 'var(--muted)',
                    boxShadow: stockInMode === 'multi' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  Apparel Matrix (Multi-Size)
                </button>
              </div>
            </div>

            <form className="form" onSubmit={handleStockInSubmit}>
              <div className="field">
                <span className="field-label">Item / Category</span>
                <input
                  type="text"
                  list="category-suggestions"
                  placeholder="e.g. Bucket Hat, Concert Merch, Hoodie"
                  value={stockInCategory}
                  onChange={(e) => setStockInCategory(e.target.value)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter', width: '220px' }}
                  required
                />
                <datalist id="category-suggestions">
                  <option value="Bucket Hat" />
                  <option value="Concert Merch" />
                  <option value="Fan Jersey" />
                  <option value="Crew Neck" />
                  <option value="Graphic Hoodie" />
                  <option value="KRU Replica" />
                  <option value="Festival Tee" />
                  <option value="Tote Bag" />
                  <option value="Snapback Cap" />
                </datalist>
              </div>

              <div className="field">
                <span className="field-label">Colourway</span>
                <input
                  type="text"
                  list="color-suggestions"
                  placeholder="e.g. Beige, Black, White, Red"
                  value={stockInColor}
                  onChange={(e) => setStockInColor(e.target.value)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter', width: '200px' }}
                  required
                />
                <datalist id="color-suggestions">
                  <option value="Black" />
                  <option value="Beige" />
                  <option value="White" />
                  <option value="Red" />
                  <option value="Navy" />
                  <option value="Grey" />
                  <option value="Green" />
                  <option value="Vintage Wash" />
                  <option value="Olive" />
                </datalist>
              </div>

              <div className="field">
                <span className="field-label">Retail Price (KES)</span>
                <input
                  type="number"
                  placeholder="e.g. 1500"
                  value={stockInPrice}
                  onChange={(e) => setStockInPrice(e.target.value)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontFamily: 'IBM Plex Mono', fontSize: '14px', width: '120px' }}
                  required
                />
              </div>

              {stockInMode === 'single' && (
                <>
                  <div className="field">
                    <span className="field-label">Size</span>
                    <input
                      type="text"
                      list="size-suggestions"
                      placeholder="e.g. One Size, M, L"
                      value={stockInSingleSize}
                      onChange={(e) => setStockInSingleSize(e.target.value)}
                      style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter', width: '140px' }}
                    />
                    <datalist id="size-suggestions">
                      <option value="One Size" />
                      <option value="Standard" />
                      <option value="XS" />
                      <option value="S" />
                      <option value="M" />
                      <option value="L" />
                      <option value="XL" />
                      <option value="2XL" />
                      <option value="3XL" />
                    </datalist>
                  </div>

                  <div className="field">
                    <span className="field-label">Quantity Received</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 50"
                      value={stockInSingleQty}
                      onChange={(e) => setStockInSingleQty(e.target.value)}
                      style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontFamily: 'IBM Plex Mono', fontSize: '14px', width: '100px' }}
                      required
                    />
                  </div>
                </>
              )}

              {stockInMode === 'multi' && (
                <div className="field block-field">
                  <span className="field-label" style={{ display: 'block', marginBottom: '8px' }}>Quantities by Size</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {stockInMultiSizes.map((szObj, idx) => (
                      <div key={szObj.size} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                        <span className="mono" style={{ fontSize: '12px', fontWeight: 600 }}>{szObj.size}</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={szObj.quantity}
                          onChange={(e) => {
                            const val = e.target.value;
                            setStockInMultiSizes(prev => prev.map((item, i) => i === idx ? { ...item, quantity: val } : item));
                          }}
                          style={{ width: '45px', border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontFamily: 'IBM Plex Mono', fontSize: '13px' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="field">
                <span className="field-label">Supplier / Batch Notes</span>
                <input
                  type="text"
                  placeholder="e.g. Supplier Batch #1, Drop #2"
                  value={stockInNotes}
                  onChange={(e) => setStockInNotes(e.target.value)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter', width: '220px' }}
                />
              </div>

              <button type="submit" className="submit" disabled={isPending}>
                Record warehouse stock-in
              </button>
            </form>
          </div>

          {/* Catalog & Baseline Pricing */}
          <div className="card">
            <div className="card-head">
              <span>SKU catalog & baseline pricing</span>
              <span className="mono" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Total registered SKUs: <strong>{catalog.length}</strong>
              </span>
            </div>
            <div style={{ padding: '0 0 12px 0', maxHeight: '440px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>SKU Variant</th>
                    <th>Category</th>
                    <th>Color / Size</th>
                    <th style={{ textAlign: 'right' }}>Price (KES)</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map(c => (
                    <tr key={c.sku}>
                      <td className="mono" style={{ fontWeight: 600 }}>{c.sku}</td>
                      <td>{c.category}</td>
                      <td>{c.color || 'Standard'} / {c.size || 'One Size'}</td>
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
      {/* TAB 4: CSV IMPORT */}
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
      {/* TAB 5: RECONCILIATION */}
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

      {/* ========================================================================= */}
      {/* MODAL 1: TENT STAFF CLOSEOUT COUNT MODAL */}
      {/* ========================================================================= */}
      {tentModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '540px' }}>
            <div className="card-head" style={{ padding: 0, marginBottom: '16px' }}>
              <span>Step 1: Tent Stock Closeout Handover Count</span>
              <button
                onClick={() => setTentModalOpen(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '13px' }}
              >
                Cancel
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
              Count all unsold merchandise remaining in the event tent before boxing and transport to the warehouse.
            </p>

            <form onSubmit={handleTentCloseoutSubmit}>
              <div className="field">
                <span className="field-label">Tent Staff Name</span>
                <input
                  type="text"
                  placeholder="e.g. Kelvin (Tent Manager)"
                  value={tentCountStaffName}
                  onChange={(e) => setTentCountStaffName(e.target.value)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter' }}
                  required
                />
              </div>

              <div style={{ maxHeight: '250px', overflowY: 'auto', margin: '14px 0', border: '1px solid var(--line)', borderRadius: '8px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SKU Variant</th>
                      <th className="num-cell">Expected Tent Stock</th>
                      <th className="num-cell">Staff Physical Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tentCountRows.map((r, idx) => (
                      <tr key={r.sku}>
                        <td className="mono" style={{ fontWeight: 600 }}>{r.sku}</td>
                        <td className="num-cell">{r.expectedQty} pcs</td>
                        <td className="num-cell">
                          <input
                            type="number"
                            min="0"
                            value={r.staffCount}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTentCountRows(prev => prev.map((item, i) => i === idx ? { ...item, staffCount: val } : item));
                            }}
                            style={{ width: '60px', border: '1px solid var(--line)', borderRadius: '5px', padding: '4px', textAlign: 'right', fontFamily: 'IBM Plex Mono', fontSize: '13px' }}
                            required
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="field">
                <span className="field-label">Handover Notes</span>
                <input
                  type="text"
                  placeholder="e.g. Boxed into 3 sealed crates"
                  value={tentCountNotes}
                  onChange={(e) => setTentCountNotes(e.target.value)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter', width: '220px' }}
                />
              </div>

              <button type="submit" className="submit" style={{ marginTop: '16px' }} disabled={isPending}>
                Submit tent count (Handover in transit)
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: WAREHOUSE INTAKE VERIFICATION & CONFIRMATION */}
      {/* ========================================================================= */}
      {whVerifyModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '600px' }}>
            <div className="card-head" style={{ padding: 0, marginBottom: '16px' }}>
              <span>Step 2: Warehouse Intake Verification</span>
              <button
                onClick={() => setWhVerifyModalOpen(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '13px' }}
              >
                Cancel
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
              Verify physical boxes returned from the event. Confirmed stock will be automatically transferred back into the Main Warehouse ledger.
            </p>

            <form onSubmit={handleWhVerifySubmit}>
              <div className="field">
                <span className="field-label">Warehouse Rep Name</span>
                <input
                  type="text"
                  placeholder="e.g. Sarah (Warehouse Lead)"
                  value={whVerifyStaffName}
                  onChange={(e) => setWhVerifyStaffName(e.target.value)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter' }}
                  required
                />
              </div>

              <div style={{ maxHeight: '250px', overflowY: 'auto', margin: '14px 0', border: '1px solid var(--line)', borderRadius: '8px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th className="num-cell">Tent Count</th>
                      <th className="num-cell">WH Intake Count</th>
                      <th className="num-cell">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whVerifyRows.map((r, idx) => {
                      const whNum = parseInt(r.whCount, 10) || 0;
                      const diff = whNum - r.staffCount;

                      return (
                        <tr key={r.sku}>
                          <td className="mono" style={{ fontWeight: 600 }}>{r.sku}</td>
                          <td className="num-cell">{r.staffCount} pcs</td>
                          <td className="num-cell">
                            <input
                              type="number"
                              min="0"
                              value={r.whCount}
                              onChange={(e) => {
                                const val = e.target.value;
                                setWhVerifyRows(prev => prev.map((item, i) => i === idx ? { ...item, whCount: val } : item));
                              }}
                              style={{ width: '60px', border: '1px solid var(--line)', borderRadius: '5px', padding: '4px', textAlign: 'right', fontFamily: 'IBM Plex Mono', fontSize: '13px' }}
                              required
                            />
                          </td>
                          <td className={`num-cell ${diff !== 0 ? 'tag-negative' : 'tag-green'}`}>
                            {diff !== 0 ? (diff > 0 ? `+${diff}` : diff) : '0 (OK)'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="field">
                <span className="field-label">Intake Confirmation Notes</span>
                <input
                  type="text"
                  placeholder="e.g. All 3 boxes verified & shelved"
                  value={whVerifyNotes}
                  onChange={(e) => setWhVerifyNotes(e.target.value)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontFamily: 'Inter', width: '220px' }}
                />
              </div>

              <button type="submit" className="submit" style={{ marginTop: '16px' }} disabled={isPending}>
                Confirm & add stock to main warehouse
              </button>
            </form>
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
