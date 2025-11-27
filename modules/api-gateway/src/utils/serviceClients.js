import axios from "axios";

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://user-service:8081";
const DRIVER_SERVICE_URL = process.env.DRIVER_SERVICE_URL || "http://driver-service:8082";
const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL || "http://trip-service:8083";

// User Service calls
export const userServiceAPI = {
  register: async (userData) => {
    const response = await axios.post(`${USER_SERVICE_URL}/api/users/register`, userData);
    return response.data;
  },

  login: async (credentials) => {
    const response = await axios.post(`${USER_SERVICE_URL}/api/users/login`, credentials);
    return response.data;
  },

  getProfile: async (userId, token) => {
    const response = await axios.get(`${USER_SERVICE_URL}/api/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  updateProfile: async (userId, userData, token) => {
    const response = await axios.put(`${USER_SERVICE_URL}/api/users/${userId}`, userData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },
};

// Driver Service calls
export const driverServiceAPI = {
  register: async (driverData) => {
    const response = await axios.post(`${DRIVER_SERVICE_URL}/api/drivers/register`, driverData);
    return response.data;
  },

  updateLocation: async (driverId, location) => {
    const response = await axios.post(`${DRIVER_SERVICE_URL}/api/drivers/${driverId}/location`, location);
    return response.data;
  },

  getNearbyDrivers: async (latitude, longitude, radius = 5000) => {
    const response = await axios.get(`${DRIVER_SERVICE_URL}/api/drivers/nearby`, {
      params: { latitude, longitude, radius },
    });
    return response.data;
  },
};

// Trip Service calls
export const tripServiceAPI = {
  create: async (tripData, token) => {
    const response = await axios.post(`${TRIP_SERVICE_URL}/api/trips`, tripData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  getHistory: async (userId, token) => {
    const response = await axios.get(`${TRIP_SERVICE_URL}/api/trips/user/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  getDetails: async (tripId, token) => {
    const response = await axios.get(`${TRIP_SERVICE_URL}/api/trips/${tripId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  updateStatus: async (tripId, status, token) => {
    const response = await axios.put(`${TRIP_SERVICE_URL}/api/trips/${tripId}/status`, { status }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },
};
