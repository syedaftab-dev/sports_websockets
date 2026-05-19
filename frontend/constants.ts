const DEFAULT_API_BASE_URL = "https://sportswebsockets-production.up.railway.app";
const DEFAULT_WS_BASE_URL = "wss://sportswebsockets-production.up.railway.app/ws";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
export const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL || DEFAULT_WS_BASE_URL;

// Exponential backoff configuration
export const MAX_RECONNECT_DELAY = 30000; // 30 seconds
export const INITIAL_RECONNECT_DELAY = 1000; // 1 second
