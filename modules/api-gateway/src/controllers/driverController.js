import { driverServiceAPI } from "../utils/serviceClients.js";
import { publishToSQS } from "../utils/sqsClient.js";

export const registerDriver = async (req, res, next) => {
  try {
    const { name, email, phone, password, licensePlate, vehicleType } = req.body;

    if (!name || !email || !password || !licensePlate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await driverServiceAPI.register({
      name,
      email,
      phone,
      password,
      licensePlate,
      vehicleType,
    });

    // Send async event
    if (process.env.SQS_QUEUE_URL) {
      await publishToSQS({
        type: "driver.registered",
        driverId: result.id,
        email: result.email,
        vehicleType: vehicleType,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({
      message: "Driver registered successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDriverLocation = async (req, res, next) => {
  try {
    const { driverId } = req.params;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: "Latitude and longitude required" });
    }

    const result = await driverServiceAPI.updateLocation(driverId, {
      latitude,
      longitude,
    });

    // Send async event for location tracking
    if (process.env.SQS_QUEUE_URL) {
      await publishToSQS({
        type: "driver.location_updated",
        driverId: driverId,
        location: { latitude, longitude },
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      message: "Location updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getNearbyDrivers = async (req, res, next) => {
  try {
    const { latitude, longitude, radius } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: "Latitude and longitude required" });
    }

    const result = await driverServiceAPI.getNearbyDrivers(
      parseFloat(latitude),
      parseFloat(longitude),
      radius ? parseInt(radius) : 5000
    );

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
