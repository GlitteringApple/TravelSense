class SensorUpload {
    constructor() {
        this.dataBatch = [];
        this.uploadInterval = 10 * 60 * 1000; // 10 minutes
        this.maxBatchDuration = 5 * 60 * 1000; // Keep only last 5 minutes of data
        this.timer = null;
        // Default URL to localhost. Depending on the environment, 
        // it may need to be changed to the local network IP.
        this.uploadUrl = 'http://192.168.1.4:3001/upload-sensor-data';
    }

    startAutoUpload() {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.uploadData();
        }, this.uploadInterval); 1
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

    async testConnection() {
        const testUrl = this.uploadUrl.replace('/upload-sensor-data', '/test-db');
        try {
            const response = await fetch(testUrl);
            const contentType = response.headers.get('content-type');

            if (contentType && contentType.indexOf('application/json') !== -1) {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Server error');
                return data;
            } else {
                const text = await response.text();
                throw new Error(`Server returned non-JSON format. Is it running the latest code? Status: ${response.status}`);
            }
        } catch (error) {
            console.error('SensorUpload: Test connection failed:', error.message);
            throw error;
        }
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

    clearBatch() {
        this.dataBatch = [];
    }

    addData(dataPoint) {
        this.dataBatch.push(this.formatData(dataPoint));

        // Discard data older than 5 minutes
        const cutoffTime = new Date(Date.now() - this.maxBatchDuration).getTime();
        this.dataBatch = this.dataBatch.filter(row => new Date(row.timestamp).getTime() > cutoffTime);
    }

    async fetchPotholes() {
        const potholeUrl = this.uploadUrl.replace('/upload-sensor-data', '/potholes');
        try {
            const response = await fetch(potholeUrl);
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.indexOf('application/json') !== -1) {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Server error');
                return data;
            } else {
                throw new Error('Server returned non-JSON format.');
            }
        } catch (error) {
            console.error('SensorUpload: Fetch potholes failed:', error.message);
            throw error;
        }
    }

    async triggerProcessing(sensitivity = 0.5) {
        const processUrl = this.uploadUrl.replace('/upload-sensor-data', '/process-data');
        try {
            const response = await fetch(processUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sensitivity })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Processing failed');
            return data;
        } catch (error) {
            console.error('SensorUpload: Trigger processing failed:', error.message);
            throw error;
        }
    }

    async uploadData(deviceId = 'device-1') {
        if (this.dataBatch.length === 0) return;

        const payload = {
            deviceId,
            data: [...this.dataBatch]
        };

        try {
            const response = await fetch(this.uploadUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                let errorMessage = `Server returned ${response.status}`;

                if (contentType && contentType.indexOf('application/json') !== -1) {
                    const errorData = await response.json().catch(() => ({}));
                    errorMessage = errorData.error || errorMessage;
                } else {
                    errorMessage = `Server returned non-JSON format. Is it running the latest code? Status: ${response.status}`;
                }
                throw new Error(errorMessage);
            }

            console.log(`SensorUpload: Successfully uploaded ${payload.data.length} records`);
            this.clearBatch(); // Only clear if server confirmed receipt
            return true;
        } catch (error) {
            console.error('SensorUpload: Error uploading sensor data:', error.message);
            throw error; // Rethrow so the UI can catch it
        }
    }
}

export default new SensorUpload();
