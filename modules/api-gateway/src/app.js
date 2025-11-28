import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRoutes from "./routes/apiRoutes.js";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api", apiRoutes);

// ==================== START GATEWAY ====================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🌐 API Gateway is running on port ${PORT}`);
});