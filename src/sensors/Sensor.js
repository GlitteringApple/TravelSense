import { Accelerometer, Gyroscope, Magnetometer, Barometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { useEffect, useState, useRef } from 'react';
import SensorUpload from './SensorUpload';

const DATA_LENGTH = 500;

export function useSensorData() {
  const [sensorState, setSensorState] = useState({
    data: {
      gps: { latitude: 0, longitude: 0, speed: 0 },
      accelerometer: { x: 0, y: 0, z: 0 },
      gyroscope: { x: 0, y: 0, z: 0 },
      barometer: { pressure: 0 },
      magnetometer: { x: 0, y: 0, z: 0 },
    },
    history: {
      gps: Array(2).fill().map(() => Array(DATA_LENGTH).fill(0)),
      accelerometer: Array(3).fill().map(() => Array(DATA_LENGTH).fill(0)),
      gyroscope: Array(3).fill().map(() => Array(DATA_LENGTH).fill(0)),
      barometer: Array(1).fill().map(() => Array(DATA_LENGTH).fill(0)),
      magnetometer: Array(3).fill().map(() => Array(DATA_LENGTH).fill(0)),
    },
    tick: 0,
  });

  const latestData = useRef(sensorState.data);
  const currentHistory = useRef(sensorState.history);

  useEffect(() => {
    let accelSub, gyroSub, magSub, baroSub, locationWatcher;

    Accelerometer.setUpdateInterval(5); // 200 Hz
    Gyroscope.setUpdateInterval(5); // 200 Hz
    Magnetometer.setUpdateInterval(1000); // 1 Hz
    Barometer.setUpdateInterval(1000); // 1 Hz

    accelSub = Accelerometer.addListener(data => { latestData.current.accelerometer = data; });
    gyroSub = Gyroscope.addListener(data => { latestData.current.gyroscope = data; });
    magSub = Magnetometer.addListener(data => { latestData.current.magnetometer = data; });
    baroSub = Barometer.addListener(data => { latestData.current.barometer = { pressure: data.pressure }; });

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        locationWatcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0 },
          loc => {
            latestData.current.gps = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              speed: loc.coords.speed ? loc.coords.speed * 3.6 : 0 // Convert m/s to km/h
            };
          }
        );
      }
    })();

    // Start auto upload for sensor data
    //SensorUpload.startAutoUpload();

    // Gravity alignment variables (Low Pass Filter)
    const gravity = { x: 0, y: 0, z: 0 }; // Initialize to zero to let it learn baseline
    const alpha = 0.1; // Filter responsiveness

    const tick = setInterval(() => {
      const nextData = { ...latestData.current };

      // DEBUG: Log the first few raw accel values to console (optional)
      // if (prev.tick % 100 === 0) console.log('Raw Accel:', nextData.accelerometer);

      // Gravity Alignment (Separating Gravity from Linear Acceleration)
      gravity.x = alpha * nextData.accelerometer.x + (1 - alpha) * gravity.x;
      gravity.y = alpha * nextData.accelerometer.y + (1 - alpha) * gravity.y;
      gravity.z = alpha * nextData.accelerometer.z + (1 - alpha) * gravity.z;

      // Linear acceleration (Gravity-Aligned jerk data)
      const linearAccel = {
        x: nextData.accelerometer.x - gravity.x,
        y: nextData.accelerometer.y - gravity.y,
        z: nextData.accelerometer.z - gravity.z,
      };

      const nextHistory = { ...currentHistory.current };
      const GRAPH_HEIGHT = 100;

      const updateHist = (key, values) => {
        nextHistory[key] = nextHistory[key].map((arr, i) => {
          const newArr = arr.slice(1);
          newArr.push(values[i] ?? 0);
          return newArr;
        });
      };

      updateHist('accelerometer', [
        ((linearAccel.x + 2) / 4) * GRAPH_HEIGHT,
        ((linearAccel.y + 2) / 4) * GRAPH_HEIGHT,
        ((linearAccel.z + 2) / 4) * GRAPH_HEIGHT,
      ]);

      updateHist('gyroscope', [
        ((nextData.gyroscope.x + 8) / 16) * GRAPH_HEIGHT,
        ((nextData.gyroscope.y + 8) / 16) * GRAPH_HEIGHT,
        ((nextData.gyroscope.z + 8) / 16) * GRAPH_HEIGHT,
      ]);

      updateHist('magnetometer', [
        ((nextData.magnetometer.x + 100) / 200) * GRAPH_HEIGHT,
        ((nextData.magnetometer.y + 100) / 200) * GRAPH_HEIGHT,
        ((nextData.magnetometer.z + 100) / 200) * GRAPH_HEIGHT,
      ]);

      updateHist('barometer', [(nextData.barometer.pressure / 1100) * GRAPH_HEIGHT]);

      updateHist('gps', [
        ((nextData.gps.latitude + 90) / 180) * GRAPH_HEIGHT,
        ((nextData.gps.longitude + 180) / 360) * GRAPH_HEIGHT,
      ]);

      currentHistory.current = nextHistory;

      // Add batched data (using gravity-aligned linear acceleration)
      SensorUpload.addData({
        timestamp: new Date().toISOString(),
        ...nextData,
        accelerometer: linearAccel // Pothole detection is best with linear accel
      });

      setSensorState(prev => ({
        data: { ...nextData, accelerometer: linearAccel },
        history: nextHistory,
        tick: prev.tick + 1
      }));
    }, 32);

    return () => {
      accelSub && accelSub.remove();
      gyroSub && gyroSub.remove();
      magSub && magSub.remove();
      baroSub && baroSub.remove();
      locationWatcher && locationWatcher.remove();
      clearInterval(tick);
      SensorUpload.stopAutoUpload();
    };
  }, []);

  return sensorState;
}

