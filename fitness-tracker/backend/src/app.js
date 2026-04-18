import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import healthRouter from "./routes/health.js";
import paymentsRouter from "./routes/payments.js";
import workoutsRouter from "./routes/workouts.js";

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, callback) {
      const isLocalhostOrigin = Boolean(origin) && /^https?:\/\/localhost:\d+$/i.test(origin);
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin) || isLocalhostOrigin) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(
  express.json({
    verify(req, res, buf) {
      if (req.originalUrl === "/api/payments/webhook") {
        req.rawBody = Buffer.from(buf);
      }
    },
  })
);

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "fitness-tracker-backend",
    message: "Backend is running. Use /api/health for health checks.",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/health", healthRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/workouts", workoutsRouter);

app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  if (err.message === "Origin not allowed by CORS") {
    res.status(403).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
});

export default app;