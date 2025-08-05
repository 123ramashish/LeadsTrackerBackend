import * as dotenv from 'dotenv'
dotenv.config()
import mongoose from "mongoose"
const URI = process.env.MONGODB_URI;
console.log("URI", URI);
const connectDB = async () => {
    try {
        if (!URI) {
            throw new Error("MONGODB_URI is not defined in environment variables.");
        }
        console.log("Connecting to Database...", URI);
        await mongoose.connect(URI);
        console.log("Connected Successfully");
    } catch (error) {
        console.log(error);
        process.exit(1);
    }
}

connectDB().then(()=>{
    console.log("DataBase Connected");
})



export default connectDB;