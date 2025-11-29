import express from "express";
import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import apiRoutes from "./routes/apiRoutes.js";

dotenv.config();

const app = express();

// === PERFORMANCE OPTIMIZATIONS ===
app.use(compression());           // Gzip response compression
app.use(cors());
app.use(express.json({ limit: '1kb' }));  // Limit body size
app.use("/api", apiRoutes);

// ==================== START GATEWAY ====================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🌐 API Gateway is running on port ${PORT}`);
});