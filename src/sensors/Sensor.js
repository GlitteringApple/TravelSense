import { Accelerometer, Gyroscope, Magnetometer, Barometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export function useSensorData() {
  const [sensorData, setSensorData] = useState({
    gps: { latitude: null, longitude: null },
    accelerometer: { x: null, y: null, z: null },
    gyroscope: { x: null, y: null, z: null },
    barometer: { pressure: null },
    magnetometer: { x: null, y: null, z: null },
  });

  useEffect(() => {
    let accelSub, gyroSub, magSub, baroSub, locationWatcher;
    accelSub = Accelerometer.addListener(data => setSensorData(prev => ({ ...prev, accelerometer: data })));
    gyroSub = Gyroscope.addListener(data => setSensorData(prev => ({ ...prev, gyroscope: data })));
    magSub = Magnetometer.addListener(data => setSensorData(prev => ({ ...prev, magnetometer: data })));
    baroSub = Barometer.addListener(data => setSensorData(prev => ({ ...prev, barometer: { pressure: data.pressure } })));
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        locationWatcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 0 },
          loc => setSensorData(prev => ({ ...prev, gps: { latitude: loc.coords.latitude, longitude: loc.coords.longitude } }))
        );
      }
    })();
    return () => {
      accelSub && accelSub.remove();
      gyroSub && gyroSub.remove();
      magSub && magSub.remove();
      baroSub && baroSub.remove();
      locationWatcher && locationWatcher.remove();
    };
  }, []);

  return sensorData;
}
