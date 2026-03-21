import type { Express } from "express";
import { deptRouter } from "./dept";

function registerRoutes(app: Express) {
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/depts", deptRouter());
}

export { registerRoutes };
