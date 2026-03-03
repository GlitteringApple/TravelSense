-- 1. Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 2. Create the sensor data table
CREATE TABLE sensor_data (
  device_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  gps_latitude DOUBLE PRECISION,
  gps_longitude DOUBLE PRECISION,
  accelerometer_x DOUBLE PRECISION,
  accelerometer_y DOUBLE PRECISION,
  accelerometer_z DOUBLE PRECISION,
  gyroscope_x DOUBLE PRECISION,
  gyroscope_y DOUBLE PRECISION,
  gyroscope_z DOUBLE PRECISION,
  barometer DOUBLE PRECISION,
  magnetometer_x DOUBLE PRECISION,
  magnetometer_y DOUBLE PRECISION,
  magnetometer_z DOUBLE PRECISION
);

-- 3. Turn it into a hypertable (partitioned by time)
SELECT create_hypertable('sensor_data', 'timestamp');

-- 4. Create an index for faster queries by device and time
CREATE INDEX ON sensor_data (device_id, timestamp DESC);
