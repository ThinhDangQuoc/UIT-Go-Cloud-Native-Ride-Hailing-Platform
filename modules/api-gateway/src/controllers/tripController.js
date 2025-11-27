import { tripServiceAPI } from "../utils/serviceClients.js";
import { publishToSQS } from "../utils/sqsClient.js";

export const createTrip = async (req, res, next) => {
  try {
    const { userId, origin, destination, passengerCount } = req.body;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    if (!userId || !origin || !destination) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await tripServiceAPI.create(
      { userId, origin, destination, passengerCount },
      token
    );

    // Send async event for trip creation
    if (process.env.SQS_QUEUE_URL) {
      await publishToSQS({
        type: "trip.created",
        tripId: result.id,
        userId: userId,
        origin: origin,
        destination: destination,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({
      message: "Trip created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getTripHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const result = await tripServiceAPI.getHistory(userId, token);

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getTripDetails = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const result = await tripServiceAPI.getDetails(tripId, token);

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTripStatus = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const { status } = req.body;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    if (!status) {
      return res.status(400).json({ error: "Status required" });
    }

    const result = await tripServiceAPI.updateStatus(tripId, status, token);

    // Send async event for status change
    if (process.env.SQS_QUEUE_URL) {
      await publishToSQS({
        type: "trip.status_updated",
        tripId: tripId,
        status: status,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      message: "Trip status updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
