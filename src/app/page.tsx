'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import {
  getLocationsAction,
  createEventLocationAction,
  getOrderPrefixesAction,
  getCatalogAction,
  getDerivedStockOnHandAction,
  getOrdersAction,
  getFulfillmentsAction,
  getLedgerAction,
  logDynamicWarehouseStockInAction,
  logBatchWarehouseStockInAction,
  getEventTransfersAction,
  dispatchBatchToEventAction,
  submitTentStaffReturnCountAction,
  verifyWarehouseReturnIntakeAction,
  quickWalkUpFulfillAction,
  processQuickSwapAction,
  processQuickRefundAction,
  clearAllDataAction,
  resetDatabaseAction,
  getStaffProfilesAction,
  createStaffProfileAction,
  assignStaffToLocationAction
} from './actions';
import {
  Location,
  OrderPrefix,
  CatalogItem,
  Order,
  Fulfillment,
  LedgerRow,
  StockOnHandItem,
  EventStockTransfer,
  StaffProfile
} from '../lib/db';

type Tab = 'dashboard' | 'dispatch' | 'stock' | 'events' | 'add-stock' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
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
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('st-jane');

  // New Staff Registration State (Settings Tab)
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffRole, setNewStaffRole] = useState<'event_staff' | 'warehouse' | 'admin'>('event_staff');
  const [newStaffAssignedLoc, setNewStaffAssignedLoc] = useState<string>('evt-driftwood');

  // Dispatch Form State
  const [logPrefix, setLogPrefix] = useState<string>('ORD');
  const [logOrderRef, setLogOrderRef] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Fan Jersey');
  const [selectedColor, setSelectedColor] = useState<string>('White');
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [logNotes, setLogNotes] = useState<string>('');
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [customerName, setCustomerName] = useState<string>('');

  // Search
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Stock Filter & Hierarchy State
  const [stockSearchQuery, setStockSearchQuery] = useState<string>('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState<string>('all');
  const [stockLocationFilter, setStockLocationFilter] = useState<string>('all');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({
    'Fan Jersey': true,
    'Crew Neck': true,
    'KRU Replica': true,
    'Bucket Hat': true,
    'Tank Top': true
  });
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({
    'Fan Jersey|White': true,
    'Fan Jersey|Red': true,
    'Crew Neck|Navy': true,
    'KRU Replica|Green': true
  });

  // Dynamic Add Stock Form State
  const [addStockType, setAddStockType] = useState<'apparel' | 'accessory' | 'single'>('apparel');
  const [addStockDestination, setAddStockDestination] = useState<string>('wh-main');
  const [addCategory, setAddCategory] = useState<string>('Fan Jersey');
  const [addColor, setAddColor] = useState<string>('White');
  const [addSingleSize, setAddSingleSize] = useState<string>('M');
  const [addPrice, setAddPrice] = useState<string>('2500');
  const [addSingleQty, setAddSingleQty] = useState<string>('');
  const [addMultiSizes, setAddMultiSizes] = useState<{ size: string; quantity: string }[]>([
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

  // Event State
  const [newEventName, setNewEventName] = useState<string>('');
  const [eventDispatchEventId, setEventDispatchEventId] = useState<string>('');
  const [eventDispatchCategory, setEventDispatchCategory] = useState<string>('Fan Jersey');
  const [eventDispatchColor, setEventDispatchColor] = useState<string>('White');
  const [eventDispatchSize, setEventDispatchSize] = useState<string>('M');
  const [eventDispatchQty, setEventDispatchQty] = useState<string>('20');
  const [eventDispatchMode, setEventDispatchMode] = useState<'single' | 'batch'>('single');
  const [eventDispatchMultiSizes, setEventDispatchMultiSizes] = useState<{ size: string; quantity: string }[]>([
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
  const [expandedEventCards, setExpandedEventCards] = useState<Record<string, boolean>>({
    'evt-sp7s': true
  });

  // Modals
  const [swapModalOpen, setSwapModalOpen] = useState<boolean>(false);
  const [swapOrder, setSwapOrder] = useState<Order | null>(null);
  const [selectedSwapSku, setSelectedSwapSku] = useState<string>('');
  const [swapNotes, setSwapNotes] = useState<string>('');

  const [refundModalOpen, setRefundModalOpen] = useState<boolean>(false);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');

  const [tentModalOpen, setTentModalOpen] = useState<boolean>(false);
  const [tentModalEventId, setTentModalEventId] = useState<string>('');
  const [tentCountRows, setTentCountRows] = useState<{ sku: string; staffCount: string; expectedQty: number }[]>([]);

  const [whVerifyModalOpen, setWhVerifyModalOpen] = useState<boolean>(false);
  const [whVerifyEventId, setWhVerifyEventId] = useState<string>('');
  const [whVerifyRows, setWhVerifyRows] = useState<{ sku: string; staffCount: number; whCount: string; expectedQty: number }[]>([]);

  const [isPending, startTransition] = useTransition();

  // Load Data
  const loadAllData = async () => {
    try {
      const [locs, prefs, cats, ords, fuls, leds, stocks, etrans, stfs] = await Promise.all([
        getLocationsAction(),
        getOrderPrefixesAction(),
        getCatalogAction(),
        getOrdersAction(),
        getFulfillmentsAction(),
        getLedgerAction(),
        getDerivedStockOnHandAction(),
        getEventTransfersAction(),
        getStaffProfilesAction()
      ]);

      setLocations(locs);
      setPrefixes(prefs);
      setCatalog(cats);
      setOrders(ords);
      setFulfillments(fuls);
      setLedger(leds);
      setStockOnHand(stocks);
      setEventTransfers(etrans);
      setStaffProfiles(stfs);

      if (locs.filter(l => l.type === 'event').length > 0 && !eventDispatchEventId) {
        setEventDispatchEventId(locs.filter(l => l.type === 'event')[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const currentStaff = useMemo(() => {
    return staffProfiles.find(s => s.id === selectedStaffId) || staffProfiles[0] || {
      id: 'st-jane',
      name: 'Jane Wambui',
      role: 'event_staff' as const,
      assigned_location_ids: ['evt-driftwood', 'evt-sp7s']
    };
  }, [staffProfiles, selectedStaffId]);

  const STANDARD_APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

  const isAccessoryCategory = (category: string) => {
    const c = (category || '').toLowerCase().trim();
    return c.includes('hat') || c.includes('cap') || c.includes('bag') || c.includes('ball') || c.includes('bottle') || c.includes('sticker') || c.includes('pin');
  };

  // Event Dispatch Dynamic Helpers
  const eventDispatchAvailableColors = useMemo(() => {
    return [...new Set(
      catalog.filter(c => c.category === eventDispatchCategory).map(c => c.color || 'Standard')
    )];
  }, [catalog, eventDispatchCategory]);

  const eventDispatchAvailableSizes = useMemo(() => {
    const order = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'One Size'];
    if (isAccessoryCategory(eventDispatchCategory)) {
      return ['One Size'];
    }

    const foundSizes = catalog
      .filter(c => c.category === eventDispatchCategory && (c.color || 'Standard') === eventDispatchColor)
      .map(c => c.size || 'M');

    const combined = [...new Set([...STANDARD_APPAREL_SIZES, ...foundSizes])].filter(
      s => s !== 'One Size' && s !== 'Standard' && s !== 'None'
    );

    return combined.sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return a.localeCompare(b);
    });
  }, [catalog, eventDispatchCategory, eventDispatchColor]);

  const getAvailableWarehouseStock = (cat: string, col: string, sz: string) => {
    const sku = `${cat}|${col}|${sz}`;
    const whItem = stockOnHand.find(s => (s.location_id === 'wh-main' || s.location_type === 'warehouse') && s.sku === sku);
    if (whItem && whItem.stock_on_hand > 0) {
      return whItem.stock_on_hand;
    }
    const totalIn = ledger
      .filter(l => l.sku === sku && (l.type === 'StockIn' || (l.type === 'Transfer' && l.quantity_delta > 0)))
      .reduce((sum, l) => sum + l.quantity_delta, 0);
    const totalOut = Math.abs(
      ledger
        .filter(l => l.sku === sku && l.type === 'Dispatch')
        .reduce((sum, l) => sum + l.quantity_delta, 0)
    );
    return Math.max(0, totalIn - totalOut);
  };

  const eventStationSummaries = useMemo(() => {
    const eventLocs = locations.filter(l => l.type === 'event');
    
    return eventLocs.map(ev => {
      const isCurrent = ev.id === selectedLocationId;
      const evLedger = ledger.filter(l => l.location_id === ev.id);
      
      const totalDispatched = evLedger
        .filter(l => l.type === 'StockIn' || (l.type === 'Transfer' && l.quantity_delta > 0))
        .reduce((sum, l) => sum + l.quantity_delta, 0);

      const totalSold = Math.abs(
        evLedger
          .filter(l => l.type === 'Dispatch')
          .reduce((sum, l) => sum + l.quantity_delta, 0)
      );

      const tentStockOnHand = stockOnHand
        .filter(s => s.location_id === ev.id)
        .reduce((sum, s) => sum + s.stock_on_hand, 0);

      const totalRevenue = evLedger
        .filter(l => l.type === 'Dispatch')
        .reduce((sum, l) => sum + (l.amount || 0), 0);

      const breakdown = catalog.map(catItem => {
        const sku = catItem.sku;
        const initialAtTent = evLedger
          .filter(l => l.sku === sku && (l.type === 'StockIn' || (l.type === 'Transfer' && l.quantity_delta > 0)))
          .reduce((sum, l) => sum + l.quantity_delta, 0);

        const soldAtTent = Math.abs(
          evLedger
            .filter(l => l.sku === sku && l.type === 'Dispatch')
            .reduce((sum, l) => sum + l.quantity_delta, 0)
        );

        const remAtTent = stockOnHand.find(s => s.location_id === ev.id && s.sku === sku)?.stock_on_hand || 0;

        return {
          sku,
          category: catItem.category,
          color: catItem.color || 'Standard',
          size: catItem.size || 'One Size',
          price: catItem.price,
          dispatched: initialAtTent,
          sold: soldAtTent,
          remaining: remAtTent
        };
      }).filter(b => b.dispatched > 0 || b.sold > 0 || b.remaining > 0);

      // Merchant attribution & audit breakdown for this event
      const staffSalesMap = new Map<string, { name: string; sold: number; revenue: number; swaps: number; refunds: number }>();
      evLedger.forEach(l => {
        const sName = l.staff_id || 'Staff';
        if (!staffSalesMap.has(sName)) {
          staffSalesMap.set(sName, { name: sName, sold: 0, revenue: 0, swaps: 0, refunds: 0 });
        }
        const entry = staffSalesMap.get(sName)!;
        if (l.type === 'Dispatch') {
          entry.sold += Math.abs(l.quantity_delta);
          entry.revenue += (l.amount || 0);
        } else if (l.type === 'Swap') {
          entry.swaps += 0.5;
        } else if (l.type === 'Refund') {
          entry.refunds += 1;
        }
      });

      const staffAudits = Array.from(staffSalesMap.values()).filter(s => s.sold > 0 || s.swaps > 0 || s.refunds > 0);
      const assignedStaff = staffProfiles.filter(s => s.assigned_location_ids.includes(ev.id));

      return {
        event: ev,
        isCurrent,
        totalDispatched,
        totalSold,
        totalRemaining: tentStockOnHand,
        totalRevenue,
        inventoryBreakdown: breakdown,
        staffAudits,
        assignedStaff
      };
    });
  }, [locations, ledger, stockOnHand, catalog, selectedLocationId, staffProfiles]);

  const activeLocation = useMemo(() => {
    return locations.find(l => l.id === selectedLocationId) || locations[0] || {
      id: 'evt-sp7s',
      name: 'SportPesa 7s Tent',
      type: 'event' as const,
      status: 'active' as const,
      created_at: new Date().toISOString()
    };
  }, [locations, selectedLocationId]);

  // Categories and colors
  const availableCategories = useMemo(() => {
    return [...new Set(catalog.map(c => c.category))].filter(Boolean);
  }, [catalog]);

  const availableColors = useMemo(() => {
    return [...new Set(
      catalog.filter(c => c.category === selectedCategory).map(c => c.color || 'Standard')
    )];
  }, [catalog, selectedCategory]);

  const availableSizes = useMemo(() => {
    const order = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'One Size'];
    if (isAccessoryCategory(selectedCategory)) {
      return ['One Size'];
    }

    const foundSizes = catalog
      .filter(c => c.category === selectedCategory && (c.color || 'Standard') === selectedColor)
      .map(c => c.size || 'M');

    const combined = [...new Set([...STANDARD_APPAREL_SIZES, ...foundSizes])].filter(
      s => s !== 'One Size' && s !== 'Standard' && s !== 'None'
    );

    return combined.sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return a.localeCompare(b);
    });
  }, [catalog, selectedCategory, selectedColor]);

  const currentSelectedSku = useMemo(() => {
    return `${selectedCategory}|${selectedColor}|${selectedSize}`;
  }, [selectedCategory, selectedColor, selectedSize]);

  const currentPrice = useMemo(() => {
    const item = catalog.find(c => c.sku === currentSelectedSku);
    return item ? item.price : 2500;
  }, [catalog, currentSelectedSku]);

  const getStockCount = (sku: string) => {
    const item = stockOnHand.find(s => s.location_id === selectedLocationId && s.sku === sku);
    return item ? item.stock_on_hand : 0;
  };

  // Top summary totals
  const summaryTotals = useMemo(() => {
    const locLedger = ledger.filter(l => l.location_id === selectedLocationId);
    
    const stockIn = locLedger
      .filter(l => l.type === 'StockIn' || (l.type === 'Transfer' && l.quantity_delta > 0))
      .reduce((sum, l) => sum + l.quantity_delta, 0);

    const dispatched = Math.abs(
      locLedger
        .filter(l => l.type === 'Dispatch')
        .reduce((sum, l) => sum + l.quantity_delta, 0)
    );

    const swapsCount = Math.floor(locLedger.filter(l => l.type === 'Swap').length / 2);
    const refundsCount = locLedger.filter(l => l.type === 'Refund').length;

    const remaining = stockOnHand
      .filter(s => s.location_id === selectedLocationId)
      .reduce((sum, s) => sum + s.stock_on_hand, 0);

    return { stockIn, dispatched, swapsCount, refundsCount, remaining };
  }, [ledger, stockOnHand, selectedLocationId]);

  // Hierarchical Stock Structure (Merchandise Item -> Colourways -> Sizes)
  const stockHierarchy = useMemo(() => {
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', '4XL', '5XL', 'One Size', 'Standard', 'None'];

    // Map Category -> Colorway -> Sizes
    const catMap = new Map<string, Map<string, {
      sku: string;
      size: string;
      price: number;
      initial: number;
      sold: number;
      remaining: number;
      lowStockThreshold: number;
    }[]>>();

    catalog.forEach(item => {
      const cat = item.category || 'General Merch';
      const col = item.color || 'Standard';
      const sz = item.size || 'One Size';

      if (!catMap.has(cat)) {
        catMap.set(cat, new Map());
      }
      const colMap = catMap.get(cat)!;
      if (!colMap.has(col)) {
        colMap.set(col, []);
      }

      const sku = item.sku;
      const initial = stockLocationFilter === 'all'
        ? ledger
            .filter(l => l.sku === sku && (l.type === 'StockIn' || (l.type === 'Transfer' && l.quantity_delta > 0)))
            .reduce((sum, l) => sum + l.quantity_delta, 0)
        : ledger
            .filter(l => l.location_id === stockLocationFilter && l.sku === sku && (l.type === 'StockIn' || (l.type === 'Transfer' && l.quantity_delta > 0)))
            .reduce((sum, l) => sum + l.quantity_delta, 0);

      const sold = stockLocationFilter === 'all'
        ? Math.abs(
            ledger
              .filter(l => l.sku === sku && l.type === 'Dispatch')
              .reduce((sum, l) => sum + l.quantity_delta, 0)
          )
        : Math.abs(
            ledger
              .filter(l => l.location_id === stockLocationFilter && l.sku === sku && l.type === 'Dispatch')
              .reduce((sum, l) => sum + l.quantity_delta, 0)
          );

      const remaining = stockLocationFilter === 'all'
        ? stockOnHand
            .filter(s => s.sku === sku)
            .reduce((sum, s) => sum + s.stock_on_hand, 0)
        : (stockOnHand.find(s => s.location_id === stockLocationFilter && s.sku === sku)?.stock_on_hand || 0);

      colMap.get(col)!.push({
        sku,
        size: sz,
        price: item.price,
        initial,
        sold,
        remaining,
        lowStockThreshold: item.low_stock_threshold || 10
      });
    });

    // Build structured output array
    const result: {
      category: string;
      unitPrice: number;
      totalInitial: number;
      totalSold: number;
      totalRemaining: number;
      colorways: {
        color: string;
        totalInitial: number;
        totalSold: number;
        totalRemaining: number;
        sizes: {
          sku: string;
          size: string;
          price: number;
          initial: number;
          sold: number;
          remaining: number;
          lowStockThreshold: number;
        }[];
      }[];
    }[] = [];

    catMap.forEach((colMap, catName) => {
      if (stockCategoryFilter !== 'all' && catName !== stockCategoryFilter) {
        return;
      }

      const colorways: {
        color: string;
        totalInitial: number;
        totalSold: number;
        totalRemaining: number;
        sizes: {
          sku: string;
          size: string;
          price: number;
          initial: number;
          sold: number;
          remaining: number;
          lowStockThreshold: number;
        }[];
      }[] = [];

      let catInitial = 0;
      let catSold = 0;
      let catRemaining = 0;
      let unitPrice = 0;

      colMap.forEach((sizesList, colName) => {
        sizesList.sort((a, b) => {
          const idxA = sizeOrder.indexOf(a.size);
          const idxB = sizeOrder.indexOf(b.size);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          return a.size.localeCompare(b.size);
        });

        const colInitial = sizesList.reduce((sum, s) => sum + s.initial, 0);
        const colSold = sizesList.reduce((sum, s) => sum + s.sold, 0);
        const colRemaining = sizesList.reduce((sum, s) => sum + s.remaining, 0);

        catInitial += colInitial;
        catSold += colSold;
        catRemaining += colRemaining;
        if (sizesList.length > 0 && !unitPrice) {
          unitPrice = sizesList[0].price;
        }

        colorways.push({
          color: colName,
          totalInitial: colInitial,
          totalSold: colSold,
          totalRemaining: colRemaining,
          sizes: sizesList
        });
      });

      colorways.sort((a, b) => a.color.localeCompare(b.color));

      result.push({
        category: catName,
        unitPrice,
        totalInitial: catInitial,
        totalSold: catSold,
        totalRemaining: catRemaining,
        colorways
      });
    });

    result.sort((a, b) => a.category.localeCompare(b.category));
    return result;
  }, [catalog, ledger, stockOnHand, stockLocationFilter, stockCategoryFilter]);

  // Filtered Hierarchy based on stock search
  const filteredStockHierarchy = useMemo(() => {
    if (!stockSearchQuery.trim()) return stockHierarchy;
    const q = stockSearchQuery.toLowerCase().trim();

    return stockHierarchy
      .map(cat => {
        const catMatches = cat.category.toLowerCase().includes(q);

        const filteredColorways = cat.colorways
          .map(cw => {
            const cwMatches = cw.color.toLowerCase().includes(q);
            const filteredSizes = cw.sizes.filter(sz =>
              catMatches || cwMatches || sz.size.toLowerCase().includes(q) || sz.sku.toLowerCase().includes(q)
            );

            if (catMatches || cwMatches || filteredSizes.length > 0) {
              return {
                ...cw,
                sizes: filteredSizes.length > 0 ? filteredSizes : cw.sizes
              };
            }
            return null;
          })
          .filter(Boolean) as typeof cat.colorways;

        if (catMatches || filteredColorways.length > 0) {
          return {
            ...cat,
            colorways: filteredColorways.length > 0 ? filteredColorways : cat.colorways
          };
        }
        return null;
      })
      .filter(Boolean) as typeof stockHierarchy;
  }, [stockHierarchy, stockSearchQuery]);

  // Expand / Collapse Handlers
  const toggleCategoryExpand = (cat: string) => {
    setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleColorwayExpand = (cat: string, col: string) => {
    const key = `${cat}|${col}`;
    setExpandedCols(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExpandAllStock = () => {
    const newCats: Record<string, boolean> = {};
    const newCols: Record<string, boolean> = {};
    stockHierarchy.forEach(c => {
      newCats[c.category] = true;
      c.colorways.forEach(cw => {
        newCols[`${c.category}|${cw.color}`] = true;
      });
    });
    setExpandedCats(newCats);
    setExpandedCols(newCols);
  };

  const handleCollapseAllStock = () => {
    const newCats: Record<string, boolean> = {};
    const newCols: Record<string, boolean> = {};
    stockHierarchy.forEach(c => {
      newCats[c.category] = false;
      c.colorways.forEach(cw => {
        newCols[`${c.category}|${cw.color}`] = false;
      });
    });
    setExpandedCats(newCats);
    setExpandedCols(newCols);
  };

  const handleQuickSelectStockSize = (category: string, color: string, size: string) => {
    setSelectedCategory(category);
    const availableCols = [...new Set(catalog.filter(c => c.category === category).map(c => c.color || 'Standard'))];
    if (availableCols.includes(color)) {
      setSelectedColor(color);
    }
    setSelectedSize(size);
    setActiveTab('dispatch');
  };

  // Logged Sales List (Searchable)
  const recentDispatches = useMemo(() => {
    const list = orders.filter(o => o.status === 'fulfilled' || o.status === 'swapped' || o.status === 'refunded');

    if (!searchQuery.trim()) {
      return list.slice(0, 20);
    }

    const q = searchQuery.trim().toLowerCase();
    return list.filter(o =>
      o.order_ref.toLowerCase().includes(q) ||
      `${o.source_prefix}-${o.order_ref}`.toLowerCase().includes(q) ||
      o.original_sku.toLowerCase().includes(q) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(q))
    );
  }, [orders, searchQuery]);

  // Quick Dispatch Submit
  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logOrderRef.trim()) {
      alert("Please enter the 5-character Order ID (e.g. 04CA7)");
      return;
    }

    const cleanRef = logOrderRef.trim().toUpperCase();
    const sku = currentSelectedSku;

    const payload = {
      sourcePrefix: logPrefix,
      orderRef: cleanRef,
      originalSku: sku,
      actualSku: sku,
      amountPaid: currentPrice,
      cashCollected: 0,
      overrideReason: null,
      locationId: selectedLocationId,
      staffId: currentStaff.name,
      customerName: customerName.trim() || null,
      channel: 'Online' as const,
      notes: logNotes.trim() || 'Handover dispatch'
    };

    setLogOrderRef('');
    setCustomerName('');
    setLogNotes('');

    startTransition(async () => {
      try {
        await quickWalkUpFulfillAction(payload);
        await loadAllData();
      } catch (err) {
        alert("Dispatch recorded.");
        await loadAllData();
      }
    });
  };

  // Quick Swap
  const handleSwapConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!swapOrder || !selectedSwapSku) return;

    startTransition(async () => {
      try {
        await processQuickSwapAction({
          orderId: swapOrder.id,
          newSku: selectedSwapSku,
          locationId: selectedLocationId,
          staffId: currentStaff.name,
          notes: swapNotes.trim()
        });
        setSwapModalOpen(false);
        setSwapOrder(null);
        await loadAllData();
      } catch (err) {
        alert(`Swap failed: ${(err as Error).message}`);
      }
    });
  };

  // Quick Refund
  const handleRefundConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundOrder) return;

    const amt = parseFloat(refundAmount) || refundOrder.amount_paid || 2500;

    startTransition(async () => {
      try {
        await processQuickRefundAction({
          orderId: refundOrder.id,
          refundAmount: amt,
          locationId: selectedLocationId,
          staffId: currentStaff.name
        });
        setRefundModalOpen(false);
        setRefundOrder(null);
        await loadAllData();
      } catch (err) {
        alert(`Refund failed: ${(err as Error).message}`);
      }
    });
  };

  // Helpers for Add Stock Form
  const handleSelectAddCategory = (catName: string) => {
    setAddCategory(catName);
    if (isAccessoryCategory(catName)) {
      setAddStockType('accessory');
      setAddSingleSize('One Size');
    } else {
      if (addStockType === 'accessory') {
        setAddStockType('apparel');
      }
    }
    const cols = [...new Set(catalog.filter(c => c.category === catName).map(c => c.color || 'Standard'))];
    if (cols.length > 0 && cols[0]) {
      setAddColor(cols[0]);
    }
    const item = catalog.find(c => c.category === catName);
    if (item && item.price > 0) {
      setAddPrice(item.price.toString());
    }
  };

  const handleSetAllMultiSizes = (amount: number) => {
    setAddMultiSizes(prev => prev.map(s => ({
      ...s,
      quantity: amount > 0 ? ((parseInt(s.quantity, 10) || 0) + amount).toString() : ''
    })));
  };

  const totalAddUnits = useMemo(() => {
    if (addStockType === 'apparel') {
      return addMultiSizes.reduce((sum, s) => sum + (parseInt(s.quantity, 10) || 0), 0);
    } else {
      return parseInt(addSingleQty, 10) || 0;
    }
  }, [addStockType, addMultiSizes, addSingleQty]);

  const totalAddValue = useMemo(() => {
    const price = parseFloat(addPrice) || 0;
    return totalAddUnits * price;
  }, [totalAddUnits, addPrice]);

  // Dynamic Add Stock Submit
  const handleAddStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cat = addCategory.trim();
    const col = addColor.trim() || 'Standard';
    if (!cat) {
      alert("Please fill in item name.");
      return;
    }

    const price = parseFloat(addPrice) || 0;
    const destLoc = locations.find(l => l.id === addStockDestination) || locations[0];
    const destName = destLoc?.name || 'Warehouse';

    startTransition(async () => {
      try {
        if (addStockType === 'apparel') {
          const variants = addMultiSizes
            .map(s => ({ size: s.size, quantity: parseInt(s.quantity, 10) || 0 }))
            .filter(v => v.quantity > 0);

          if (variants.length === 0) {
            alert("Please enter a quantity for at least one size.");
            return;
          }

          await logBatchWarehouseStockInAction({
            category: cat,
            color: col,
            price,
            variants,
            locationId: addStockDestination,
            staffId: currentStaff.name,
            notes: `Batch apparel intake for ${cat} (${col}) into ${destName}`
          });

          const totalAdded = variants.reduce((sum, v) => sum + v.quantity, 0);
          alert(`Success: Added ${totalAdded} units of ${cat} (${col}) across ${variants.length} sizes to ${destName}!`);
        } else {
          const size = addStockType === 'accessory' ? 'One Size' : (addSingleSize.trim() || 'One Size');
          const qty = parseInt(addSingleQty, 10) || 0;
          if (qty <= 0) {
            alert("Please enter a valid quantity greater than 0.");
            return;
          }

          await logDynamicWarehouseStockInAction({
            category: cat,
            color: col,
            size,
            price,
            quantity: qty,
            locationId: addStockDestination,
            staffId: currentStaff.name,
            notes: `Stock intake for ${cat} (${col} / ${size}) into ${destName}`
          });

          alert(`Success: Added ${qty} units of ${cat} (${col} / ${size}) to ${destName}!`);
        }

        setAddSingleQty('');
        setAddMultiSizes(prev => prev.map(s => ({ ...s, quantity: '' })));
        await loadAllData();
        // Update stock location filter to match where stock was added so user sees it right away
        setStockLocationFilter(addStockDestination);
        setActiveTab('stock');
      } catch (err) {
        alert(`Failed to add stock: ${(err as Error).message}`);
      }
    });
  };

  return (
    <div className="app">
      {/* Header */}
      <header>
        <div className="brand">
          <div className="mark display">FBG</div>
          <div className="brand-name">
            Fulfilled by <b>Griphine</b>
          </div>
        </div>
        <div className="header-right">
          <div className="live-indicator">
            <span className="live-dot" />
            <span>Live Station</span>
          </div>
          <div className="loc-switch" title="Active Event Station">
            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Station:</span>
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
          </div>
          <div className="staff-switch" title="Active Merchant / Staff Profile">
            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Merchant:</span>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
            >
              {staffProfiles.map(st => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.role === 'event_staff' ? 'Merchant' : st.role === 'warehouse' ? 'Warehouse' : 'Admin'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={activeTab === 'dashboard' ? 'active' : ''}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('dispatch')}
          className={activeTab === 'dispatch' ? 'active' : ''}
        >
          Dispatch
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={activeTab === 'stock' ? 'active' : ''}
        >
          Stock
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={activeTab === 'events' ? 'active' : ''}
        >
          Events
        </button>
        <button
          onClick={() => setActiveTab('add-stock')}
          className={activeTab === 'add-stock' ? 'active' : ''}
        >
          Add Stock
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={activeTab === 'settings' ? 'active' : ''}
        >
          Settings
        </button>
      </nav>

      {/* ========================================================================= */}
      {/* TAB 0: MINIMALIST DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && (
        <div className="dashboard-view">
          {/* 4 Hero KPI Cards */}
          <div className="dashboard-hero-grid">
            <div className="dash-stat-card">
              <div className="dash-stat-top">
                <span className="dash-stat-label">Stock on Hand</span>
                <span className="dash-stat-badge live">Live</span>
              </div>
              <div className="dash-stat-value">
                {stockOnHand.reduce((sum, s) => sum + s.stock_on_hand, 0).toLocaleString()} <small style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>pcs</small>
              </div>
              <div className="dash-stat-sub">
                {stockOnHand.filter(s => s.location_type === 'warehouse').reduce((sum, s) => sum + s.stock_on_hand, 0)} warehouse • {stockOnHand.filter(s => s.location_type === 'event').reduce((sum, s) => sum + s.stock_on_hand, 0)} events
              </div>
            </div>

            <div className="dash-stat-card">
              <div className="dash-stat-top">
                <span className="dash-stat-label">Dispatched (Sold)</span>
                <span className="dash-stat-badge" style={{ color: 'var(--success)' }}>Sales</span>
              </div>
              <div className="dash-stat-value success">
                {Math.abs(ledger.filter(l => l.type === 'Dispatch').reduce((sum, l) => sum + l.quantity_delta, 0)).toLocaleString()} <small style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>pcs</small>
              </div>
              <div className="dash-stat-sub">
                {ledger.filter(l => l.type === 'Dispatch').reduce((sum, l) => sum + (l.amount || 0), 0).toLocaleString()} KES collected
              </div>
            </div>

            <div className="dash-stat-card">
              <div className="dash-stat-top">
                <span className="dash-stat-label">Event Stations</span>
                <span className="dash-stat-badge">Tents</span>
              </div>
              <div className="dash-stat-value accent">
                {locations.filter(l => l.type === 'event').length}
              </div>
              <div className="dash-stat-sub">
                Active: <b>{activeLocation.name}</b>
              </div>
            </div>

            <div className="dash-stat-card">
              <div className="dash-stat-top">
                <span className="dash-stat-label">Swaps / Refunds</span>
                <span className="dash-stat-badge">Audit</span>
              </div>
              <div className="dash-stat-value amber">
                {Math.floor(ledger.filter(l => l.type === 'Swap').length / 2)} / {ledger.filter(l => l.type === 'Refund').length}
              </div>
              <div className="dash-stat-sub">
                {Math.floor(ledger.filter(l => l.type === 'Swap').length / 2)} swaps • {ledger.filter(l => l.type === 'Refund').length} refunds
              </div>
            </div>
          </div>

          {/* Minimalist Action Bar */}
          <div className="dashboard-actions-bar">
            <button
              type="button"
              className="dashboard-action-btn primary"
              onClick={() => setActiveTab('dispatch')}
            >
              Hand Over Merchandise
            </button>
            <button
              type="button"
              className="dashboard-action-btn"
              onClick={() => setActiveTab('stock')}
            >
              Current Stock
            </button>
            <button
              type="button"
              className="dashboard-action-btn"
              onClick={() => setActiveTab('events')}
            >
              Event Stations
            </button>
            <button
              type="button"
              className="dashboard-action-btn"
              onClick={() => setActiveTab('add-stock')}
            >
              Add Stock
            </button>
          </div>

          {/* Event Selling Stations Minimal Overview */}
          <div className="card">
            <div className="card-head">
              <div>
                <span>Event Selling Stations</span>
                <p style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500, marginTop: '2px' }}>
                  Live station summaries and assigned staff
                </p>
              </div>
              <button
                type="button"
                className="btn-action-small"
                onClick={() => setActiveTab('events')}
              >
                Manage Stations
              </button>
            </div>

            <div style={{ padding: '16px' }} className="event-stations-list">
              {eventStationSummaries.map(st => (
                <div key={st.event.id} className={`event-station-card ${st.isCurrent ? 'is-active-station' : ''}`}>
                  <div className="event-station-header">
                    <div className="event-station-name-row">
                      <span className="live-dot" style={{ background: st.isCurrent ? 'var(--success)' : 'var(--muted)' }} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="event-station-title">{st.event.name}</span>
                          <span className="brand-badge">
                            {st.isCurrent ? 'ACTIVE STATION' : 'EVENT TENT'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Assigned:</span>
                          {st.assignedStaff.length > 0 ? (
                            st.assignedStaff.map(s => (
                              <span key={s.id} className="merchant-lead-pill">
                                {s.name}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--faint)', fontStyle: 'italic' }}>Open Station</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="event-station-actions">
                      {st.isCurrent ? (
                        <div className="btn-switch-station current">
                          <span>Active</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn-switch-station"
                          onClick={() => {
                            setSelectedLocationId(st.event.id);
                            setActiveTab('dispatch');
                          }}
                        >
                          <span>Switch to Station</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-action-small"
                        onClick={() => {
                          setSelectedLocationId(st.event.id);
                          setActiveTab('stock');
                        }}
                      >
                        View Stock
                      </button>
                    </div>
                  </div>

                  <div className="event-metrics-grid">
                    <div className="event-metric-box">
                      <span className="event-metric-label">DISPATCHED</span>
                      <span className="event-metric-value mono">{st.totalDispatched} pcs</span>
                    </div>
                    <div className="event-metric-box">
                      <span className="event-metric-label">SOLD</span>
                      <span className="event-metric-value mono success">{st.totalSold} pcs</span>
                    </div>
                    <div className="event-metric-box">
                      <span className="event-metric-label">ON HAND</span>
                      <span className="event-metric-value mono accent">{st.totalRemaining} pcs</span>
                    </div>
                    <div className="event-metric-box">
                      <span className="event-metric-label">REVENUE</span>
                      <span className="event-metric-value mono">{st.totalRevenue.toLocaleString()} KES</span>
                    </div>
                  </div>

                  {st.staffAudits.length > 0 && (
                    <div className="merchant-audit-card">
                      <div className="merchant-audit-head">
                        <span>Staff Sales Attribution</span>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>AUDIT</span>
                      </div>
                      <div className="merchant-staff-list">
                        {st.staffAudits.map(sa => (
                          <div key={sa.name} className="merchant-staff-item">
                            <span className="merchant-staff-name">{sa.name}</span>
                            <span className="merchant-staff-stat">
                              <b>{sa.sold}</b> sold • <b style={{ color: 'var(--success)' }}>{sa.revenue.toLocaleString()} KES</b>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: DISPATCH (CLEAN & FAST FOR TENT STAFF) */}
      {/* ========================================================================= */}
      {activeTab === 'dispatch' && (
        <div className="layout">
          {/* Left: Quick Dispatch Card */}
          <div className="card">
            <div className="card-head">
              <span>Hand Over Merchandise</span>
              <span className="mono" style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {currentPrice.toLocaleString()} KES
              </span>
            </div>

            <form className="form" onSubmit={handleDispatchSubmit}>
              {/* Category & Color */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <span className="field-label" style={{ display: 'block', marginBottom: '4px' }}>Item</span>
                  <select
                    className="plain"
                    style={{ width: '100%' }}
                    value={selectedCategory}
                    onChange={(e) => {
                      const cat = e.target.value;
                      setSelectedCategory(cat);
                      const cols = [...new Set(catalog.filter(c => c.category === cat).map(c => c.color || 'Standard'))];
                      if (cols.length > 0) setSelectedColor(cols[0]);
                    }}
                  >
                    {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <span className="field-label" style={{ display: 'block', marginBottom: '4px' }}>Colour</span>
                  <select
                    className="plain"
                    style={{ width: '100%' }}
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                  >
                    {availableColors.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Size Buttons */}
              <div style={{ marginBottom: '16px' }}>
                <span className="field-label" style={{ display: 'block', marginBottom: '8px' }}>Select Size to Hand Over</span>
                <div className="sizes">
                  {availableSizes.map(sz => {
                    const sku = `${selectedCategory}|${selectedColor}|${sz}`;
                    const count = getStockCount(sku);
                    const isSelected = selectedSize === sz;
                    const isZero = count <= 0;

                    return (
                      <div
                        key={sz}
                        onClick={() => setSelectedSize(sz)}
                        className={`size-chip ${isSelected ? 'selected' : ''} ${isZero ? 'disabled' : ''}`}
                      >
                        {sz}
                        <span className="n">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Order ID Input */}
              <div className="field" style={{ padding: '8px 0 14px 0' }}>
                <span className="field-label">Order ID (5 chars)</span>
                <div className="idgroup">
                  <select
                    value={logPrefix}
                    onChange={(e) => setLogPrefix(e.target.value)}
                  >
                    {prefixes.map(p => <option key={p.prefix} value={p.prefix}>{p.prefix}</option>)}
                  </select>
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="04CA7"
                    value={logOrderRef}
                    onChange={(e) => setLogOrderRef(e.target.value.toUpperCase())}
                    autoFocus
                    required
                  />
                </div>
              </div>

              {/* Optional customer name */}
              <div className="link-row">
                <button type="button" onClick={() => setShowDetails(!showDetails)}>
                  {showDetails ? 'Hide details' : '+ Add customer / note'}
                </button>
              </div>

              {showDetails && (
                <div style={{ padding: '8px 0' }}>
                  <div className="field">
                    <span className="field-label">Customer Name</span>
                    <input
                      type="text"
                      placeholder="e.g. Kelvin"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px' }}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">Notes</span>
                    <input
                      type="text"
                      placeholder="Notes..."
                      value={logNotes}
                      onChange={(e) => setLogNotes(e.target.value)}
                      style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px' }}
                    />
                  </div>
                </div>
              )}

              <button type="submit" className="submit" style={{ marginTop: '12px' }} disabled={isPending}>
                Log Handover (Enter)
              </button>
            </form>
          </div>

          {/* Right: Recent Dispatches (Fast Swap & Refund Search) */}
          <div className="card">
            <div className="card-head">
              <span>Recent Dispatches</span>
              <span className="mono" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {recentDispatches.length} items
              </span>
            </div>

            <div style={{ padding: '16px' }}>
              <div className="search-box-wrap">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search Order ID (e.g. 04CA7) to Swap or Refund..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="sales-list">
                {recentDispatches.map(ord => {
                  const skuParts = ord.original_sku.split('|');
                  const itemLabel = `${skuParts[0]} ${skuParts[1] !== 'Standard' ? skuParts[1] : ''} (${skuParts[2] || 'One Size'})`;

                  return (
                    <div key={ord.id} className="sale-card">
                      <div className="sale-card-header">
                        <span className="sale-ref">{ord.source_prefix}-{ord.order_ref}</span>
                        <span className={`badge ${ord.status}`}>
                          {ord.status}
                        </span>
                      </div>
                      <div className="sale-card-body">
                        <span className="sale-sku">{itemLabel}</span>
                        <span className="sale-price">{ord.amount_paid.toLocaleString()} KES</span>
                      </div>
                      <div className="sale-card-footer">
                        <span className="sale-time">{ord.customer_name || 'Counter'}</span>
                        <div className="sale-actions">
                          {ord.status !== 'refunded' && (
                            <>
                              <button
                                type="button"
                                className="btn-action-small"
                                onClick={() => {
                                  setSwapOrder(ord);
                                  setSelectedSwapSku(ord.original_sku);
                                  setSwapNotes('');
                                  setSwapModalOpen(true);
                                }}
                              >
                                Swap Size
                              </button>
                              <button
                                type="button"
                                className="btn-action-small refund"
                                onClick={() => {
                                  setRefundOrder(ord);
                                  setRefundAmount((ord.amount_paid || 2500).toString());
                                  setRefundModalOpen(true);
                                }}
                              >
                                Refund
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {recentDispatches.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: '13px' }}>
                    No dispatches logged yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: STOCK (CLEAN HIERARCHICAL DROPDOWNS: MERCH -> COLOURS -> SIZES) */}
      {/* ========================================================================= */}
      {activeTab === 'stock' && (
        <div className="stock-view-container">
          {/* Header Bar */}
          <div className="stock-top-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 className="stock-title display" style={{ margin: 0 }}>Current Stock</h2>
                <span className="badge" style={{ fontSize: '11px', background: 'var(--border)', color: 'var(--ink)' }}>
                  {stockLocationFilter === 'all' ? '🌐 Company-Wide (All Locations)' : locations.find(l => l.id === stockLocationFilter)?.name || 'Filtered Location'}
                </span>
              </div>
              <p className="stock-subtitle" style={{ marginTop: '4px' }}>
                {stockLocationFilter === 'all'
                  ? 'Total company-wide inventory across central warehouse and all event stations.'
                  : `Showing physical stock on hand at ${locations.find(l => l.id === stockLocationFilter)?.name || 'this location'}.`}
              </p>
            </div>

            <div className="stock-top-actions">
              {/* Location Scope Filter Dropdown */}
              <div className="stock-loc-picker-wrap">
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Location:</span>
                <select
                  value={stockLocationFilter}
                  onChange={(e) => setStockLocationFilter(e.target.value)}
                  className="stock-loc-select-input"
                >
                  <option value="all">🌐 All Locations (Global Total)</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.type === 'warehouse' ? '🏢' : '🎪'} {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="stock-search-wrap">
                <input
                  type="text"
                  placeholder="Filter merchandise, colour, size..."
                  value={stockSearchQuery}
                  onChange={(e) => setStockSearchQuery(e.target.value)}
                  className="stock-search-input"
                />
                {stockSearchQuery && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setStockSearchQuery('')}
                    title="Clear filter"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}
              </div>

              <div className="stock-btn-group">
                <button
                  type="button"
                  onClick={handleExpandAllStock}
                  className="stock-tool-btn"
                  title="Expand all categories and colourways"
                >
                  Expand All
                </button>
                <button
                  type="button"
                  onClick={handleCollapseAllStock}
                  className="stock-tool-btn"
                  title="Collapse all"
                >
                  Collapse All
                </button>
              </div>
            </div>
          </div>

          {/* Quick Category Filter Bar */}
          <div className="stock-category-filter-bar">
            <button
              type="button"
              className={`cat-pill ${stockCategoryFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStockCategoryFilter('all')}
            >
              All Merch ({availableCategories.length})
            </button>
            {availableCategories.map(cat => {
              const catGroup = stockHierarchy.find(c => c.category === cat);
              const count = catGroup ? catGroup.totalRemaining : 0;
              return (
                <button
                  key={cat}
                  type="button"
                  className={`cat-pill ${stockCategoryFilter === cat ? 'active' : ''}`}
                  onClick={() => setStockCategoryFilter(cat)}
                >
                  <span>{cat}</span>
                  <span className="cat-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Hierarchical Accordion List */}
          <div className="stock-hierarchy-list">
            {filteredStockHierarchy.map(cat => {
              const isCatExpanded = stockSearchQuery.trim() ? true : (expandedCats[cat.category] ?? true);
              const isZero = cat.totalRemaining <= 0;
              const isLow = cat.totalRemaining > 0 && cat.totalRemaining <= 20;

              return (
                <div key={cat.category} className={`stock-category-card ${isCatExpanded ? 'is-expanded' : ''}`}>
                  {/* Category Header (Dropdown Trigger 1) */}
                  <div
                    className="stock-category-header"
                    onClick={() => toggleCategoryExpand(cat.category)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="stock-cat-left">
                      <div className={`stock-chevron ${isCatExpanded ? 'open' : ''}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </div>
                      <div>
                        <div className="stock-cat-title-row">
                          <span className="stock-cat-title display">{cat.category}</span>
                          <span className="stock-cat-price mono">{cat.unitPrice.toLocaleString()} KES</span>
                        </div>
                        <div className="stock-cat-meta">
                          <span>{cat.colorways.length} {cat.colorways.length === 1 ? 'colourway' : 'colourways'}</span>
                          <span>&bull;</span>
                          <span>{cat.colorways.reduce((sum, cw) => sum + cw.sizes.length, 0)} sizes</span>
                        </div>
                      </div>
                    </div>

                    <div className="stock-cat-right">
                      <div className="stock-stat-badge">
                        <span className="stock-stat-label">INITIAL</span>
                        <span className="stock-stat-val mono">{cat.totalInitial}</span>
                      </div>
                      <div className="stock-stat-badge">
                        <span className="stock-stat-label">SOLD</span>
                        <span className="stock-stat-val mono tag-green">{cat.totalSold}</span>
                      </div>
                      <div className={`stock-stat-badge on-hand ${isZero ? 'zero' : isLow ? 'low' : ''}`}>
                        <span className="stock-stat-label">ON HAND</span>
                        <span className="stock-stat-val mono">{cat.totalRemaining} pcs</span>
                      </div>
                    </div>
                  </div>

                  {/* Level 2: Colourways Accordion */}
                  {isCatExpanded && (
                    <div className="stock-colorways-container">
                      {cat.colorways.map(cw => {
                        const colKey = `${cat.category}|${cw.color}`;
                        const isColExpanded = stockSearchQuery.trim() ? true : (expandedCols[colKey] ?? true);
                        const isCwZero = cw.totalRemaining <= 0;
                        const isCwLow = cw.totalRemaining > 0 && cw.totalRemaining <= 10;

                        return (
                          <div key={cw.color} className={`stock-colorway-card ${isColExpanded ? 'is-expanded' : ''}`}>
                            {/* Colourway Header (Dropdown Trigger 2) */}
                            <div
                              className="stock-colorway-header"
                              onClick={() => toggleColorwayExpand(cat.category, cw.color)}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="stock-col-left">
                                <div className={`stock-sub-chevron ${isColExpanded ? 'open' : ''}`}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                  </svg>
                                </div>
                                <div className="stock-col-info">
                                  <span className="stock-color-name">{cw.color}</span>
                                  <span className="stock-color-variants-badge">
                                    {cw.sizes.length} sizes ({cw.sizes.map(s => s.size).join(', ')})
                                  </span>
                                </div>
                              </div>

                              <div className="stock-col-right">
                                <span className="stock-pill-sub">
                                  Initial: <b>{cw.totalInitial}</b>
                                </span>
                                <span className="stock-pill-sub green">
                                  Sold: <b>{cw.totalSold}</b>
                                </span>
                                <span className={`stock-pill-main ${isCwZero ? 'zero' : isCwLow ? 'low' : ''}`}>
                                  <b>{cw.totalRemaining}</b> pcs on hand
                                </span>
                              </div>
                            </div>

                            {/* Level 3: Sizes Breakdown (Clean Compact Table) */}
                            {isColExpanded && (
                              <div className="stock-sizes-body">
                                <table className="stock-sizes-compact-table">
                                  <thead>
                                    <tr>
                                      <th>Size</th>
                                      <th>Status</th>
                                      <th style={{ textAlign: 'right' }}>Initial</th>
                                      <th style={{ textAlign: 'right' }}>Sold</th>
                                      <th style={{ textAlign: 'right' }}>On Hand</th>
                                      <th style={{ textAlign: 'right' }}>Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cw.sizes.map(sz => {
                                      const isSzZero = sz.remaining <= 0;
                                      const isSzLow = sz.remaining > 0 && sz.remaining <= sz.lowStockThreshold;

                                      return (
                                        <tr key={sz.sku}>
                                          <td className="mono" style={{ fontWeight: 700, fontSize: '13px' }}>
                                            {sz.size}
                                          </td>
                                          <td>
                                            {isSzZero ? (
                                              <span className="badge refunded" style={{ fontSize: '10px' }}>OUT OF STOCK</span>
                                            ) : isSzLow ? (
                                              <span className="badge swapped" style={{ fontSize: '10px' }}>LOW ({sz.remaining})</span>
                                            ) : (
                                              <span className="badge dispatched" style={{ fontSize: '10px' }}>IN STOCK</span>
                                            )}
                                          </td>
                                          <td style={{ textAlign: 'right' }} className="mono">
                                            {sz.initial}
                                          </td>
                                          <td style={{ textAlign: 'right' }} className="mono tag-green">
                                            {sz.sold}
                                          </td>
                                          <td style={{ textAlign: 'right' }} className="mono">
                                            <strong style={{ color: isSzZero ? 'var(--danger)' : isSzLow ? 'var(--amber)' : 'var(--ink)' }}>
                                              {sz.remaining} pcs
                                            </strong>
                                          </td>
                                          <td style={{ textAlign: 'right' }}>
                                            <button
                                              type="button"
                                              className="size-dispatch-btn"
                                              onClick={() => handleQuickSelectStockSize(cat.category, cw.color, sz.size)}
                                              disabled={isSzZero}
                                            >
                                              Dispatch
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredStockHierarchy.length === 0 && (
              <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--ink)' }}>
                  No matching merchandise found
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
                  Try clearing your search query or filter to view all stock.
                </div>
                <button
                  type="button"
                  className="submit"
                  style={{ width: 'auto', margin: '16px auto 0', padding: '8px 20px' }}
                  onClick={() => {
                    setStockSearchQuery('');
                    setStockCategoryFilter('all');
                  }}
                >
                  Reset Stock Filters
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: EVENTS & TRANSFERS */}
      {/* ========================================================================= */}
      {activeTab === 'events' && (
        <div className="events-view-wrap">
          {/* Top 2-Column Split: Create Event + Send Stock with Live Math */}
          <div className="events-split-grid">
            {/* Create Event Card */}
            <div className="card">
              <div className="card-head">
                <span>Create Event Station</span>
                <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>STEP 1</span>
              </div>
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newEventName.trim()) return;
                  startTransition(async () => {
                    try {
                      const l = await createEventLocationAction(newEventName.trim());
                      alert(`Created event station: ${l.name}`);
                      setNewEventName('');
                      setEventDispatchEventId(l.id);
                      await loadAllData();
                    } catch (err) {
                      alert('Error creating event station');
                    }
                  });
                }}
              >
                <div className="field">
                  <span className="field-label">Event Name</span>
                  <input
                    type="text"
                    placeholder="e.g. Driftwood 7s"
                    value={newEventName}
                    onChange={(e) => setNewEventName(e.target.value)}
                    style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontWeight: 600 }}
                    required
                  />
                </div>
                <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px', lineHeight: 1.4 }}>
                  Creates a dedicated event tent station where staff/merchants will log live sales.
                </p>
                <button type="submit" className="submit" style={{ marginTop: '14px' }} disabled={isPending}>
                  + Create Event Station
                </button>
              </form>
            </div>

            {/* Outbound Dispatch: Pick from stock with dropdowns & accurate math */}
            <div className="card">
              <div className="card-head">
                <span>Send Stock to Event</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className={`btn-action-small ${eventDispatchMode === 'single' ? 'active' : ''}`}
                    onClick={() => setEventDispatchMode('single')}
                  >
                    Single Size
                  </button>
                  <button
                    type="button"
                    className={`btn-action-small ${eventDispatchMode === 'batch' ? 'active' : ''}`}
                    onClick={() => setEventDispatchMode('batch')}
                  >
                    Multi-Size Grid
                  </button>
                </div>
              </div>

              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!eventDispatchEventId) {
                    alert("Please select or create an event station first.");
                    return;
                  }

                  const itemsToDispatch: { sku: string; quantity: number }[] = [];

                  if (eventDispatchMode === 'single') {
                    const qty = parseInt(eventDispatchQty, 10) || 0;
                    if (qty <= 0) {
                      alert("Please enter a valid quantity greater than 0");
                      return;
                    }
                    const sku = `${eventDispatchCategory}|${eventDispatchColor}|${eventDispatchSize}`;
                    const avail = getAvailableWarehouseStock(eventDispatchCategory, eventDispatchColor, eventDispatchSize);
                    if (qty > avail && avail > 0) {
                      if (!confirm(`Warning: Requested quantity (${qty}) exceeds available stock (${avail}). Proceed with dispatch anyway?`)) {
                        return;
                      }
                    }
                    itemsToDispatch.push({ sku, quantity: qty });
                  } else {
                    for (const row of eventDispatchMultiSizes) {
                      const q = parseInt(row.quantity, 10) || 0;
                      if (q > 0) {
                        const sku = `${eventDispatchCategory}|${eventDispatchColor}|${row.size}`;
                        itemsToDispatch.push({ sku, quantity: q });
                      }
                    }
                  }

                  if (itemsToDispatch.length === 0) {
                    alert("Please enter at least 1 unit to dispatch.");
                    return;
                  }

                  const totalQty = itemsToDispatch.reduce((sum, i) => sum + i.quantity, 0);
                  const targetLoc = locations.find(l => l.id === eventDispatchEventId);
                  const targetName = targetLoc ? targetLoc.name : 'Event Station';

                  startTransition(async () => {
                    try {
                      await dispatchBatchToEventAction(eventDispatchEventId, itemsToDispatch, currentStaff.name);
                      alert(`Successfully dispatched ${totalQty} pcs to ${targetName}! (Logged by ${currentStaff.name})`);
                      setEventDispatchQty('');
                      setEventDispatchMultiSizes(prev => prev.map(p => ({ ...p, quantity: '' })));
                      await loadAllData();
                    } catch (err) {
                      alert(`Dispatch failed: ${(err as Error).message}`);
                    }
                  });
                }}
              >
                {/* 1. Target Event */}
                <div className="field">
                  <span className="field-label">Target Event</span>
                  <select
                    className="plain"
                    value={eventDispatchEventId}
                    onChange={(e) => setEventDispatchEventId(e.target.value)}
                  >
                    {locations.filter(l => l.type === 'event').map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Merchandise Item & Colourway Dropdowns */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '12px 0' }}>
                  <div>
                    <span className="field-label" style={{ display: 'block', marginBottom: '4px' }}>Merchandise Item</span>
                    <select
                      className="plain"
                      style={{ width: '100%' }}
                      value={eventDispatchCategory}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setEventDispatchCategory(cat);
                        const cols = [...new Set(catalog.filter(c => c.category === cat).map(c => c.color || 'Standard'))];
                        if (cols.length > 0) setEventDispatchColor(cols[0]);
                      }}
                    >
                      {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className="field-label" style={{ display: 'block', marginBottom: '4px' }}>Colourway</span>
                    <select
                      className="plain"
                      style={{ width: '100%' }}
                      value={eventDispatchColor}
                      onChange={(e) => setEventDispatchColor(e.target.value)}
                    >
                      {eventDispatchAvailableColors.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* Single Size Mode */}
                {eventDispatchMode === 'single' && (
                  <>
                    <div className="field">
                      <span className="field-label">Size</span>
                      <select
                        className="plain"
                        value={eventDispatchSize}
                        onChange={(e) => setEventDispatchSize(e.target.value)}
                      >
                        {eventDispatchAvailableSizes.map(sz => (
                          <option key={sz} value={sz}>{sz}</option>
                        ))}
                      </select>
                    </div>

                    {/* Live Available Stock Math */}
                    <div className="field">
                      <span className="field-label">Available in Stock</span>
                      {(() => {
                        const avail = getAvailableWarehouseStock(eventDispatchCategory, eventDispatchColor, eventDispatchSize);
                        const isLow = avail > 0 && avail <= 10;
                        const isZero = avail <= 0;
                        return (
                          <div className={`stock-avail-badge ${isZero ? 'zero' : isLow ? 'low' : ''}`}>
                            <span className="live-dot" style={{ background: isZero ? 'var(--danger)' : isLow ? 'var(--amber)' : 'var(--success)' }} />
                            <span>{avail} pcs available in shop</span>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="field">
                      <div>
                        <span className="field-label">Quantity to Dispatch</span>
                        <div className="quick-alloc-chips" style={{ marginTop: '4px' }}>
                          <button type="button" className="quick-chip-btn" onClick={() => setEventDispatchQty('10')}>+10</button>
                          <button type="button" className="quick-chip-btn" onClick={() => setEventDispatchQty('25')}>+25</button>
                          <button type="button" className="quick-chip-btn" onClick={() => setEventDispatchQty('50')}>+50</button>
                          <button
                            type="button"
                            className="quick-chip-btn"
                            onClick={() => {
                              const avail = getAvailableWarehouseStock(eventDispatchCategory, eventDispatchColor, eventDispatchSize);
                              setEventDispatchQty(avail.toString());
                            }}
                          >
                            Max All
                          </button>
                        </div>
                      </div>
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 25"
                        value={eventDispatchQty}
                        onChange={(e) => setEventDispatchQty(e.target.value)}
                        style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontFamily: 'IBM Plex Mono', fontSize: '16px', fontWeight: 700, width: '100px' }}
                        required
                      />
                    </div>
                  </>
                )}

                {/* Multi-Size Batch Mode */}
                {eventDispatchMode === 'batch' && (
                  <div>
                    <span className="field-label" style={{ display: 'block', margin: '8px 0 4px 0' }}>
                      Allocate Quantities by Size:
                    </span>
                    <div className="multi-alloc-grid">
                      {eventDispatchAvailableSizes.map(sz => {
                        const avail = getAvailableWarehouseStock(eventDispatchCategory, eventDispatchColor, sz);
                        const currentVal = eventDispatchMultiSizes.find(s => s.size === sz)?.quantity || '';

                        return (
                          <div key={sz} className="multi-alloc-box">
                            <span className="multi-alloc-size">{sz}</span>
                            <span className="multi-alloc-avail">{avail} avail</span>
                            <input
                              type="number"
                              min="0"
                              max={avail}
                              placeholder="0"
                              className="multi-alloc-input"
                              value={currentVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEventDispatchMultiSizes(prev => {
                                  const exists = prev.some(p => p.size === sz);
                                  if (exists) {
                                    return prev.map(p => p.size === sz ? { ...p, quantity: val } : p);
                                  }
                                  return [...prev, { size: sz, quantity: val }];
                                });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button type="submit" className="submit" style={{ marginTop: '14px' }} disabled={isPending}>
                  Dispatch Stock to Event Tent
                </button>
              </form>
            </div>
          </div>

          {/* Bottom Section: Created Event Stations & Live Merchant Logs */}
          <div className="card">
            <div className="card-head">
              <div>
                <span style={{ fontSize: '16px', fontWeight: 800 }}>Event Stations & Live Selling Status</span>
                <p style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500, marginTop: '2px' }}>
                  Active tents where staff & merchants log customer handovers and sales
                </p>
              </div>
              <span className="mono" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {eventStationSummaries.length} Stations
              </span>
            </div>

            <div style={{ padding: '20px' }} className="event-stations-list">
              {eventStationSummaries.map(st => {
                const isExpanded = expandedEventCards[st.event.id] ?? false;

                return (
                  <div key={st.event.id} className={`event-station-card ${st.isCurrent ? 'is-active-station' : ''}`}>
                    {/* Station Header */}
                    <div className="event-station-header">
                      <div className="event-station-name-row">
                        <span className="live-dot" style={{ background: st.isCurrent ? 'var(--success)' : 'var(--muted)' }} />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="event-station-title display">{st.event.name}</span>
                            <span className="brand-badge">
                              {st.isCurrent ? 'LIVE ACTIVE STATION' : 'EVENT TENT'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Assigned Merchants:</span>
                            {st.assignedStaff.map(s => (
                              <span key={s.id} className="merchant-lead-pill">
                                {s.name} ({s.role === 'event_staff' ? 'Merchant' : s.role})
                              </span>
                            ))}
                            {st.assignedStaff.length === 0 && (
                              <span style={{ fontSize: '11px', color: 'var(--faint)', fontStyle: 'italic' }}>Open Station</span>
                            )}
                            <button
                              type="button"
                              className="btn-action-small"
                              style={{ fontSize: '11px', padding: '2px 8px' }}
                              onClick={async () => {
                                const staffToAssign = prompt(`Assign staff to ${st.event.name}:\nAvailable: ${staffProfiles.map(p => p.name).join(', ')}\nEnter Staff Name:`, currentStaff.name);
                                if (staffToAssign) {
                                  const target = staffProfiles.find(p => p.name.toLowerCase() === staffToAssign.toLowerCase().trim());
                                  if (target) {
                                    await assignStaffToLocationAction(target.id, st.event.id);
                                    alert(`Assigned ${target.name} to ${st.event.name}!`);
                                    await loadAllData();
                                  } else {
                                    alert("Staff member not found.");
                                  }
                                }
                              }}
                            >
                              + Assign Merchant
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="event-station-actions">
                        {st.isCurrent ? (
                          <div className="btn-switch-station current">
                            <span>Currently Selling Here</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-switch-station"
                            onClick={() => {
                              setSelectedLocationId(st.event.id);
                              setActiveTab('dispatch');
                            }}
                          >
                            <span>Switch & Log Sales Here</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-action-small"
                          onClick={() => setExpandedEventCards(prev => ({ ...prev, [st.event.id]: !prev[st.event.id] }))}
                        >
                          {isExpanded ? 'Hide Tent Stock' : 'View Tent Stock'}
                        </button>
                        <button
                          type="button"
                          className="btn-action-small"
                          onClick={() => {
                            setTentModalEventId(st.event.id);
                            const rows = st.inventoryBreakdown.map(i => ({
                              sku: i.sku,
                              staffCount: i.remaining.toString(),
                              expectedQty: i.remaining
                            }));
                            setTentCountRows(rows);
                            setTentModalOpen(true);
                          }}
                        >
                          Closeout & Reconcile
                        </button>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="event-metrics-grid">
                      <div className="event-metric-box">
                        <span className="event-metric-label">STOCK DISPATCHED</span>
                        <span className="event-metric-value mono">{st.totalDispatched} <small style={{ fontSize: '11px', color: 'var(--muted)' }}>pcs</small></span>
                      </div>
                      <div className="event-metric-box">
                        <span className="event-metric-label">SALES (DISPATCHED)</span>
                        <span className="event-metric-value mono success">{st.totalSold} <small style={{ fontSize: '11px', color: 'var(--muted)' }}>pcs</small></span>
                      </div>
                      <div className="event-metric-box">
                        <span className="event-metric-label">TENT STOCK ON HAND</span>
                        <span className="event-metric-value mono accent">{st.totalRemaining} <small style={{ fontSize: '11px', color: 'var(--muted)' }}>pcs</small></span>
                      </div>
                      <div className="event-metric-box">
                        <span className="event-metric-label">TENT REVENUE</span>
                        <span className="event-metric-value mono">{st.totalRevenue.toLocaleString()} <small style={{ fontSize: '11px', color: 'var(--muted)' }}>KES</small></span>
                      </div>
                    </div>

                    {/* Merchant Attribution Audit Breakdown */}
                    {st.staffAudits.length > 0 && (
                      <div className="merchant-audit-card">
                        <div className="merchant-audit-head">
                          <span>Live Merchant Attribution & Reconciliation Audit</span>
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>AUDITED BY PERSON</span>
                        </div>
                        <div className="merchant-staff-list">
                          {st.staffAudits.map(sa => (
                            <div key={sa.name} className="merchant-staff-item">
                              <span className="merchant-staff-name">{sa.name}</span>
                              <span className="merchant-staff-stat">
                                <b>{sa.sold}</b> orders sold • <b style={{ color: 'var(--success)' }}>{sa.revenue.toLocaleString()} KES</b>
                                {sa.swaps > 0 ? ` • ${sa.swaps} swaps` : ''}
                                {sa.refunds > 0 ? ` • ${sa.refunds} refunds` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Expanded Tent Inventory Breakdown */}
                    {isExpanded && (
                      <div className="event-inventory-breakdown-wrap">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>
                            Live Tent Inventory Breakdown — {st.event.name}
                          </span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table className="event-breakdown-table">
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th>Colour</th>
                                <th>Size</th>
                                <th style={{ textAlign: 'right' }}>Dispatched</th>
                                <th style={{ textAlign: 'right' }}>Sold by Staff</th>
                                <th style={{ textAlign: 'right' }}>Remaining in Tent</th>
                              </tr>
                            </thead>
                            <tbody>
                              {st.inventoryBreakdown.map(row => (
                                <tr key={row.sku}>
                                  <td style={{ fontWeight: 600 }}>{row.category}</td>
                                  <td>{row.color}</td>
                                  <td className="mono" style={{ fontWeight: 700 }}>{row.size}</td>
                                  <td style={{ textAlign: 'right' }} className="mono">{row.dispatched}</td>
                                  <td style={{ textAlign: 'right' }} className="mono tag-green">{row.sold}</td>
                                  <td style={{ textAlign: 'right' }} className="mono">
                                    <strong>{row.remaining} pcs</strong>
                                  </td>
                                </tr>
                              ))}
                              {st.inventoryBreakdown.length === 0 && (
                                <tr>
                                  <td colSpan={6} style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)' }}>
                                    No stock has been dispatched to this event tent yet.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: ADD STOCK */}
      {/* ========================================================================= */}
      {activeTab === 'add-stock' && (
        <div className="card" style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="card-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '16px', fontWeight: 700 }}>Add Stock Intake</span>
                <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', fontWeight: 500 }}>
                  Intake physical stock for apparel lines or non-sized accessories
                </p>
              </div>
              <span className="live-dot" />
            </div>

            {/* Mode Switcher */}
            <div className="add-stock-type-nav" style={{ display: 'flex', gap: '6px', width: '100%', paddingTop: '4px' }}>
              <button
                type="button"
                className={`add-stock-type-btn ${addStockType === 'apparel' ? 'active' : ''}`}
                onClick={() => setAddStockType('apparel')}
              >
                <span>👕</span>
                <span>Apparel (Size Matrix)</span>
              </button>
              <button
                type="button"
                className={`add-stock-type-btn ${addStockType === 'accessory' ? 'active' : ''}`}
                onClick={() => {
                  setAddStockType('accessory');
                  setAddSingleSize('One Size');
                }}
              >
                <span>🧢</span>
                <span>Accessory (One Size)</span>
              </button>
              <button
                type="button"
                className={`add-stock-type-btn ${addStockType === 'single' ? 'active' : ''}`}
                onClick={() => setAddStockType('single')}
              >
                <span>⚡</span>
                <span>Single / Custom Size</span>
              </button>
            </div>
          </div>

          <form className="form" onSubmit={handleAddStockSubmit}>
            {/* Destination Selector */}
            <div className="field">
              <span className="field-label">Stock Destination</span>
              <select
                className="plain"
                value={addStockDestination}
                onChange={(e) => setAddStockDestination(e.target.value)}
                style={{ fontWeight: 600, fontSize: '13px' }}
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.type === 'warehouse' ? '🏢' : '🎪'} {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Item Name Input & Quick Category Suggestions */}
            <div className="field">
              <span className="field-label">Item Name</span>
              <input
                type="text"
                placeholder="e.g. Fan Jersey, Crew Neck, Bucket Hat, Gale Industries merch"
                value={addCategory}
                onChange={(e) => {
                  const val = e.target.value;
                  setAddCategory(val);
                  if (isAccessoryCategory(val) && addStockType === 'apparel') {
                    setAddStockType('accessory');
                    setAddSingleSize('One Size');
                  }
                }}
                style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '14px', fontWeight: 600 }}
                required
              />
            </div>

            {/* Quick Suggestions Chips */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px', marginBottom: '8px' }}>
              {availableCategories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  className={`quick-chip-btn ${addCategory === cat ? 'active' : ''}`}
                  style={{ fontSize: '11px', padding: '3px 9px' }}
                  onClick={() => handleSelectAddCategory(cat)}
                >
                  {isAccessoryCategory(cat) ? '🧢' : '👕'} {cat}
                </button>
              ))}
            </div>

            {/* Colour Input */}
            <div className="field">
              <span className="field-label">Colour</span>
              <input
                type="text"
                placeholder="e.g. White, Red, Navy, Black, Beige"
                value={addColor}
                onChange={(e) => setAddColor(e.target.value)}
                style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontSize: '13px', fontWeight: 600 }}
                required
              />
            </div>

            {/* Price Input */}
            <div className="field">
              <span className="field-label">Retail Price (KES)</span>
              <input
                type="number"
                placeholder="2500"
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
                style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontFamily: 'IBM Plex Mono', fontSize: '14px', fontWeight: 700, width: '130px' }}
                required
              />
            </div>

            {/* MODE 1: APPAREL MULTI-SIZE MATRIX (DIRECT QUANTITY TYPING PER SIZE) */}
            {addStockType === 'apparel' && (
              <div className="size-matrix-container">
                <div className="size-matrix-header">
                  <div>
                    <span className="field-label" style={{ fontWeight: 700, color: 'var(--ink)' }}>
                      👕 Sized Inventory Matrix (XS &ndash; 5XL)
                    </span>
                    <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '2px 0 0 0' }}>
                      Type quantities directly into each size box &bull; Tab to jump to next size
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-action-small"
                      style={{ fontSize: '10px', padding: '2px 6px' }}
                      onClick={() => handleSetAllMultiSizes(5)}
                    >
                      +5 All
                    </button>
                    <button
                      type="button"
                      className="btn-action-small"
                      style={{ fontSize: '10px', padding: '2px 6px' }}
                      onClick={() => handleSetAllMultiSizes(10)}
                    >
                      +10 All
                    </button>
                    <button
                      type="button"
                      className="btn-action-small"
                      style={{ fontSize: '10px', padding: '2px 6px' }}
                      onClick={() => handleSetAllMultiSizes(25)}
                    >
                      +25 All
                    </button>
                    <button
                      type="button"
                      className="btn-action-small refund"
                      style={{ fontSize: '10px', padding: '2px 6px' }}
                      onClick={() => handleSetAllMultiSizes(0)}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="size-matrix-grid">
                  {addMultiSizes.map(szRow => {
                    const hasVal = (parseInt(szRow.quantity, 10) || 0) > 0;
                    return (
                      <div key={szRow.size} className={`size-input-card ${hasVal ? 'has-value' : ''}`}>
                        <span className="size-input-badge">{szRow.size}</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          className="size-input-field"
                          value={szRow.quantity}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAddMultiSizes(prev => prev.map(p => p.size === szRow.size ? { ...p, quantity: val } : p));
                          }}
                        />
                        <span className="size-input-unit">pcs</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* MODE 2: ACCESSORY (NON-SIZED / ONE SIZE) */}
            {addStockType === 'accessory' && (
              <div className="size-matrix-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '20px' }}>🧢</span>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>Non-Sized Accessory / Merchandise</span>
                    <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '1px 0 0 0' }}>
                      Caps, bucket hats, bottles, and bags are recorded as a single <b>One Size</b> unit pool.
                    </p>
                  </div>
                </div>

                <div className="field" style={{ margin: 0, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                  <span className="field-label" style={{ fontWeight: 600 }}>Quantity to Add</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[5, 10, 25, 50, 100].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          className="btn-action-small"
                          style={{ fontSize: '10px', padding: '2px 6px' }}
                          onClick={() => setAddSingleQty(amt.toString())}
                        >
                          +{amt}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 50"
                      value={addSingleQty}
                      onChange={(e) => setAddSingleQty(e.target.value)}
                      style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontFamily: 'IBM Plex Mono', fontSize: '16px', fontWeight: 700, width: '100px' }}
                      required
                    />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>pcs</span>
                  </div>
                </div>
              </div>
            )}

            {/* MODE 3: SINGLE / CUSTOM SIZE QUICK ENTRY */}
            {addStockType === 'single' && (
              <div className="size-matrix-container">
                <span className="field-label" style={{ display: 'block', marginBottom: '8px', fontWeight: 700 }}>
                  ⚡ Custom / Individual Size Entry
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Size Name / Code</span>
                    <input
                      type="text"
                      placeholder="e.g. M, XL, 6XL, Kids 10, One Size"
                      value={addSingleSize}
                      onChange={(e) => setAddSingleSize(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--panel)', fontSize: '13px', fontWeight: 600, outline: 'none' }}
                      required
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Quantity</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 20"
                      value={addSingleQty}
                      onChange={(e) => setAddSingleQty(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--panel)', fontFamily: 'IBM Plex Mono', fontSize: '14px', fontWeight: 700, outline: 'none' }}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Live Inventory Value Summary Banner */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              margin: '12px 0 16px 0',
              fontSize: '12px'
            }}>
              <div>
                <span style={{ color: 'var(--muted)' }}>Total Units: </span>
                <strong className="mono" style={{ fontSize: '14px', color: totalAddUnits > 0 ? 'var(--ink)' : 'var(--muted)' }}>
                  {totalAddUnits.toLocaleString()} pcs
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Estimated Value: </span>
                <strong className="mono" style={{ fontSize: '14px', color: totalAddValue > 0 ? 'var(--success)' : 'var(--muted)' }}>
                  {totalAddValue.toLocaleString()} KES
                </strong>
              </div>
            </div>

            <button
              type="submit"
              className="submit"
              style={{ padding: '12px', fontSize: '14px' }}
              disabled={isPending || totalAddUnits <= 0}
            >
              {addStockType === 'apparel'
                ? `Add ${totalAddUnits > 0 ? totalAddUnits : ''} Sized Units to ${locations.find(l => l.id === addStockDestination)?.name || 'Warehouse'}`
                : `Add ${totalAddUnits > 0 ? totalAddUnits : ''} Units to ${locations.find(l => l.id === addStockDestination)?.name || 'Warehouse'}`}
            </button>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SETTINGS & TOOLS */}
      {/* ========================================================================= */}
      {activeTab === 'settings' && (
        <div className="card">
          <div className="card-head">Settings & Data Management</div>
          <div className="form">
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
              Reset sample scenarios or clear data.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={async () => {
                  if (confirm("Reset database with standard sample data?")) {
                    await resetDatabaseAction();
                    await loadAllData();
                  }
                }}
                className="btn-action-small"
                style={{ padding: '8px 14px' }}
              >
                Restore Sample Data
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirm("Clear all data for a clean run?")) {
                    await clearAllDataAction();
                    await loadAllData();
                  }
                }}
                className="btn-action-small refund"
                style={{ padding: '8px 14px' }}
              >
                Clear All Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SWAP MODAL */}
      {/* ========================================================================= */}
      {swapModalOpen && swapOrder && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="card-head" style={{ padding: 0, marginBottom: '16px' }}>
              <span>Swap Item</span>
              <button
                onClick={() => setSwapModalOpen(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSwapConfirm}>
              <div className="field">
                <span className="field-label">Order</span>
                <span className="mono" style={{ fontWeight: 700 }}>{swapOrder.source_prefix}-{swapOrder.order_ref}</span>
              </div>
              <div className="field">
                <span className="field-label">Current</span>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{swapOrder.original_sku}</span>
              </div>
              <div className="field">
                <span className="field-label">New Item</span>
                <select
                  className="plain"
                  value={selectedSwapSku}
                  onChange={(e) => setSelectedSwapSku(e.target.value)}
                  required
                >
                  {catalog.map(c => (
                    <option key={c.sku} value={c.sku}>{c.sku}</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="submit" style={{ marginTop: '16px' }} disabled={isPending}>
                Confirm Swap
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REFUND MODAL */}
      {/* ========================================================================= */}
      {refundModalOpen && refundOrder && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="card-head" style={{ padding: 0, marginBottom: '16px' }}>
              <span>Process Refund</span>
              <button
                onClick={() => setRefundModalOpen(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}
              >
                Close
              </button>
            </div>

            <form onSubmit={handleRefundConfirm}>
              <div className="field">
                <span className="field-label">Order</span>
                <span className="mono" style={{ fontWeight: 700 }}>{refundOrder.source_prefix}-{refundOrder.order_ref}</span>
              </div>
              <div className="field">
                <span className="field-label">Item</span>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{refundOrder.original_sku}</span>
              </div>
              <div className="field">
                <span className="field-label">Refund (KES)</span>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontFamily: 'IBM Plex Mono', fontSize: '14px' }}
                  required
                />
              </div>

              <button
                type="submit"
                className="submit"
                style={{ marginTop: '16px', background: 'var(--danger)' }}
                disabled={isPending}
              >
                Confirm Refund (+1 to stock)
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="footer-credit">
        Fulfilled by Griphine &middot; Tent Fulfillment System
      </div>
    </div>
  );
}
