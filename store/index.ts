import { configureStore } from '@reduxjs/toolkit';
import cargoMasterReducer from './cargoMasterSlice';

export const store = configureStore({
  reducer: {
    cargoMaster: cargoMasterReducer,
  },
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
