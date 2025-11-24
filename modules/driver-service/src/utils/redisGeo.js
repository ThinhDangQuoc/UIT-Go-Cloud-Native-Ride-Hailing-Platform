import { redis } from "../db/db.js";

// Cập nhật vị trí của tài xế trong Redis (GeoSet)
export async function updateDriverLocation(driverId, lat, lng) {
  await redis.geoadd("drivers:locations", lng, lat, driverId);
}

// Tìm danh sách tài xế trong bán kính (km) từ vị trí chỉ định
export async function findNearbyDrivers(lat, lng, radiusKm = 5) {
  return await redis.georadius(
    "drivers:locations",
    lng,
    lat,
    radiusKm,
    "km",
    "WITHDIST"
  );
}
