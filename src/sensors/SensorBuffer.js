import { Accelerometer, Gyroscope, Magnetometer, Barometer } from 'expo-sensors';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { v4 as uuidv4 } from 'uuid';

const BUFFER_DURATION_MS = 10 * 60 * 1000; // 10 minutes

let buffer = [];
let lastFlush = Date.now();
let deviceId = null;

async function getDeviceId() {
  if (!deviceId) {
    deviceId = await SecureStore.getItemAsync('deviceId');
    if (!deviceId) {
      deviceId = uuidv4();
      await SecureStore.setItemAsync('deviceId', deviceId);
    }
  }
  return deviceId;
}

function alignAndBufferSensorData({ gps, accelerometer, gyroscope, barometer, magnetometer }) {
  const timestamp = new Date().toISOString();
  buffer.push({
    timestamp,
    gps,
    accelerometer,
    gyroscope,
    barometer,
    magnetometer,
  });
  if (Date.now() - lastFlush > BUFFER_DURATION_MS) {
    flushBuffer();
  }
}

async function flushBuffer() {
  if (buffer.length === 0) return;
  const id = await getDeviceId();
  await fetch('http://localhost:3001/upload-sensor-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: id, data: buffer }),
  });
  buffer = [];
  lastFlush = Date.now();
}

export { alignAndBufferSensorData, flushBuffer, getDeviceId };