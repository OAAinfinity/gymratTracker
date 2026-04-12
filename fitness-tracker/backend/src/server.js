import app from "./app.js";

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down server...`);
  server.close(() => {
    console.log("Server closed cleanly.");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
