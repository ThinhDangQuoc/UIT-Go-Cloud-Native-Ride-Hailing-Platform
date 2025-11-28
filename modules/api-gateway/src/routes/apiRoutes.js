import express from "express";
import axios from "axios";
import { gatewayAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// BASE URL của từng service
const USER_SERVICE = process.env.USER_SERVICE_URL || "http://user-service:8081";
const DRIVER_SERVICE = process.env.DRIVER_SERVICE_URL || "http://driver-service:8082";
const TRIP_SERVICE = process.env.TRIP_SERVICE_URL || "http://trip-service:8083";

// Tạo một helper để forward request với timeout + error handling
const forwardRequest = async (method, url, data = {}, headers = {}) => {
  console.log(`[Gateway] Forwarding ${method} ${url} with body:`, data);
  try {
    const res = await axios({
      method,
      url,
      data,
      headers,
      timeout: 5000,
      validateStatus: () => true
    });
    console.log(`[Gateway] Response from service:`, res.status, res.data);
    return { status: res.status, data: res.data };
  } catch (err) {
    console.error(`[Gateway] Error calling service:`, err.message);
    return { status: 500, data: { message: "Service unreachable", error: err.message } };
  }
};


// ====================== USER ========================
router.post("/users/register", async (req, res) => {
  const r = await forwardRequest("post", `${USER_SERVICE}/api/users`, req.body);
  res.status(r.status).json(r.data);
});

router.post("/users/login", async (req, res) => {
  const r = await forwardRequest("post", `${USER_SERVICE}/api/sessions`, req.body);
  res.status(r.status).json(r.data);
});

router.get("/users/me", gatewayAuth, async (req, res) => {
  const r = await forwardRequest("get", `${USER_SERVICE}/api/users/me`, {}, req.headers);
  res.status(r.status).json(r.data);
});

// ====================== DRIVER ========================
router.put("/drivers/:id/location", gatewayAuth, async (req, res) => {
  const r = await forwardRequest(
    "put",
    `${DRIVER_SERVICE}/api/drivers/${req.params.id}/location`,
    req.body,
    req.headers
  );
  res.status(r.status).json(r.data);
});

// Batch location update endpoint (optimized for high-frequency updates)
router.post("/drivers/:id/location/batch", gatewayAuth, async (req, res) => {
  const r = await forwardRequest(
    "put",
    `${DRIVER_SERVICE}/api/drivers/${req.params.id}/location`,
    { locations: req.body.locations },
    req.headers
  );
  res.status(r.status).json(r.data);
});

router.get("/drivers/:id/location", gatewayAuth, async (req, res) => {
  const r = await forwardRequest(
    "get",
    `${DRIVER_SERVICE}/api/drivers/${req.params.id}/location`,
    {},
    req.headers
  );
  res.status(r.status).json(r.data);
});

router.get("/drivers/search", gatewayAuth, async (req, res) => {
  // Forward query params for radius search
  const queryString = new URLSearchParams(req.query).toString();
  const url = `${DRIVER_SERVICE}/api/drivers/search${queryString ? '?' + queryString : ''}`;
  const r = await forwardRequest("get", url, {}, req.headers);
  res.status(r.status).json(r.data);
});

// Driver status update (online/offline/on_trip)
router.put("/drivers/:id/status", gatewayAuth, async (req, res) => {
  const r = await forwardRequest(
    "put",
    `${DRIVER_SERVICE}/api/drivers/${req.params.id}/status`,
    req.body,
    req.headers
  );
  res.status(r.status).json(r.data);
});

// Location service stats (monitoring)
router.get("/drivers/stats/location", async (req, res) => {
  const r = await forwardRequest("get", `${DRIVER_SERVICE}/api/drivers/stats/location`, {}, {});
  res.status(r.status).json(r.data);
});

// ====================== TRIPS ========================
router.post("/trips", gatewayAuth, async (req, res) => {
  const r = await forwardRequest("post", `${TRIP_SERVICE}/api/trips`, req.body, req.headers);
  res.status(r.status).json(r.data);
});

router.get("/trips/:id", gatewayAuth, async (req, res) => {
  const r = await forwardRequest("get", `${TRIP_SERVICE}/api/trips/${req.params.id}`, {}, req.headers);
  res.status(r.status).json(r.data);
});

router.post("/trips/:id/cancel", gatewayAuth, async (req, res) => {
  const r = await forwardRequest(
    "post",
    `${TRIP_SERVICE}/api/trips/${req.params.id}/cancel`,
    req.body,
    req.headers
  );
  res.status(r.status).json(r.data);
});

router.post("/trips/:id/accept", gatewayAuth, async (req, res) => {
  const r = await forwardRequest(
    "post",
    `${TRIP_SERVICE}/api/trips/${req.params.id}/accept`,
    req.body,
    req.headers
  );
  res.status(r.status).json(r.data);
});

router.post("/trips/:id/reject", gatewayAuth, async (req, res) => {
  const r = await forwardRequest(
    "post",
    `${TRIP_SERVICE}/api/trips/${req.params.id}/reject`,
    req.body,
    req.headers
  );
  res.status(r.status).json(r.data);
});

export default router;
