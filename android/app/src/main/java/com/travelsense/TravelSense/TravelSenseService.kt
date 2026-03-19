package com.travelsense.TravelSense

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.HandlerThread
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.location.*
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.*
import org.json.JSONArray
import org.json.JSONObject

class TravelSenseService : Service(), SensorEventListener {
    private val CHANNEL_ID = "TravelSenseChannel"
    private var isPaused = false
    private var elapsedTime = 0
    private var wakeLock: PowerManager.WakeLock? = null
    
    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var gyroscope: Sensor? = null
    private var magnetometer: Sensor? = null
    private var barometer: Sensor? = null

    // Latest readings to emit to JS
    private val lastAccel = floatArrayOf(0f, 0f, 0f)
    private val lastGyro = floatArrayOf(0f, 0f, 0f)
    private val lastMag = floatArrayOf(0f, 0f, 0f)
    private var lastBaro = 1013.25f
    
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var lastLat = 0.0
    private var lastLng = 0.0
    private var lastSpeed = 0.0
    
    // Low Pass Filter for gravity alignment (similar to JS)
    private var gravityX = 0f
    private var gravityY = 0f
    private var gravityZ = 0f
    private val alpha = 0.1f

    private val dataBuffer = JSONArray()
    private val DATA_FILE_NAME = "ArchivedData/sensor_data.json"
    private var lastWriteTime = 0L

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let {
                lastLat = it.latitude
                lastLng = it.longitude
                lastSpeed = it.speed * 3.6 // m/s to km/h
                recordPointToBuffer() // Record on location change
            }
        }
    }
    private lateinit var serviceHandler: Handler
    private lateinit var serviceThread: HandlerThread

    private val ticker = object : Runnable {
        override fun run() {
            if (!isPaused) {
                elapsedTime++
                sendEventToJS("onServiceTick", elapsedTime)
                updateNotification()
                recordPointToBuffer() // 1Hz guaranteed record
                
                // Periodically flush to disk (every 5 seconds)
                if (System.currentTimeMillis() - lastWriteTime > 5000) {
                    flushBufferToDisk()
                }
            }
            serviceHandler.postDelayed(this, 1000)
        }
    }

    private fun recordPointToBuffer() {
        try {
            // Apply Low Pass Filter for linear acceleration
            gravityX = alpha * lastAccel[0] + (1 - alpha) * gravityX
            gravityY = alpha * lastAccel[1] + (1 - alpha) * gravityY
            gravityZ = alpha * lastAccel[2] + (1 - alpha) * gravityZ

            val point = JSONObject().apply {
                put("timestamp", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date()))
                put("gps_latitude", if (lastLat != 0.0) lastLat else null)
                put("gps_longitude", if (lastLng != 0.0) lastLng else null)
                put("accelerometer_x", lastAccel[0] - gravityX)
                put("accelerometer_y", lastAccel[1] - gravityY)
                put("accelerometer_z", lastAccel[2] - gravityZ)
                put("gyroscope_x", lastGyro[0])
                put("gyroscope_y", lastGyro[1])
                put("gyroscope_z", lastGyro[2])
                put("barometer", if (lastBaro != 0f) lastBaro else null)
                put("magnetometer_x", lastMag[0])
                put("magnetometer_y", lastMag[1])
                put("magnetometer_z", lastMag[2])
            }
            dataBuffer.put(point)
        } catch (e: Exception) {
            Log.e("TravelSenseService", "Error recording point: ${e.message}")
        }
    }

    private fun flushBufferToDisk() {
        if (dataBuffer.length() == 0) return
        
        synchronized(dataBuffer) {
            try {
                val fileDir = File(filesDir, "ArchivedData")
                if (!fileDir.exists()) fileDir.mkdirs()
                
                val dataFile = File(fileDir, "sensor_data.json")
                
                // Read existing data robustly
                val existingData = try {
                    if (dataFile.exists()) {
                        val text = dataFile.readText().trim()
                        if (text.isNotEmpty() && text.startsWith("[")) {
                            JSONArray(text)
                        } else {
                            JSONArray()
                        }
                    } else {
                        JSONArray()
                    }
                } catch (e: Exception) {
                    Log.e("TravelSenseService", "Corruption in data file, resetting: ${e.message}")
                    JSONArray()
                }
                
                // Append new points from current buffer
                for (i in 0 until dataBuffer.length()) {
                    existingData.put(dataBuffer.get(i))
                }
                
                // Check if we reached the 5-minute / 3000 record threshold for archiving
                if (existingData.length() >= 3000) {
                    try {
                        // Get first timestamp for filename
                        val firstPoint = existingData.getJSONObject(0)
                        val utcTimeStr = firstPoint.getString("timestamp") 
                        
                        // Parse UTC string and convert to local timezone
                        val sdfUtc = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
                        val localTime = sdfUtc.parse(utcTimeStr)
                        
                        // Format for filename (Local Timezone, e.g. 20260318_231945)
                        val sdfFile = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault())
                        val safeStamp = localTime?.let { sdfFile.format(it) } ?: "unknown_time"
                        
                        // Get unique device ID (ANDROID_ID)
                        val deviceId = android.provider.Settings.Secure.getString(contentResolver, android.provider.Settings.Secure.ANDROID_ID) ?: "unknown"
                        
                        val archiveFile = File(fileDir, "sensor_data_${deviceId}_$safeStamp.json")
                        archiveFile.writeText(existingData.toString(2))
                        Log.d("TravelSenseService", "Archived 3000+ points to ${archiveFile.name}")
                        
                        // Clear the main file to start a fresh batch
                        if (dataFile.exists()) dataFile.delete()
                    } catch (e: Exception) {
                        Log.e("TravelSenseService", "Archival failed: ${e.message}")
                        // Fallback: write it back to main file to avoid data loss
                        dataFile.writeText(existingData.toString(2))
                    }
                } else {
                    // Just write back to main file
                    dataFile.writeText(existingData.toString(2))
                }
                
                // Clear current in-memory buffer
                while (dataBuffer.length() > 0) dataBuffer.remove(0)
                lastWriteTime = System.currentTimeMillis()
                Log.d("TravelSenseService", "Sync complete. Current file points: ${existingData.length()}")
                
            } catch (e: Exception) {
                Log.e("TravelSenseService", "Critical error in flushBuffer: ${e.message}")
            }
        }
    }
 
    private val sensorEmitter = object : Runnable {
        override fun run() {
            if (!isPaused) {
                emitSensorData()
            }
            serviceHandler.postDelayed(this, 100) // 10Hz keep-alive and data sync
        }
    }

    override fun onBind(p0: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TravelSense:RecordingLock")
        wakeLock?.acquire()
        
        serviceThread = HandlerThread("TravelSenseBackground").apply { start() }
        serviceHandler = Handler(serviceThread.looper)
        
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
        magnetometer = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
        barometer = sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE)
        
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        try {
            fusedLocationClient.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) {
                    lastLat = loc.latitude
                    lastLng = loc.longitude
                    lastSpeed = loc.speed * 3.6
                    Log.d("TravelSenseService", "Last known location: $lastLat, $lastLng")
                }
            }
        } catch (e: SecurityException) {
            Log.e("TravelSenseService", "Permission missing for last known location")
        }
        startLocationUpdates()
        
        registerSensors()
        serviceHandler.post(ticker)
        serviceHandler.post(sensorEmitter)
    }

    private fun startLocationUpdates() {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000)
            .setMinUpdateIntervalMillis(1000)
            .setMaxUpdateDelayMillis(0) // Ensure no delay
            .build()
        try {
            fusedLocationClient.requestLocationUpdates(request, locationCallback, serviceThread.looper)
        } catch (e: SecurityException) {
            Log.e("TravelSenseService", "Location permission missing for native updates: ${e.message}")
        }
    }

    private fun registerSensors() {
        accelerometer?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST, serviceHandler) }
        gyroscope?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST, serviceHandler) }
        magnetometer?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL, serviceHandler) }
        barometer?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL, serviceHandler) }
    }

    private fun unregisterSensors() {
        sensorManager.unregisterListener(this)
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceHandler.removeCallbacks(ticker)
        serviceHandler.removeCallbacks(sensorEmitter)
        unregisterSensors()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        flushBufferToDisk()
        if (wakeLock?.isHeld == true) wakeLock?.release()
        serviceThread.quitSafely()
    }

    private var lastAccelRecordTime = 0L

    override fun onSensorChanged(event: SensorEvent?) {
        if (isPaused || event == null) return
        
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                lastAccel[0] = event.values[0]
                lastAccel[1] = event.values[1]
                lastAccel[2] = event.values[2]
                
                // Record vibrations at high resolution (up to 50Hz)
                val now = System.currentTimeMillis()
                if (now - lastAccelRecordTime > 20) {
                    recordPointToBuffer()
                    lastAccelRecordTime = now
                }
            }
            Sensor.TYPE_GYROSCOPE -> {
                lastGyro[0] = event.values[0]
                lastGyro[1] = event.values[1]
                lastGyro[2] = event.values[2]
            }
            Sensor.TYPE_MAGNETIC_FIELD -> {
                lastMag[0] = event.values[0]
                lastMag[1] = event.values[1]
                lastMag[2] = event.values[2]
            }
            Sensor.TYPE_PRESSURE -> {
                lastBaro = event.values[0]
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        Log.d("TravelSenseService", "Action: $action")
        when (action) {
            "START" -> {
                elapsedTime = intent.getIntExtra("startTime", 0)
                isPaused = intent.getBooleanExtra("isPaused", false)
                Log.d("TravelSenseService", "Starting with time $elapsedTime, paused=$isPaused")
                
                val notification = buildNotification()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
                    }
                    startForeground(1, notification, type)
                } else {
                    startForeground(1, notification)
                }
            }
            "UPDATE" -> {
                elapsedTime = intent.getIntExtra("time", elapsedTime)
                isPaused = intent.getBooleanExtra("isPaused", isPaused)
                updateNotification()
            }
            "PAUSE_RESUME" -> {
                isPaused = !isPaused
                sendEventToJS("onNotificationPause", isPaused)
                updateNotification()
            }
            "EXIT" -> {
                sendEventToJS("onNotificationExit", null)
                // App will handle data saving and then call stopRecordingService or exit
            }
            "STOP" -> {
                stopForeground(true)
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun buildNotification(): Notification {
        val pauseResumeText = if (isPaused) "Resume" else "Pause"
        val statusText = if (isPaused) "Paused" else "Recording"
        val timeText = formatTime(elapsedTime)

        val pauseIntent = Intent(this, NotificationActionReceiver::class.java).apply { action = "PAUSE_RESUME" }
        val exitIntent = Intent(this, NotificationActionReceiver::class.java).apply { action = "EXIT" }

        val pausePendingIntent = PendingIntent.getBroadcast(this, 0, pauseIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val exitPendingIntent = PendingIntent.getBroadcast(this, 1, exitIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val mainActivityIntent = packageManager.getLaunchIntentForPackage(packageName)
        val mainPendingIntent = PendingIntent.getActivity(this, 2, mainActivityIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("TravelSense - $statusText")
            .setContentText("Time: $timeText")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(mainPendingIntent)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, pauseResumeText, pausePendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Exit", exitPendingIntent)
            .build()
    }

    private fun formatTime(seconds: Int): String {
        val hrs = seconds / 3600
        val mins = (seconds % 3600) / 60
        val secs = seconds % 60
        return "%02d:%02d:%02d".format(hrs, mins, secs)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "TravelSense Foreground Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }

    private fun updateNotification() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(1, buildNotification())
    }

    private fun emitSensorData() {
        val application = application as? ReactApplication
        val reactContext = application?.reactNativeHost?.reactInstanceManager?.currentReactContext
        
        if (reactContext != null) {
            val accel = Arguments.createMap().apply {
                putDouble("x", lastAccel[0].toDouble())
                putDouble("y", lastAccel[1].toDouble())
                putDouble("z", lastAccel[2].toDouble())
            }
            val gyro = Arguments.createMap().apply {
                putDouble("x", lastGyro[0].toDouble())
                putDouble("y", lastGyro[1].toDouble())
                putDouble("z", lastGyro[2].toDouble())
            }
            val mag = Arguments.createMap().apply {
                putDouble("x", lastMag[0].toDouble())
                putDouble("y", lastMag[1].toDouble())
                putDouble("z", lastMag[2].toDouble())
            }
            
            val sensors = Arguments.createMap()
            sensors.putMap("accelerometer", accel)
            sensors.putMap("gyroscope", gyro)
            sensors.putMap("magnetometer", mag)
            sensors.putDouble("barometer", lastBaro.toDouble())
            
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onSensorData", sensors)
        }
    }

    private fun sendEventToJS(eventName: String, params: Any?) {
        val application = application as? ReactApplication
        val reactNativeHost = application?.reactNativeHost
        val reactContext = reactNativeHost?.reactInstanceManager?.currentReactContext
        
        if (reactContext != null) {
            val eventParams = Arguments.createMap()
            when (params) {
                is Boolean -> eventParams.putBoolean("value", params)
                is Int -> eventParams.putInt("value", params)
                is Double -> eventParams.putDouble("value", params)
                is String -> eventParams.putString("value", params)
            }
            Log.d("TravelSenseService", "Emitting event $eventName to JS with params: $params")
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, eventParams)
        } else {
            Log.d("TravelSenseService", "Skipping event $eventName: ReactContext is null")
        }
    }
}
