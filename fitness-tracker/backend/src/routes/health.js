import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    readiness: "ready",
    service: "fitness-tracker-backend",
    timestamp: new Date().toISOString()
  });
});

export default router;
