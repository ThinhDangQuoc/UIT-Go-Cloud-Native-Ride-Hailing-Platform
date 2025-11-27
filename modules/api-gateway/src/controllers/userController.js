import { userServiceAPI } from "../utils/serviceClients.js";
import { publishToSQS } from "../utils/sqsClient.js";

export const registerUser = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await userServiceAPI.register({ name, email, phone, password });

    // Send async event to SQS
    if (process.env.SQS_QUEUE_URL) {
      await publishToSQS({
        type: "user.registered",
        userId: result.id,
        email: result.email,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({
      message: "User registered successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const result = await userServiceAPI.login({ email, password });

    res.json({
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const result = await userServiceAPI.getProfile(userId, token);

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const result = await userServiceAPI.updateProfile(userId, req.body, token);

    // Send async event
    if (process.env.SQS_QUEUE_URL) {
      await publishToSQS({
        type: "user.updated",
        userId: userId,
        changes: req.body,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      message: "Profile updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
