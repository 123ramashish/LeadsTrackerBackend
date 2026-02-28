"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const database_1 = __importDefault(require("./DataBase/database"));
const router_1 = __importDefault(require("./routers/router"));
const custom_error_1 = require("./middlewares/custom.error");
// ─────────────────────────────────────────────────────────────
// App Initialization
// ─────────────────────────────────────────────────────────────
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT ?? 5000);
// ─────────────────────────────────────────────────────────────
// Global Middleware
// ─────────────────────────────────────────────────────────────
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_ORIGIN ?? '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express_1.default.json({ limit: '2mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
if (process.env.NODE_ENV !== 'production') {
    app.use((0, morgan_1.default)('dev'));
}
else {
    app.use((0, morgan_1.default)('combined'));
}
// ─────────────────────────────────────────────────────────────
// Health Check Route
// ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        environment: process.env.NODE_ENV ?? 'development',
        timestamp: new Date().toISOString(),
    });
});
// ─────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────
app.use('/api', router_1.default);
// ─────────────────────────────────────────────────────────────
// 404 Handler
// ─────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
    next(new custom_error_1.CustomError(`Route ${req.originalUrl} not found`, 404));
});
// ─────────────────────────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    if (err instanceof custom_error_1.CustomError) {
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
});
// ─────────────────────────────────────────────────────────────
// Server Bootstrap (Async Safe)
// ─────────────────────────────────────────────────────────────
const startServer = async () => {
    try {
        await (0, database_1.default)();
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`📡 Environment: ${process.env.NODE_ENV ?? 'development'}`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};
startServer();
exports.default = app;
