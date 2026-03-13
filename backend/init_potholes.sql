-- 1. Create the potholes table
CREATE TABLE IF NOT EXISTS potholes (
    id SERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    gps_latitude DOUBLE PRECISION,
    gps_longitude DOUBLE PRECISION,
    severity DOUBLE PRECISION, -- The detected g-force or magnitude of the jerk
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create an index for faster spatial mapping/time queries
CREATE INDEX IF NOT EXISTS idx_potholes_location ON potholes (gps_latitude, gps_longitude);
CREATE INDEX IF NOT EXISTS idx_potholes_time ON potholes (timestamp DESC);
