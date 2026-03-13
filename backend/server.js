require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { processPotholeData } = require('./processData');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test database connection
app.get('/test-db', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0].now });
  } catch (e) {
    console.error('Test DB Connection Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  } finally {
    if (client) client.release();
  }
});

// Accept sensor data in double precision format, only when manually called
app.post('/upload-sensor-data', async (req, res) => {
  const { deviceId, data } = req.body;
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Data must be an array' });
  }

  let client;
  try {
    client = await pool.connect();
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
    console.log(`Successfully inserted ${data.length} records for device ${deviceId}`);
    res.sendStatus(200);
  } catch (e) {
    if (client) await client.query('ROLLBACK');
    console.error('Database Error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    if (client) client.release();
  }
});

// Process raw sensor data to extract potholes
app.post('/process-data', async (req, res) => {
  try {
    const sensitivity = req.body.sensitivity ? parseFloat(req.body.sensitivity) : 0.5;
    const result = await processPotholeData(pool, sensitivity);
    res.json(result);
  } catch (e) {
    console.error('Data Processing Error:', e.message);
    res.status(500).json({ error: 'Failed to process data' });
  }
});

// Get identified potholes
app.get('/potholes', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query('SELECT * FROM potholes ORDER BY timestamp DESC LIMIT 100');
    res.json(rows);
  } catch (e) {
    console.error('Fetch Potholes Error:', e.message);
    res.status(500).json({ error: 'Failed to fetch pothole data' });
  } finally {
    if (client) client.release();
  }
});

app.listen(3001, () => console.log('Server running on port 3001'));