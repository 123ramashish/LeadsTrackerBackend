import { configureStore } from "@reduxjs/toolkit";
import { persistStore, persistReducer } from "redux-persist";
import storage from "redux-persist/lib/storage";
import userReducer from "./users/userSlice";
import themeReducer from "./theme/themeSlice";
import filesReducer from "./files/filesSlice";

// Persist configurations
const userPersistConfig = {
  key: "user",
  storage,
};

const themePersistConfig = {
  key: "theme",
  storage,
};
const filesPersistConfig = {
  key: "files",
  storage,
};

const persistedUserReducer = persistReducer(userPersistConfig, userReducer);
const persistedThemeReducer = persistReducer(themePersistConfig, themeReducer);
const persistedFilesReducer = persistReducer(filesPersistConfig, filesReducer);

export const store = configureStore({
  reducer: {
    user: persistedUserReducer,
    theme: persistedThemeReducer,
    files: filesReducer,
    
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          "persist/PERSIST",
          "persist/REHYDRATE",
          "persist/REGISTER",
          "persist/PAUSE",
          "persist/PURGE",
          "persist/FLUSH",
        ],
      },
    }).concat(
     
    ), // ✅ Add middleware here
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const persistor = persistStore(store);
