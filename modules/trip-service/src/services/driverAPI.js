import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const DRIVER_URL = process.env.DRIVER_SERVICE_URL;

export async function findNearestDriver(lat, lng, radius = 5, token) {
  try {
    // Xây dựng URL API để tìm tài xế (gửi yêu cầu GET đến driver-service)
    const url = `${DRIVER_URL}/drivers/search?lat=${lat}&lng=${lng}&radius=${radius}`;

    // Gửi request đến Driver Service, kèm token trong header để xác thực
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Chuẩn hóa dữ liệu trả về từ Driver Service.
    // Một số trường hợp có thể trả về dạng mảng [id, distance],
    // ta chuyển thành object { driverId, distance_km } cho nhất quán.
    const drivers = (res.data || []).map(d => {
      if (Array.isArray(d)) {
        return { driverId: d[0], distance_km: parseFloat(d[1]) };
      }
      return d;
    });

    // Trả về danh sách tài xế gần nhất
    return drivers;
  } catch (err) {
    // Nếu có lỗi (ví dụ: driver-service không phản hồi),
    // ghi log lỗi và trả về mảng rỗng để hệ thống vẫn tiếp tục chạy.
    console.error("❌ findNearestDriver error:", err.message);
    return [];
  }
}