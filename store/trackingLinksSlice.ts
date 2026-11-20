import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface IAdminReceipt {
  id: string;
  receiptNo: string;
  marka?: string;
  warehouse?: string;
  itemName?: string;
  cbm?: string;
  ctn?: string;
  weight?: string;
  containerNo?: string;
  actualContainerNo?: string;
  eta?: string | null;
  status?: string;
  adminNotes?: string;
  trackingToken: string;
  trackingName?: string;
  docId?: string;
  remainDays?: number | null;
  createdAt?: string;
  updatedAt?: string;
  isSplit?: boolean;
  splitInfo?: string;
}

export interface ITrackingLinkToken {
  token: string;
  name?: string;
  receipts: string[];
  receiptCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TrackingLinksState {
  tokens: ITrackingLinkToken[];
  loadingTokens: boolean;
  tokensError: string | null;

  // On-demand cached receipts by token (token -> IAdminReceipt[])
  receiptsByToken: Record<string, IAdminReceipt[]>;
  loadingReceiptsForToken: Record<string, boolean>;
  receiptsErrorByToken: Record<string, string | null>;

  // Navigation & View state
  viewMode: 'links' | 'receipts';
  activeToken: string | null;
  selectedNickName: string | null;

  // Filters
  linkStatusFilter: 'all' | 'active' | 'inactive';
  searchQuery: string;
  receiptNoFilter: string;
  selectedMarkaFilter: string | null;
}

const initialState: TrackingLinksState = {
  tokens: [],
  loadingTokens: false,
  tokensError: null,

  receiptsByToken: {},
  loadingReceiptsForToken: {},
  receiptsErrorByToken: {},

  viewMode: 'links',
  activeToken: null,
  selectedNickName: null,

  linkStatusFilter: 'all',
  searchQuery: '',
  receiptNoFilter: '',
  selectedMarkaFilter: null
};

// 1. Fetch lightweight tracking links overview (fast summary without resolving heavy receipts)
export const fetchTrackingLinks = createAsyncThunk(
  'trackingLinks/fetchTrackingLinks',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/admin/tracking-links', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return rejectWithValue(data.message || 'Failed to fetch tracking links');
      }
      return data.tokens as ITrackingLinkToken[];
    } catch (err: any) {
      return rejectWithValue(err.message || 'Network error fetching tracking links');
    }
  }
);

// 2. Fetch live receipts for a single clicked tracking link (on-demand lazy loading)
export const fetchReceiptsForToken = createAsyncThunk(
  'trackingLinks/fetchReceiptsForToken',
  async (token: string, { rejectWithValue }) => {
    try {
      const res = await fetch(`/api/admin/tracking-links?token=${encodeURIComponent(token.trim())}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return rejectWithValue({ token, error: data.message || 'Failed to fetch receipts' });
      }
      return {
        token: data.token || token,
        receipts: (data.receipts || []) as IAdminReceipt[]
      };
    } catch (err: any) {
      return rejectWithValue({ token, error: err.message || 'Network error fetching receipts' });
    }
  }
);

export const trackingLinksSlice = createSlice({
  name: 'trackingLinks',
  initialState,
  reducers: {
    setViewMode(state, action: PayloadAction<'links' | 'receipts'>) {
      state.viewMode = action.payload;
    },
    setActiveToken(state, action: PayloadAction<string | null>) {
      state.activeToken = action.payload;
    },
    setSelectedNickName(state, action: PayloadAction<string | null>) {
      state.selectedNickName = action.payload;
    },
    setLinkStatusFilter(state, action: PayloadAction<'all' | 'active' | 'inactive'>) {
      state.linkStatusFilter = action.payload;
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    setReceiptNoFilter(state, action: PayloadAction<string>) {
      state.receiptNoFilter = action.payload;
    },
    setSelectedMarkaFilter(state, action: PayloadAction<string | null>) {
      state.selectedMarkaFilter = action.payload;
    },
    invalidateTokenCache(state, action: PayloadAction<string | undefined>) {
      if (action.payload) {
        delete state.receiptsByToken[action.payload];
      } else {
        state.receiptsByToken = {};
      }
    },
    removeToken(state, action: PayloadAction<string>) {
      state.tokens = state.tokens.filter(t => t.token !== action.payload);
      delete state.receiptsByToken[action.payload];
    },
    removeReceiptFromToken(state, action: PayloadAction<{ token: string; receiptId: string }>) {
      const { token, receiptId } = action.payload;
      if (state.receiptsByToken[token]) {
        state.receiptsByToken[token] = state.receiptsByToken[token].filter(r => r.id !== receiptId);
      }
      // Also update receiptCount on token if present
      const t = state.tokens.find(tok => tok.token === token);
      if (t) {
        t.receipts = t.receipts.filter(rNo => rNo !== receiptId && !receiptId.startsWith(rNo));
        t.receiptCount = Math.max(0, t.receiptCount - 1);
      }
    }
  },
  extraReducers: (builder) => {
    // fetchTrackingLinks
    builder
      .addCase(fetchTrackingLinks.pending, (state) => {
        state.loadingTokens = true;
        state.tokensError = null;
      })
      .addCase(fetchTrackingLinks.fulfilled, (state, action) => {
        state.loadingTokens = false;
        state.tokens = action.payload;
      })
      .addCase(fetchTrackingLinks.rejected, (state, action) => {
        state.loadingTokens = false;
        state.tokensError = action.payload as string;
      });

    // fetchReceiptsForToken
    builder
      .addCase(fetchReceiptsForToken.pending, (state, action) => {
        const token = action.meta.arg;
        state.loadingReceiptsForToken[token] = true;
        state.receiptsErrorByToken[token] = null;
      })
      .addCase(fetchReceiptsForToken.fulfilled, (state, action) => {
        const { token, receipts } = action.payload;
        state.loadingReceiptsForToken[token] = false;
        state.receiptsByToken[token] = receipts;
      })
      .addCase(fetchReceiptsForToken.rejected, (state, action: any) => {
        const token = action.payload?.token || action.meta.arg;
        state.loadingReceiptsForToken[token] = false;
        state.receiptsErrorByToken[token] = action.payload?.error || 'Failed to load receipts';
      });
  }
});

export const {
  setViewMode,
  setActiveToken,
  setSelectedNickName,
  setLinkStatusFilter,
  setSearchQuery,
  setReceiptNoFilter,
  setSelectedMarkaFilter,
  invalidateTokenCache,
  removeToken,
  removeReceiptFromToken
} = trackingLinksSlice.actions;

export default trackingLinksSlice.reducer;
