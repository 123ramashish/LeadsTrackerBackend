import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../store";

// Define the initial state using that type
const initialState: any = {
  _id: null,
  name: "",
  email: "",
  createdAt: null,
  updatedAt: null,
  role: "",
  phone: null,
  createdBy: null,
};

export const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<any>) => {
      return { ...action.payload }; // Set the user data
    },
    clearUser: () => initialState, // Reset user state to initial state
  },
});

export const { setUser, clearUser } = userSlice.actions;

// Selector for getting user state
export const selectUser = (state: RootState) => state.user;

export default userSlice.reducer;
