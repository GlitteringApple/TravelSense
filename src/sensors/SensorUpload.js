class SensorUpload {
    constructor() {
        this.dataBatch = [];
        this.uploadInterval = 10 * 60 * 1000; // 10 minutes
        this.timer = null;
        // Default URL to localhost. Depending on the environment, 
        // it may need to be changed to the local network IP.
        this.uploadUrl = 'http://localhost:3001/upload-sensor-data';
    }

    startAutoUpload() {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.uploadData();
        }, this.uploadInterval);
    }

    stopAutoUpload() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    setUploadUrl(url) {
        this.uploadUrl = url;
    }

    formatData(dataPoint) {
        return {
            timestamp: dataPoint.timestamp || new Date().toISOString(),
            gps_latitude: dataPoint.gps?.latitude ?? null,
            gps_longitude: dataPoint.gps?.longitude ?? null,
            accelerometer_x: dataPoint.accelerometer?.x ?? null,
            accelerometer_y: dataPoint.accelerometer?.y ?? null,
            accelerometer_z: dataPoint.accelerometer?.z ?? null,
            gyroscope_x: dataPoint.gyroscope?.x ?? null,
            gyroscope_y: dataPoint.gyroscope?.y ?? null,
            gyroscope_z: dataPoint.gyroscope?.z ?? null,
            barometer: dataPoint.barometer?.pressure ?? null,
            magnetometer_x: dataPoint.magnetometer?.x ?? null,
            magnetometer_y: dataPoint.magnetometer?.y ?? null,
            magnetometer_z: dataPoint.magnetometer?.z ?? null,
        };
    }

    addData(dataPoint) {
        this.dataBatch.push(this.formatData(dataPoint));
    }

    async uploadData(deviceId = 'device-1') {
        if (this.dataBatch.length === 0) return;

        const payload = {
            deviceId,
            data: [...this.dataBatch]
        };

        // Clear batch locally after taking a copy
        this.dataBatch = [];

        try {
            const response = await fetch(this.uploadUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error('SensorUpload: Failed to upload sensor data. Status:', response.status);
            } else {
                console.log(`SensorUpload: Successfully uploaded ${payload.data.length} records`);
            }
        } catch (error) {
            console.error('SensorUpload: Error uploading sensor data:', error);
        }
    }
}

export default new SensorUpload();
