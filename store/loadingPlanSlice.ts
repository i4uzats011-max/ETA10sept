import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface WarehouseReceiptItem {
  _id: string;
  receipt: string;
  party?: string;
  warehouse: string;
  warehouseEntry?: string;
  date?: string;
  quantity: number;
  loadedQuantity: number;
  remainingQuantity: number;
  weight?: string;
  volume?: string;
  commodity?: string;
  chinese?: string;
  english?: string;
  packaging?: string;
  mainMarka?: string;
  subMarka?: string;
  status: 'Received' | 'Partially Loaded' | 'Fully Loaded' | 'Delivered';
  stockstatus?: string;
  deliveryDate?: string;
  isDelivered?: boolean;
  notes?: string;
  uploadedAt: string;
}

export interface LoadingItemAllocation {
  _id: string;
  receipt: string;
  party?: string;
  container: string;
  containerNumber?: string;
  shippingLine?: string;
  quantity: string | number;
  originalTotalQuantity?: string;
  isSplit?: boolean;
  splitIndex?: number;
  weight?: string;
  volume?: string;
  commodity?: string;
  english?: string;
  chinese?: string;
  packaging?: string;
  mainMarka?: string;
  subMarka?: string;
  warehouse?: string;
  date?: string;
  loadingDate?: string;
  deliveryDate?: string;
  daysToDeliver?: number | null;
  isDelivered?: boolean;
  eta?: string;
  status?: string;
}

export interface LoadingPlanItem {
  _id: string;
  container: string;            // Internal container alias / Plan ID (e.g. 'USI-01', 'LP-01')
  containerNumber: string;      // Actual carrier container number (e.g. 'MSCU1234567')
  shippingLine: string;         // Carrier (e.g. 'MSC', 'MAERSK')
  warehouse?: string;           // China origin loading warehouse
  loadingDate?: string;
  shippedTo?: string;
  deliveryDate?: string;
  daysToDeliver?: number | null;
  isDelivered?: boolean;
  planStatus: 'Draft' | 'Planning' | 'Finalized' | 'In Transit' | 'Delivered';
  isFinalized: boolean;
  finalizedAt?: string | null;
  allottedActualAt?: string | null;
  eta?: string;
  destinationDate?: string;
  status?: string;
  shipmentCount?: number;
  totalQuantity?: number;
  totalWeight?: string;
  totalVolume?: string;
  items?: LoadingItemAllocation[];
}

export interface LoadingPlanState {
  warehouseReceipts: WarehouseReceiptItem[];
  loadingPlans: LoadingPlanItem[];
  loading: boolean;
  error: string | null;
  selectedWarehouse: string;
  statusFilter: 'all' | 'Received' | 'Partially Loaded' | 'Fully Loaded';
  searchTerm: string;
  activePlan: LoadingPlanItem | null;
  // Split & Allocate Modal
  isSplitModalOpen: boolean;
  activeReceiptForSplit: WarehouseReceiptItem | null;
  targetContainerForSplit: string;
  // Allot Actual Container Modal
  isAllotModalOpen: boolean;
  activePlanForAllot: LoadingPlanItem | null;
  // Action Status
  actionLoading: boolean;
  actionMessage: { type: 'success' | 'error'; text: string } | null;
}

const initialState: LoadingPlanState = {
  warehouseReceipts: [],
  loadingPlans: [],
  loading: false,
  error: null,
  selectedWarehouse: 'ALL',
  statusFilter: 'all',
  searchTerm: '',
  activePlan: null,
  isSplitModalOpen: false,
  activeReceiptForSplit: null,
  targetContainerForSplit: '',
  isAllotModalOpen: false,
  activePlanForAllot: null,
  actionLoading: false,
  actionMessage: null,
};

// 1. Fetch Warehouse Receipts
export const fetchWarehouseReceipts = createAsyncThunk(
  'loadingPlan/fetchWarehouseReceipts',
  async (
    params: { warehouse?: string; status?: string; search?: string } | undefined,
    { rejectWithValue }
  ) => {
    try {
      const query = new URLSearchParams();
      if (params?.warehouse && params.warehouse !== 'ALL') query.set('warehouse', params.warehouse);
      if (params?.status && params.status !== 'all') query.set('status', params.status);
      if (params?.search) query.set('search', params.search);

      const res = await fetch(`/api/warehouse/receipts?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch warehouse receipts');
      return data.receipts as WarehouseReceiptItem[];
    } catch (err: any) {
      return rejectWithValue(err.message || 'Error fetching warehouse receipts');
    }
  }
);

// 2. Fetch Loading Plans
export const fetchLoadingPlans = createAsyncThunk(
  'loadingPlan/fetchLoadingPlans',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/loading-plan');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch loading plans');
      return data.plans as LoadingPlanItem[];
    } catch (err: any) {
      return rejectWithValue(err.message || 'Error fetching loading plans');
    }
  }
);

// 3. Create Loading Plan (Internal Container)
export const createLoadingPlan = createAsyncThunk(
  'loadingPlan/createLoadingPlan',
  async (
    payload: { container: string; warehouse?: string; notes?: string },
    { rejectWithValue }
  ) => {
    try {
      const res = await fetch('/api/loading-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-plan',
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create loading plan');
      return data;
    } catch (err: any) {
      return rejectWithValue(err.message || 'Error creating loading plan');
    }
  }
);

// 4. Split and Allocate Cargo into Loading Plan
export const allocateReceiptSplit = createAsyncThunk(
  'loadingPlan/allocateReceiptSplit',
  async (
    payload: {
      receipt: string;
      container: string;
      quantityToLoad: number;
      weightToLoad?: string;
      volumeToLoad?: string;
    },
    { rejectWithValue }
  ) => {
    try {
      const res = await fetch('/api/loading-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'allocate-split',
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to allocate cargo quantity');
      return data;
    } catch (err: any) {
      return rejectWithValue(err.message || 'Error allocating cargo');
    }
  }
);

// 5. Deallocate item from plan (return to warehouse stock)
export const deallocateItem = createAsyncThunk(
  'loadingPlan/deallocateItem',
  async (
    payload: { shipmentId: string },
    { rejectWithValue }
  ) => {
    try {
      const res = await fetch('/api/loading-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deallocate',
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deallocate item');
      return data;
    } catch (err: any) {
      return rejectWithValue(err.message || 'Error deallocating item');
    }
  }
);

// 6. Finalize Plan & Allot Actual Carrier Container
export const finalizeAndAllotContainer = createAsyncThunk(
  'loadingPlan/finalizeAndAllotContainer',
  async (
    payload: {
      container: string;
      containerNumber: string;
      shippingLine: string;
      loadingDate?: string;
      shippedTo?: string;
      autoSync?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      const res = await fetch('/api/loading-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize-and-allot',
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to allot actual container');
      return data;
    } catch (err: any) {
      return rejectWithValue(err.message || 'Error allotting container');
    }
  }
);

// 7. Mark Container as Delivered
export const markContainerDelivered = createAsyncThunk(
  'loadingPlan/markContainerDelivered',
  async (
    payload: {
      container: string;
      deliveryDate: string;
    },
    { rejectWithValue }
  ) => {
    try {
      const res = await fetch('/api/loading-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark-delivered',
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mark container delivered');
      return data;
    } catch (err: any) {
      return rejectWithValue(err.message || 'Error marking container delivered');
    }
  }
);

export const loadingPlanSlice = createSlice({
  name: 'loadingPlan',
  initialState,
  reducers: {
    setSelectedWarehouse: (state, action: PayloadAction<string>) => {
      state.selectedWarehouse = action.payload;
    },
    setStatusFilter: (
      state,
      action: PayloadAction<'all' | 'Received' | 'Partially Loaded' | 'Fully Loaded'>
    ) => {
      state.statusFilter = action.payload;
    },
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload;
    },
    setActivePlan: (state, action: PayloadAction<LoadingPlanItem | null>) => {
      state.activePlan = action.payload;
    },
    openSplitModal: (
      state,
      action: PayloadAction<{ receipt: WarehouseReceiptItem; targetContainer?: string }>
    ) => {
      state.activeReceiptForSplit = action.payload.receipt;
      state.targetContainerForSplit = action.payload.targetContainer || '';
      state.isSplitModalOpen = true;
      state.actionMessage = null;
    },
    closeSplitModal: (state) => {
      state.isSplitModalOpen = false;
      state.activeReceiptForSplit = null;
      state.targetContainerForSplit = '';
    },
    openAllotModal: (state, action: PayloadAction<LoadingPlanItem>) => {
      state.activePlanForAllot = action.payload;
      state.isAllotModalOpen = true;
      state.actionMessage = null;
    },
    closeAllotModal: (state) => {
      state.isAllotModalOpen = false;
      state.activePlanForAllot = null;
    },
    clearActionMessage: (state) => {
      state.actionMessage = null;
    },
  },
  extraReducers: (builder) => {
    // 1. fetchWarehouseReceipts
    builder.addCase(fetchWarehouseReceipts.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchWarehouseReceipts.fulfilled, (state, action) => {
      state.loading = false;
      state.warehouseReceipts = action.payload;
    });
    builder.addCase(fetchWarehouseReceipts.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // 2. fetchLoadingPlans
    builder.addCase(fetchLoadingPlans.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchLoadingPlans.fulfilled, (state, action) => {
      state.loading = false;
      state.loadingPlans = action.payload;
      // Also refresh activePlan if open
      if (state.activePlan) {
        const found = action.payload.find((p) => p.container === state.activePlan?.container);
        if (found) state.activePlan = found;
      }
    });
    builder.addCase(fetchLoadingPlans.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // 3. createLoadingPlan
    builder.addCase(createLoadingPlan.pending, (state) => {
      state.actionLoading = true;
      state.actionMessage = null;
    });
    builder.addCase(createLoadingPlan.fulfilled, (state, action) => {
      state.actionLoading = false;
      state.actionMessage = {
        type: 'success',
        text: action.payload.message || 'Loading plan created successfully',
      };
      if (action.payload.plan) {
        state.loadingPlans.unshift(action.payload.plan);
        state.activePlan = action.payload.plan;
      }
    });
    builder.addCase(createLoadingPlan.rejected, (state, action) => {
      state.actionLoading = false;
      state.actionMessage = {
        type: 'error',
        text: (action.payload as string) || 'Failed to create loading plan',
      };
    });

    // 4. allocateReceiptSplit
    builder.addCase(allocateReceiptSplit.pending, (state) => {
      state.actionLoading = true;
      state.actionMessage = null;
    });
    builder.addCase(allocateReceiptSplit.fulfilled, (state, action) => {
      state.actionLoading = false;
      state.isSplitModalOpen = false;
      state.activeReceiptForSplit = null;
      state.actionMessage = {
        type: 'success',
        text: action.payload.message || 'Cargo quantity allocated successfully',
      };
      // Update receipt in local list
      if (action.payload.receipt) {
        const idx = state.warehouseReceipts.findIndex(
          (r) => r.receipt.toUpperCase() === action.payload.receipt.receipt.toUpperCase()
        );
        if (idx !== -1) {
          state.warehouseReceipts[idx] = action.payload.receipt;
        }
      }
    });
    builder.addCase(allocateReceiptSplit.rejected, (state, action) => {
      state.actionLoading = false;
      state.actionMessage = {
        type: 'error',
        text: (action.payload as string) || 'Failed to allocate cargo',
      };
    });

    // 5. deallocateItem
    builder.addCase(deallocateItem.pending, (state) => {
      state.actionLoading = true;
    });
    builder.addCase(deallocateItem.fulfilled, (state, action) => {
      state.actionLoading = false;
      state.actionMessage = {
        type: 'success',
        text: action.payload.message || 'Item deallocated from loading plan',
      };
    });
    builder.addCase(deallocateItem.rejected, (state, action) => {
      state.actionLoading = false;
      state.actionMessage = {
        type: 'error',
        text: (action.payload as string) || 'Failed to deallocate item',
      };
    });

    // 6. finalizeAndAllotContainer
    builder.addCase(finalizeAndAllotContainer.pending, (state) => {
      state.actionLoading = true;
      state.actionMessage = null;
    });
    builder.addCase(finalizeAndAllotContainer.fulfilled, (state, action) => {
      state.actionLoading = false;
      state.isAllotModalOpen = false;
      state.activePlanForAllot = null;
      state.actionMessage = {
        type: 'success',
        text: action.payload.message || 'Actual container number allotted successfully',
      };
      if (action.payload.plan) {
        const idx = state.loadingPlans.findIndex((p) => p.container === action.payload.plan.container);
        if (idx !== -1) {
          state.loadingPlans[idx] = action.payload.plan;
        }
        if (state.activePlan?.container === action.payload.plan.container) {
          state.activePlan = action.payload.plan;
        }
      }
    });
    builder.addCase(finalizeAndAllotContainer.rejected, (state, action) => {
      state.actionLoading = false;
      state.actionMessage = {
        type: 'error',
        text: (action.payload as string) || 'Failed to allot container number',
      };
    });

    // 7. markContainerDelivered
    builder.addCase(markContainerDelivered.pending, (state) => {
      state.actionLoading = true;
      state.actionMessage = null;
    });
    builder.addCase(markContainerDelivered.fulfilled, (state, action) => {
      state.actionLoading = false;
      state.actionMessage = {
        type: 'success',
        text: action.payload.message || 'Container marked as delivered successfully',
      };
      if (action.payload.plan) {
        const idx = state.loadingPlans.findIndex((p) => p.container === action.payload.plan.container);
        if (idx !== -1) {
          state.loadingPlans[idx] = action.payload.plan;
        }
        if (state.activePlan?.container === action.payload.plan.container) {
          state.activePlan = action.payload.plan;
        }
      }
    });
    builder.addCase(markContainerDelivered.rejected, (state, action) => {
      state.actionLoading = false;
      state.actionMessage = {
        type: 'error',
        text: (action.payload as string) || 'Failed to mark container as delivered',
      };
    });
  },
});

export const {
  setSelectedWarehouse,
  setStatusFilter,
  setSearchTerm,
  setActivePlan,
  openSplitModal,
  closeSplitModal,
  openAllotModal,
  closeAllotModal,
  clearActionMessage,
} = loadingPlanSlice.actions;

export default loadingPlanSlice.reducer;
