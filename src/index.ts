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

app.use((req,res,next) => {
  next(new CustomError("API route not found", 404));
});

// global error handling
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof CustomError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).send("Something is wrong!");
});

// Connect DB and Start Server
app.listen(process.env.PORT, async () => {
  await connectDB();
  console.log(`Listening ON port ${process.env.PORT || 8000}`);
});


// src/index.ts
import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';

import connectDB from './config/database.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import leadRoutes     from './routes/leadRoutes.js';
import templateRoutes from './routes/templateRoutes.js';
import messageRoutes  from './routes/messageRoutes.js';

// ── Bootstrap DB ──────────────────────────────────────────────────────────────
connectDB();

// ── App setup ─────────────────────────────────────────────────────────────────
const app  = express();
const PORT = Number(process.env.PORT ?? 5000);

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/leads',     leadRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/messages',  messageRoutes);

// ── 404 & global error handler ────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV ?? 'development'}`);
});

export default app;