import * as dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const URI = process.env.MONGODB_URI;

const connectDB = async (): Promise<void> => {
  try {
    if (!URI) {
      throw new Error("MONGODB_URI is not defined in environment variables.");
    }

    console.log("Connecting to Database...");

    await mongoose.connect(URI, {
      serverSelectionTimeoutMS: 120 * 1000, // wait up to 30s to find a server
      socketTimeoutMS: 300 * 1000,          // wait up to 45s for I/O
    });

    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  }
};

export default connectDB;
