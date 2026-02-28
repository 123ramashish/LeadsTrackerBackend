import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import connectDB from './DataBase/database';
import router from './routers/router';
import { CustomError } from './middlewares/custom.error';

// ─────────────────────────────────────────────────────────────
// App Initialization
// ─────────────────────────────────────────────────────────────
const app = express();
const PORT = Number(process.env.PORT ?? 5000);

// ─────────────────────────────────────────────────────────────
// Global Middleware
// ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN ?? '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ─────────────────────────────────────────────────────────────
// Health Check Route
// ─────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    environment: process.env.NODE_ENV ?? 'development',
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────
app.use('/api', router);

// ─────────────────────────────────────────────────────────────
// 404 Handler
// ─────────────────────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new CustomError(`Route ${req.originalUrl} not found`, 404));
});

// ─────────────────────────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────────────────────────
app.use(
  (err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof CustomError) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
      });
    }

    console.error('🔥 Unexpected Error:', err);

    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
);

// ─────────────────────────────────────────────────────────────
// Server Bootstrap (Async Safe)
// ─────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV ?? 'development'}`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;