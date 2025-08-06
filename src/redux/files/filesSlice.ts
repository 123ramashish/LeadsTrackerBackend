import { createSlice, PayloadAction } from "@reduxjs/toolkit"; 
import type { RootState } from "../store";  

// Define the initial state for our files slice
const initialState: { fileList: Record<string, string[]> } = {
  fileList: {},  // An object with categories as keys and arrays of URLs as values
};

// Create the files slice
export const filesSlice = createSlice({
  name: "files",
  initialState,
  reducers: {
    // Set all file URLs for all categories at once
    setArrayFiles: (state, action: PayloadAction<Record<string, string[]>>) => {
      state.fileList = action.payload;
    },
    
    // Add a single file URL to a specific category
    addFileUrl: (state, action: PayloadAction<{ category: string, url: string }>) => {
      const { category, url } = action.payload;
      if (!state.fileList[category]) {
        state.fileList[category] = [];
      }
      state.fileList[category].push(url);
    },
    
    // Remove a file URL from a specific category
    removeFileUrl: (state, action: PayloadAction<{ category: string, url: string }>) => {
      const { category, url } = action.payload;
      if (state.fileList[category]) {
        state.fileList[category] = state.fileList[category].filter(fileUrl => fileUrl !== url);
      }
    },
    
    // Clear all files for all categories
    clearArrayFiles: (state) => {
      state.fileList = {};
    },
    
    // Clear files for a specific category
    clearCategoryFiles: (state, action: PayloadAction<string>) => {
      const category = action.payload;
      state.fileList[category] = [];
    },
  },
});

// Export actions
export const { 
  setArrayFiles, 
  addFileUrl, 
  removeFileUrl, 
  clearArrayFiles, 
  clearCategoryFiles 
} = filesSlice.actions;

// Export selector to get all files
export const selectFiles = (state: RootState) => state.files.fileList;

// Export selector to get files for a specific category
export const selectCategoryFiles = (state: RootState, category: string) => 
  state.files.fileList[category] || [];

// Export reducer
export default filesSlice.reducer;