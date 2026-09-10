import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface ContainerMasterItem {
  container: string;
  containerNumber?: string;
  shippingLine?: string;
  shippedFrom?: string;
  shippedTo?: string;
  currentLocation?: string;
  startDate?: string;
  destinationDate?: string;
  eta?: string;
  status?: string;
  deliveryDate?: string;
  daysToDeliver?: number | null;
  isDelivered?: boolean;
  daysRemaining?: number | null;
  vesselName?: string;
  voyageNumber?: string;
  shipmentCount?: number;
  warehouse?: string;
  isMappedWithActual?: boolean;
  apiCalled?: boolean;
  apiCallCount?: number;
  rawEta?: string;
  lastApiSync?: string | null;
}

export interface CargoMasterState {
  items: ContainerMasterItem[];
  loading: boolean;
  error: string | null;
  searchTerm: string;
  statusFilter: 'all' | 'in-transit' | 'delivered' | 'late';
  carrierFilter: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  // Delivery Modal State
  isDeliveryModalOpen: boolean;
  activeContainerForDelivery: ContainerMasterItem | null;
  actionLoading: boolean;
  actionMessage: { type: 'success' | 'error'; text: string } | null;
}

const initialState: CargoMasterState = {
  items: [],
  loading: false,
  error: null,
  searchTerm: '',
  statusFilter: 'all',
  carrierFilter: 'ALL',
  sortField: 'container',
  sortDirection: 'asc',
  isDeliveryModalOpen: false,
  activeContainerForDelivery: null,
  actionLoading: false,
  actionMessage: null,
};

// Async Thunk: Fetch Cargo Fleet
export const fetchCargoFleet = createAsyncThunk(
  'cargoMaster/fetchCargoFleet',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/containers/list');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch container fleet');
      return data.containers as ContainerMasterItem[];
    } catch (err: any) {
      return rejectWithValue(err.message || 'Error fetching fleet');
    }
  }
);

// Async Thunk: Mark Container as Delivered
export const markContainerDelivered = createAsyncThunk(
  'cargoMaster/markContainerDelivered',
  async (
    {
      container,
      deliveryDate,
      isDelivered = true,
      excludedReceipts,
    }: {
      container: string;
      deliveryDate: string;
      isDelivered?: boolean;
      excludedReceipts?: string[];
    },
    { rejectWithValue }
  ) => {
    try {
      const res = await fetch('/api/containers/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container, deliveryDate, isDelivered, excludedReceipts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mark container delivered');
      return { container, deliveryDate, isDelivered, data };
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to update delivery');
    }
  }
);

export const cargoMasterSlice = createSlice({
  name: 'cargoMaster',
  initialState,
  reducers: {
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload;
    },
    setStatusFilter: (state, action: PayloadAction<'all' | 'in-transit' | 'delivered' | 'late'>) => {
      state.statusFilter = action.payload;
    },
    setCarrierFilter: (state, action: PayloadAction<string>) => {
      state.carrierFilter = action.payload;
    },
    setSorting: (state, action: PayloadAction<{ field: string; direction?: 'asc' | 'desc' }>) => {
      if (state.sortField === action.payload.field) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortField = action.payload.field;
        state.sortDirection = action.payload.direction || 'asc';
      }
    },
    openDeliveryModal: (state, action: PayloadAction<ContainerMasterItem>) => {
      state.activeContainerForDelivery = action.payload;
      state.isDeliveryModalOpen = true;
      state.actionMessage = null;
    },
    closeDeliveryModal: (state) => {
      state.isDeliveryModalOpen = false;
      state.activeContainerForDelivery = null;
    },
    clearActionMessage: (state) => {
      state.actionMessage = null;
    },
    setLocalItems: (state, action: PayloadAction<ContainerMasterItem[]>) => {
      state.items = action.payload;
    },
  },
  extraReducers: (builder) => {
    // fetchCargoFleet
    builder.addCase(fetchCargoFleet.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchCargoFleet.fulfilled, (state, action) => {
      state.loading = false;
      state.items = action.payload;
    });
    builder.addCase(fetchCargoFleet.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // markContainerDelivered
    builder.addCase(markContainerDelivered.pending, (state) => {
      state.actionLoading = true;
      state.actionMessage = null;
    });
    builder.addCase(markContainerDelivered.fulfilled, (state, action) => {
      state.actionLoading = false;
      const { container, deliveryDate, isDelivered, data } = action.payload;
      const updatedContainer = data?.container;

      // Update in local array
      const idx = state.items.findIndex(
        (c) => c.container.toUpperCase() === container.toUpperCase()
      );
      if (idx !== -1) {
        if (isDelivered === false) {
          state.items[idx].status = 'In Transit';
          state.items[idx].deliveryDate = '';
          state.items[idx].daysToDeliver = null;
          state.items[idx].isDelivered = false;
        } else {
          state.items[idx].status = 'Delivered';
          state.items[idx].deliveryDate = deliveryDate;
          state.items[idx].daysToDeliver = updatedContainer?.daysToDeliver ?? state.items[idx].daysToDeliver;
          state.items[idx].isDelivered = true;
        }
      }

      state.actionMessage = {
        type: 'success',
        text: data?.message || `Container ${container} delivery status updated successfully`,
      };
      state.isDeliveryModalOpen = false;
    });
    builder.addCase(markContainerDelivered.rejected, (state, action) => {
      state.actionLoading = false;
      state.actionMessage = {
        type: 'error',
        text: (action.payload as string) || 'Failed to update container delivery status',
      };
    });
  },
});

export const {
  setSearchTerm,
  setStatusFilter,
  setCarrierFilter,
  setSorting,
  openDeliveryModal,
  closeDeliveryModal,
  clearActionMessage,
  setLocalItems,
} = cargoMasterSlice.actions;

export default cargoMasterSlice.reducer;
