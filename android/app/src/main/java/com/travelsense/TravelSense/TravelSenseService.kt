package com.travelsense.TravelSense

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.BatteryManager
import android.content.IntentFilter
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
    private var batteryThreshold = 0
    private var autoPausedDueToBattery = false
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
    private val GRAVITY_SEC = 9.80665f

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

    private var startTimeMillis = 0L

    private fun checkBatteryAndAutoPause() {
        if (batteryThreshold <= 0) return
        
        val intentFilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus = registerReceiver(null, intentFilter)
        
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        
        if (level != -1 && scale != -1) {
            val batteryPct = (level * 100) / scale
            if (batteryPct < batteryThreshold) {
                if (!isPaused && !autoPausedDueToBattery) {
                    isPaused = true
                    autoPausedDueToBattery = true
                    Log.d("TravelSenseService", "Auto-pausing due to low battery: $batteryPct%")
                    sendEventToJS("onBatteryAutoPause", batteryPct)
                    updateNotification()
                }
            } else {
                autoPausedDueToBattery = false
            }
        }
    }

    private val ticker = object : Runnable {
        override fun run() {
            checkBatteryAndAutoPause()
            if (!isPaused) {
                // Authoritative time calculation against real system time
                val currentRealTime = System.currentTimeMillis()
                elapsedTime = ((currentRealTime - startTimeMillis) / 1000).toInt()
                
                sendEventToJS("onServiceTick", elapsedTime)
                updateNotification()
                recordPointToBuffer() // authoratative 1Hz record
                
                // Periodically flush to disk (every 5 seconds)
                if (currentRealTime - lastWriteTime > 5000) {
                    flushBufferToDisk()
                }
            } else {
                startTimeMillis = System.currentTimeMillis() - (elapsedTime * 1000L)
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
                put("accelerometer_x", (lastAccel[0] - gravityX) / GRAVITY_SEC)
                put("accelerometer_y", (lastAccel[1] - gravityY) / GRAVITY_SEC)
                put("accelerometer_z", (lastAccel[2] - gravityZ) / GRAVITY_SEC)
                put("gyroscope_x", lastGyro[0])
                put("gyroscope_y", lastGyro[1])
                put("gyroscope_z", lastGyro[2])
                put("barometer", if (lastBaro != 0f) lastBaro else null)
                put("magnetometer_x", lastMag[0])
                put("magnetometer_y", lastMag[1])
                put("magnetometer_z", lastMag[2])
            }
            synchronized(dataBuffer) {
                dataBuffer.put(point)
            }
        } catch (e: Exception) {
            Log.e("TravelSenseService", "Error recording point: ${e.message}")
        }
    }

    companion object {
        var instance: TravelSenseService? = null
            private set
    }

    private fun flushBufferToDisk(force: Boolean = false) {
        if (dataBuffer.length() == 0) return
        
        synchronized(dataBuffer) {
            try {
                val now = System.currentTimeMillis()
                val fiveMinuteWindow = now - (now % (5 * 60 * 1000))
                val firstPoint = dataBuffer.getJSONObject(0)
                val tsString = firstPoint.getString("timestamp")
                val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { 
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                val firstDate = isoFormat.parse(tsString) ?: Date()
                val sdf = SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.getDefault())
                val timestampStr = sdf.format(firstDate)
                
                // If it's not time to rotate and not forced, just keep in memory
                if (!force && lastWriteTime != 0L) {
                    val lastWindow = lastWriteTime - (lastWriteTime % (5 * 60 * 1000))
                    if (fiveMinuteWindow == lastWindow) {
                        return
                    }
                }

                val fileDir = File(filesDir, "ArchivedData")
                if (!fileDir.exists()) fileDir.mkdirs()
                
                // Get Device ID
                val deviceId = android.provider.Settings.Secure.getString(contentResolver, android.provider.Settings.Secure.ANDROID_ID) ?: "unknown_device"
                
                val fileName = "${timestampStr}_${deviceId}_sensor_data.json"
                val dataFile = File(fileDir, fileName)
                
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
                
                val pointsAdded = dataBuffer.length()
                // Append new points from current buffer
                for (i in 0 until pointsAdded) {
                    existingData.put(dataBuffer.get(i))
                }
                
                // Write back to disk
                dataFile.writeText(existingData.toString(2))
                
                // Clear current buffer
                while (dataBuffer.length() > 0) dataBuffer.remove(0)
                lastWriteTime = System.currentTimeMillis()
                Log.d("TravelSenseService", "Flushed $pointsAdded records to $fileName (Total: ${existingData.length()})")
                
            } catch (e: Exception) {
                Log.e("TravelSenseService", "Critical error in flushBuffer: ${e.message}")
            }
        }
    }

    fun getBufferJson(): String {
        synchronized(dataBuffer) {
            return dataBuffer.toString()
        }
    }

    fun getIsPaused(): Boolean = isPaused
    fun getIsBatteryPaused(): Boolean = autoPausedDueToBattery
 
    private val sensorEmitter = object : Runnable {
        override fun run() {
            if (!isPaused) {
                emitSensorData()
            }
            serviceHandler.postDelayed(this, 100)
        }
    }

    override fun onBind(p0: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        startTimeMillis = System.currentTimeMillis()
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
        serviceHandler.removeCallbacks(sensorEmitter)
        unregisterSensors()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        flushBufferToDisk(force = true)
        if (wakeLock?.isHeld == true) wakeLock?.release()
        serviceThread.quitSafely()
        instance = null
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
                batteryThreshold = intent.getIntExtra("batteryThreshold", 0)
                startTimeMillis = System.currentTimeMillis() - (elapsedTime * 1000L)
                Log.d("TravelSenseService", "Starting with time $elapsedTime, paused=$isPaused, threshold=$batteryThreshold")
                
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
                val newTime = intent.getIntExtra("time", -1)
                if (newTime >= 0) {
                    elapsedTime = newTime
                    startTimeMillis = System.currentTimeMillis() - (elapsedTime * 1000L)
                }
                isPaused = intent.getBooleanExtra("isPaused", isPaused)
                batteryThreshold = intent.getIntExtra("batteryThreshold", batteryThreshold)
                updateNotification()
            }
            "PAUSE_RESUME" -> {
                Log.d("TravelSenseService", "Notification Pause pressed. Signaling JS...")
                sendEventToJS("onNotificationPauseToggle", null)
            }
            "EXIT" -> {
                // First bring the app to the foreground
                val mainActivityIntent = packageManager.getLaunchIntentForPackage(packageName)
                mainActivityIntent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(mainActivityIntent)
                
                // Then signal JS to show the exit modal
                sendEventToJS("onNotificationExit", null)
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
        val statusText = if (isPaused) "⏸️ Paused" else "🔴 Recording"
        val timeText = formatTime(elapsedTime)

        val pauseIntent = Intent(this, NotificationActionReceiver::class.java).apply { action = "PAUSE_RESUME" }
        val pausePendingIntent = PendingIntent.getBroadcast(this, 0, pauseIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        
        val exitActivityIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            action = "EXIT_APP"
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val exitPendingIntent = PendingIntent.getActivity(this, 3, exitActivityIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val mainActivityIntent = packageManager.getLaunchIntentForPackage(packageName)
        val mainPendingIntent = PendingIntent.getActivity(this, 2, mainActivityIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("$statusText")
            .setContentText("$timeText")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(mainPendingIntent)
            .setOngoing(true)
            .setAutoCancel(false)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .addAction(android.R.drawable.ic_media_pause, pauseResumeText, pausePendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Exit", exitPendingIntent)
            .build()
            
        notification.flags = notification.flags or Notification.FLAG_ONGOING_EVENT or Notification.FLAG_NO_CLEAR
        return notification
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
                NotificationManager.IMPORTANCE_DEFAULT
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
                putDouble("x", (lastAccel[0] / GRAVITY_SEC).toDouble())
                putDouble("y", (lastAccel[1] / GRAVITY_SEC).toDouble())
                putDouble("z", (lastAccel[2] / GRAVITY_SEC).toDouble())
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

    fun sendEventToJS(eventName: String, params: Any?) {
        val reactContext = TravelSenseModule.reactContext
        
        if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
            val eventParams = Arguments.createMap()
            when (params) {
                is Boolean -> eventParams.putBoolean("value", params)
                is Int -> eventParams.putInt("value", params)
                is Double -> eventParams.putDouble("value", params)
                is String -> eventParams.putString("value", params)
            }
            
            try {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(eventName, eventParams)
            } catch (e: Exception) {
                Log.e("TravelSenseService", "Failed to emit event $eventName: ${e.message}")
            }
        }
    }

    fun getElapsedTime(): Int = elapsedTime
}
