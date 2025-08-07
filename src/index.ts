import * as dotenv from 'dotenv';
dotenv.config();
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { CustomError } from './middlewares/custom.error';
import router from './routers/router';
import connectDB from './DataBase/database';
import AutoController from './controller/auto.controller';
import cron from 'node-cron';

const app = express();

// middlewares
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

// routers
app.use("/api", router);

app.use((req, res, next) => {
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

  // ⏰ Auto task scheduler
  const autoController = new AutoController();

  // Run at 00:01 AM every day
  cron.schedule('1 0 * * *', async () => {
    console.log('[AUTO CRON] Starting auto update...');
    await autoController.runAutoUpdate();
  });
});
