import { defineEventHandler, getRequestHeader, setResponseHeaders, getMethod } from "h3";

export default defineEventHandler((event) => {
  const origin = getRequestHeader(event, "origin");
  if (
    origin &&
    (origin.startsWith("chrome-extension://") ||
      origin.startsWith("moz-extension://") ||
      origin.includes("threads.net") ||
      origin.includes("threads.com") ||
      origin.includes("localhost"))
  ) {
    setResponseHeaders(event, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    });
  }

  if (getMethod(event) === "OPTIONS") {
    return "";
  }
});
