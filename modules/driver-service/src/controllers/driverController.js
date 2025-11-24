import axios from "axios";
import redis, { KEYS } from "../utils/redis.js";

const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL;

//Cập nhật vị trí hiện tại của tài xế trong Redis thông qua GEO API.
export async function updateLocation(req, res) {
  const { id } = req.params;
  const { lat, lng } = req.body;

  // Xác thực quyền truy cập: chỉ tài xế có ID trùng với token mới được phép cập nhật
  if (req.user.role !== 'driver' || req.user.id != id) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  if (!lat || !lng) {
    return res.status(400).json({ message: 'Missing location coordinates' });
  }

  try {
    // Lưu vị trí tài xế vào Redis bằng cấu trúc GEO (geoadd)
    await redis.geoadd(KEYS.DRIVERS_LOCATIONS, lng, lat, id);
    res.json({ message: 'Location updated' });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

//Lấy vị trí hiện tại của một tài xế dựa trên ID.
export async function getLocation(req, res) {
  const { id } = req.params;

  try {
    const position = await redis.geopos(KEYS.DRIVERS_LOCATIONS, id);
    if (!position[0]) {
      return res.status(404).json({ message: 'Driver location not found' });
    }
    res.json({ lat: position[0][1], lng: position[0][0] });
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

//Tìm kiếm các tài xế gần một vị trí nhất định trong bán kính cho trước.
export async function searchNearbyDrivers(req, res) {
  const { lat, lng, radius = 5 } = req.query; // Mặc định bán kính 5 km

  if (!lat || !lng) {
    return res.status(400).json({ message: 'Missing location coordinates' });
  }

  try {
    // Truy vấn các tài xế trong phạm vi bán kính bằng Redis GEO
    const nearby = await redis.georadius(
      KEYS.DRIVERS_LOCATIONS,
      lng,
      lat,
      radius,
      'km',
      'WITHCOORD'
    );

    // Chuẩn hóa dữ liệu đầu ra
    const drivers = nearby.map(([id, [long, lati]]) => ({
      id,
      lat: lati,
      lng: long,
    }));

    res.json(drivers);
  } catch (error) {
    console.error('Search drivers error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Gửi thông báo tới tài xế khi có chuyến đi mới (hiện mô phỏng bằng console log).
 */
export async function notifyDriver(req, res) {
  const { id } = req.params;
  const { tripId } = req.body;

  if (!tripId) {
    return res.status(400).json({ message: 'Missing tripId' });
  }

  try {
    // Trong hệ thống thực, sẽ dùng WebSocket hoặc Push Notification.
    console.log(`Notifying driver ${id} of trip ${tripId}`);
    res.json({ message: 'Notification sent' });
  } catch (error) {
    console.error('Notify driver error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Tài xế chấp nhận chuyến đi — gọi sang TripService để cập nhật trạng thái.
 */
export async function acceptTrip(req, res) {
  const { id, tripId } = req.params; // driverId, tripId
  try {
    console.log(`Driver ${id} accepted trip ${tripId}`);

    const authHeader = req.headers.authorization;

    await axios.post(
      `${TRIP_SERVICE_URL}/trips/${tripId}/accept`,
      { driverId: id },
      {
        headers: {
          ...(authHeader ? { Authorization: authHeader } : {}),
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );

    res.json({ message: "Trip accepted successfully" });
  } catch (err) {
    console.error("Accept trip error:", err?.response?.data || err.message);
    res.status(500).json({ message: err.message });
  }
}

/**
 * Tài xế từ chối chuyến đi — cũng gọi sang TripService để cập nhật.
 */
export async function rejectTrip(req, res) {
  const { id, tripId } = req.params;
  try {
    console.log(`Driver ${id} rejected trip ${tripId}`);

    const authHeader = req.headers.authorization;

    await axios.post(
      `${TRIP_SERVICE_URL}/trips/${tripId}/reject`,
      { driverId: id },
      {
        headers: {
          ...(authHeader ? { Authorization: authHeader } : {}),
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );

    res.json({ message: "Trip rejected successfully" });
  } catch (err) {
    console.error("Reject trip error:", err?.response?.data || err.message);
    res.status(500).json({ message: err.message });
  }
}

/**
 * Cập nhật trạng thái hoạt động của tài xế (online/offline).
 * Khi offline, tài xế bị loại khỏi danh sách vị trí đang hoạt động.
 */
export async function updateStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (req.user.role !== 'driver' || req.user.id != id) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  if (!['online', 'offline'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    // Lưu trạng thái hoạt động vào Redis
    await redis.set(`${KEYS.DRIVER_STATUS}${id}`, status);

    // Nếu offline, xóa khỏi danh sách vị trí
    if (status === 'offline') {
      await redis.zrem(KEYS.DRIVERS_LOCATIONS, id);
    }

    res.json({ message: `Status updated to ${status}` });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
