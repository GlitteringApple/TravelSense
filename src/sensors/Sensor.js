import { Accelerometer, Gyroscope, Magnetometer, Barometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { useEffect, useState, useRef } from 'react';
import { NativeModules, DeviceEventEmitter, AppState } from 'react-native';
import SensorUpload from './SensorUpload';

const DATA_LENGTH = 500;

export function useSensorData(isPaused = false) {
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

  const syncHistoryFromBatch = () => {
    const GRAPH_HEIGHT = 100;
    const batch = SensorUpload.dataBatch;
    if (batch.length === 0) return;

    // Get the last DATA_LENGTH points from the batch
    const recentPoints = batch.slice(-DATA_LENGTH);
    const newHistory = {
      gps: [Array(DATA_LENGTH).fill(0), Array(DATA_LENGTH).fill(0)],
      accelerometer: [Array(DATA_LENGTH).fill(0), Array(DATA_LENGTH).fill(0), Array(DATA_LENGTH).fill(0)],
      gyroscope: [Array(DATA_LENGTH).fill(0), Array(DATA_LENGTH).fill(0), Array(DATA_LENGTH).fill(0)],
      barometer: [Array(DATA_LENGTH).fill(0)],
      magnetometer: [Array(DATA_LENGTH).fill(0), Array(DATA_LENGTH).fill(0), Array(DATA_LENGTH).fill(0)],
    };

    recentPoints.forEach((point, idx) => {
      const pos = DATA_LENGTH - recentPoints.length + idx;
      
      newHistory.accelerometer[0][pos] = ((point.accelerometer_x + 2) / 4) * GRAPH_HEIGHT;
      newHistory.accelerometer[1][pos] = ((point.accelerometer_y + 2) / 4) * GRAPH_HEIGHT;
      newHistory.accelerometer[2][pos] = ((point.accelerometer_z + 2) / 4) * GRAPH_HEIGHT;

      newHistory.gyroscope[0][pos] = ((point.gyroscope_x + 8) / 16) * GRAPH_HEIGHT;
      newHistory.gyroscope[1][pos] = ((point.gyroscope_y + 8) / 16) * GRAPH_HEIGHT;
      newHistory.gyroscope[2][pos] = ((point.gyroscope_z + 8) / 16) * GRAPH_HEIGHT;

      newHistory.magnetometer[0][pos] = ((point.magnetometer_x + 100) / 200) * GRAPH_HEIGHT;
      newHistory.magnetometer[1][pos] = ((point.magnetometer_y + 100) / 200) * GRAPH_HEIGHT;
      newHistory.magnetometer[2][pos] = ((point.magnetometer_z + 100) / 200) * GRAPH_HEIGHT;

      newHistory.barometer[0][pos] = (point.barometer / 1100) * GRAPH_HEIGHT;

      newHistory.gps[0][pos] = ((point.gps_latitude + 90) / 180) * GRAPH_HEIGHT;
      newHistory.gps[1][pos] = ((point.gps_longitude + 180) / 360) * GRAPH_HEIGHT;
    });

    currentHistory.current = newHistory;
    setSensorState(prev => ({ ...prev, history: newHistory }));
  };

  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('App in foreground: Syncing data from background recording');
        try {
          // Sync directly from native memory for instant restoration
          const inMemoryData = await NativeModules.TravelSenseModule.getInMemoryBuffer();
          if (inMemoryData && inMemoryData !== '[]') {
            SensorUpload.setInMemoryData(inMemoryData);
          } else {
            // Fallback to disk if memory is empty
            await SensorUpload.loadFromDisk();
          }
          syncHistoryFromBatch();
        } catch (e) {
          console.error('Failed to sync history on resume:', e);
          await SensorUpload.loadFromDisk();
          syncHistoryFromBatch();
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    syncHistoryFromBatch();
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isPaused) return;

    let accelSub, gyroSub, magSub, baroSub, locationWatcher, nativeSub;
    
    nativeSub = DeviceEventEmitter.addListener('onSensorData', (event) => {
      // Prioritise native readings in background as expo-sensors often pause
      if (latestData.current) {
        if (event.accelerometer) latestData.current.accelerometer = event.accelerometer;
        if (event.gyroscope) latestData.current.gyroscope = event.gyroscope;
        if (event.magnetometer) latestData.current.magnetometer = event.magnetometer;
        if (event.barometer) latestData.current.barometer = { pressure: event.barometer };
      }
    });

    Accelerometer.setUpdateInterval(5); // 200 Hz
    Gyroscope.setUpdateInterval(5); // 200 Hz
    Magnetometer.setUpdateInterval(1000); // 1 Hz
    Barometer.setUpdateInterval(1000); // 1 Hz

    accelSub = Accelerometer.addListener(data => { latestData.current.accelerometer = data; });
    gyroSub = Gyroscope.addListener(data => { latestData.current.gyroscope = data; });
    magSub = Magnetometer.addListener(data => { latestData.current.magnetometer = data; });
    baroSub = Barometer.addListener(data => { latestData.current.barometer = { pressure: data.pressure }; });

    (async () => {
      const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
      if (foreStatus === 'granted') {
        // Background location is required for recording when app is minimized
        await Location.requestBackgroundPermissionsAsync();
        
        // Activity recognition is required for exercise/tracking apps
        if (NativeModules.TravelSenseModule && NativeModules.TravelSenseModule.requestActivityRecognitionPermission) {
          await NativeModules.TravelSenseModule.requestActivityRecognitionPermission()
            .catch(err => console.log('Activity permission request failed', err));
        }

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

    // Gravity alignment variables (Low Pass Filter)
    const gravity = { x: 0, y: 0, z: 0 }; 
    const alpha = 0.1; 

    const tick = setInterval(() => {
      const nextData = { ...latestData.current };

      // Gravity Alignment
      gravity.x = alpha * nextData.accelerometer.x + (1 - alpha) * gravity.x;
      gravity.y = alpha * nextData.accelerometer.y + (1 - alpha) * gravity.y;
      gravity.z = alpha * nextData.accelerometer.z + (1 - alpha) * gravity.z;

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

      /* 
      SensorUpload.addData({
        timestamp: new Date().toISOString(),
        ...nextData,
        accelerometer: linearAccel 
      });
      */

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
      nativeSub && nativeSub.remove();
      clearInterval(tick);
    };
  }, [isPaused]);

  return sensorState;
}
