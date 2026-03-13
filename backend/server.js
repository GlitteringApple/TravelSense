require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Accept sensor data in double precision format, only when manually called
app.post('/upload-sensor-data', async (req, res) => {
  const { deviceId, data } = req.body;
  // data: [{ timestamp, gps_latitude, gps_longitude, accelerometer_x, ... }]
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of data) {
      await client.query(
        `INSERT INTO sensor_data (
          device_id, timestamp,
          gps_latitude, gps_longitude,
          accelerometer_x, accelerometer_y, accelerometer_z,
          gyroscope_x, gyroscope_y, gyroscope_z,
          barometer,
          magnetometer_x, magnetometer_y, magnetometer_z
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          deviceId,
          row.timestamp,
          row.gps_latitude,
          row.gps_longitude,
          row.accelerometer_x,
          row.accelerometer_y,
          row.accelerometer_z,
          row.gyroscope_x,
          row.gyroscope_y,
          row.gyroscope_z,
          row.barometer,
          row.magnetometer_x,
          row.magnetometer_y,
          row.magnetometer_z,
        ]
      );
    }
    await client.query('COMMIT');
    res.sendStatus(200);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.listen(3001, () => console.log('Server running on port 3001'));