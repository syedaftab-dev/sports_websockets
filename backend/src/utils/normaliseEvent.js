// src/utils/normaliseEvent.js
/**
 * Convert raw event from ESPN API into internal canonical shape.
 * Since we normalize at the service level, this is a pass-through.
 * @param {object} raw - normalized event object
 * @returns {object} canonical event
 */
export function normaliseApiEvent(raw) {
  return raw;
}
