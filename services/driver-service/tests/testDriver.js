import { io } from "socket.io-client";

// Cấu hình
const DRIVER_SERVICE_URL = "http://localhost:8084";
const DRIVER_ID = 101; // ID tài xế giả định
const INITIAL_LAT = 10.7769; // Chợ Bến Thành
const INITIAL_LNG = 106.7009;

console.log(`🔌 Connecting to ${DRIVER_SERVICE_URL} as Driver ${DRIVER_ID}...`);

const socket = io(DRIVER_SERVICE_URL);

socket.on("connect", () => {
  console.log(`✅ Connected with Socket ID: ${socket.id}`);

  // 1. Đăng ký Room (QUAN TRỌNG: để nhận offer riêng)
  console.log(`®️ Registering driver ID: ${DRIVER_ID}`);
  socket.emit("registerDriver", DRIVER_ID);

  // 2. Giả lập gửi vị trí liên tục (3 giây/lần)
  startDriving();
});

// 3. Lắng nghe Offer (Job tìm xe)
socket.on("tripOffer", (data) => {
  console.log("\n🔥🔥🔥 RECEIVED TRIP OFFER! 🔥🔥🔥");
  console.log("📦 Trip Data:", JSON.stringify(data, null, 2));
  console.log("----------------------------------------\n");
});

socket.on("disconnect", () => {
  console.log("❌ Disconnected");
});

// Hàm giả lập di chuyển
function startDriving() {
  let lat = INITIAL_LAT;
  let lng = INITIAL_LNG;

  setInterval(() => {
    // Nhích nhẹ vị trí một chút để giả vờ đang đi
    lat += 0.0001; 
    lng += 0.0001;

    const payload = {
      driverId: DRIVER_ID,
      lat: lat.toFixed(6), // Làm tròn
      lng: lng.toFixed(6)
    };

    // Gửi sự kiện lên Server
    socket.emit("driverLocationUpdate", payload);
    
    // Log nhẹ để biết đang chạy
    process.stdout.write(`📍 Sent loc: ${payload.lat}, ${payload.lng}\r`);
  }, 3000); // 3 giây gửi 1 lần
}