/**
 * Processes raw sensor data to identify sudden jerks (potholes/bumps)
 * based on accelerometer vector magnitude.
 * 
 * @param {Pool} pool - The active PostgreSQL connection pool
 * @param {number} thresholdG - The configured sensitivity (extra g-force above 1g baseline required to trigger)
 */
async function processPotholeData(pool, thresholdG = 0.8) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Fetch raw sensor data (only taking rows with valid GPS and Accel data)
        const { rows } = await client.query(`
        SELECT device_id, timestamp, gps_latitude, gps_longitude, 
               accelerometer_x, accelerometer_y, accelerometer_z
        FROM sensor_data
        WHERE gps_latitude IS NOT NULL AND gps_latitude != 0
          AND gps_longitude IS NOT NULL AND gps_longitude != 0
          AND accelerometer_x IS NOT NULL
        ORDER BY timestamp ASC
        LIMIT 10000; -- Process in batches
      `);

        if (rows.length === 0) {
            await client.query('COMMIT');
            return { message: 'No raw data to process.', processed: 0, potholes_found: 0 };
        }

        const detectedPotholes = [];
        const processedTimestamps = [];

        // 2. Analyze the data
        if (rows.length > 0) {
            console.log('DEBUG: First row accelerometer data:', {
                x: rows[0].accelerometer_x,
                y: rows[0].accelerometer_y,
                z: rows[0].accelerometer_z,
                magnitude: Math.sqrt(Math.pow(rows[0].accelerometer_x, 2) + Math.pow(rows[0].accelerometer_y, 2) + Math.pow(rows[0].accelerometer_z, 2))
            });
        }
        let lastPotholeTime = 0;
        const DEBOUNCE_MS = 1000; // Minimum time between distinct pothole detections

        for (const row of rows) {
            const currentTime = new Date(row.timestamp).getTime();
            processedTimestamps.push(row.timestamp);

            const ax = row.accelerometer_x;
            const ay = row.accelerometer_y;
            const az = row.accelerometer_z;

            // Calculate the vector magnitude of the 3D acceleration
            // Since data is now 'gravity-aligned' (Linear Accel), the baseline is 0.
            const jerkSeverity = Math.sqrt((ax * ax) + (ay * ay) + (az * az));

            // Logic: Threshold check + Debounce (don't log multiple hits for one bump)
            if (jerkSeverity >= thresholdG && (currentTime - lastPotholeTime > DEBOUNCE_MS)) {
                detectedPotholes.push({
                    device_id: row.device_id,
                    timestamp: row.timestamp,
                    lat: row.gps_latitude,
                    lng: row.gps_longitude,
                    severity: jerkSeverity
                });
                lastPotholeTime = currentTime;
            }
        }

        // 3. Save Detected Potholes
        if (detectedPotholes.length > 0) {
            for (const pothole of detectedPotholes) {
                await client.query(`
            INSERT INTO potholes (device_id, timestamp, gps_latitude, gps_longitude, severity)
            VALUES ($1, $2, $3, $4, $5)
          `, [pothole.device_id, pothole.timestamp, pothole.lat, pothole.lng, pothole.severity]);
            }
        }

        // 4. Delete processed raw data to save space
        if (processedTimestamps.length > 0) {
            // Find min and max timestamps in this batch for an efficient range deletion
            // (Assuming rows are ordered by timestamp)
            const minTime = processedTimestamps[0];
            const maxTime = processedTimestamps[processedTimestamps.length - 1];

            await client.query(`
            DELETE FROM sensor_data 
            WHERE timestamp >= $1 AND timestamp <= $2
        `, [minTime, maxTime]);
        }

        await client.query('COMMIT');

        return {
            message: 'Batch processing complete.',
            processed: rows.length,
            potholes_found: detectedPotholes.length
        };

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error processing pothole data:', e.message);
        throw e;
    } finally {
        client.release();
    }
}

module.exports = {
    processPotholeData
};
