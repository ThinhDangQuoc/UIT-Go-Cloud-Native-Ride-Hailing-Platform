import axios from "axios";
import redis, { KEYS } from "../utils/redis.js";
import locationService from "../services/locationService.js";
import { publishToHistoryQueue } from "../utils/sqsLocationClient.js";

const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL;

/**
 * Cập nhật vị trí hiện tại của tài xế
 * Hỗ trợ cả single update và batch update (mỗi 2-3 giây)
 * 
 * Single: PUT /drivers/:id/location { lat, lng, heading?, speed?, accuracy?, tripId? }
 * Batch:  PUT /drivers/:id/location { locations: [{ lat, lng, heading, speed, accuracy, tripId, timestamp }] }
 */
export async function updateLocation(req, res) {
  const { id } = req.params;
  const { lat, lng, heading, speed, accuracy, tripId, locations } = req.body;

  // Xác thực quyền truy cập: chỉ tài xế có ID trùng với token mới được phép cập nhật
  if (req.user.role !== 'driver' || req.user.id != id) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    // Batch update mode (client-side batching)
    if (locations && Array.isArray(locations)) {
      const batchData = locations.map(loc => ({
        driverId: id,
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading,
        speed: loc.speed,
        accuracy: loc.accuracy,
        tripId: loc.tripId
      }));

      const result = await locationService.batchUpdateLocations(batchData);
      
      // Publish last location to history queue (async)
      const lastLoc = locations[locations.length - 1];
      publishToHistoryQueue({
        driverId: id,
        lat: lastLoc.lat,
        lng: lastLoc.lng,
        heading: lastLoc.heading,
        speed: lastLoc.speed,
        accuracy: lastLoc.accuracy,
        tripId: lastLoc.tripId
      }).catch(err => console.error('History queue publish error:', err));

      return res.json({ 
        message: 'Batch location updated',
        count: result.count,
        timestamp: result.timestamp
      });
    }

    // Single update mode
    if (!lat || !lng) {
      return res.status(400).json({ message: 'Missing location coordinates' });
    }

    const result = await locationService.updateDriverLocation(id, {
      lat,
      lng,
      heading,
      speed,
      accuracy,
      tripId
    });

    // Check if update was skipped due to delta threshold
    if (result.skipped) {
      return res.json({ 
        message: 'Location update skipped (delta threshold not met)',
        reason: result.reason
      });
    }

    // Publish to history queue (async, non-blocking)
    publishToHistoryQueue({
      driverId: id,
      lat,
      lng,
      heading,
      speed,
      accuracy,
      tripId
    }).catch(err => console.error('History queue publish error:', err));

    res.json({ 
      message: 'Location updated',
      timestamp: result.timestamp
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

//Lấy vị trí hiện tại của một tài xế dựa trên ID (với full metadata).
export async function getLocation(req, res) {
  const { id } = req.params;

  try {
    const location = await locationService.getDriverLocation(id);
    
    if (!location) {
      return res.status(404).json({ message: 'Driver location not found' });
    }
    
    res.json(location);
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

//Tìm kiếm các tài xế gần một vị trí nhất định trong bán kính cho trước.
export async function searchNearbyDrivers(req, res) {
  const { lat, lng, radius = 5, limit = 20 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ message: 'Missing location coordinates' });
  }

  try {
    const drivers = await locationService.findNearbyDrivers(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radius),
      parseInt(limit)
    );

    res.json({
      count: drivers.length,
      radius: parseFloat(radius),
      drivers
    });
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

  if (!['online', 'offline', 'on_trip'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status. Must be: online, offline, or on_trip' });
  }

  try {
    // Lưu trạng thái hoạt động vào Redis
    await redis.set(`${KEYS.DRIVER_STATUS}${id}`, status);

    // Nếu offline, xóa khỏi danh sách vị trí
    if (status === 'offline') {
      await locationService.removeDriverLocation(id);
    }

    res.json({ message: `Status updated to ${status}` });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Lấy thống kê location service (for monitoring)
 */
export async function getLocationStats(req, res) {
  try {
    const stats = await locationService.getLocationStats();
    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
