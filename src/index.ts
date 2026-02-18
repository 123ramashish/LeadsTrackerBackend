import * as dotenv from "dotenv";
dotenv.config();
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { CustomError } from "./middlewares/custom.error";
import router from "./routers/router";
import connectDB from "./DataBase/database";

const app = express();

// middlewares
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

// routers
app.use("/api", router);

// 404 handler — prefix unused params with _
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new CustomError("API route not found", 404));
});

// global error handling — prefix unused next with _
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof CustomError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).send("Something is wrong!");
});

// Connect DB and Start Server
const PORT = process.env.PORT || 8000;
app.listen(PORT, async () => {
  await connectDB();
  console.log(`Listening ON port ${PORT}`);
});