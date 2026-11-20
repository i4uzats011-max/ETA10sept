import { configureStore } from '@reduxjs/toolkit';
import cargoMasterReducer from './cargoMasterSlice';
import loadingPlanReducer from './loadingPlanSlice';
import trackingLinksReducer from './trackingLinksSlice';

export const store = configureStore({
  reducer: {
    cargoMaster: cargoMasterReducer,
    loadingPlan: loadingPlanReducer,
    trackingLinks: trackingLinksReducer,
  },
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
