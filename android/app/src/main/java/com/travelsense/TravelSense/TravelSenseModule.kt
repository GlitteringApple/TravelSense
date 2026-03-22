package com.travelsense.TravelSense

import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.net.Uri
import android.os.PowerManager
import android.content.Context
import android.Manifest
import androidx.core.content.ContextCompat
import androidx.core.app.ActivityCompat
import android.content.pm.PackageManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

class TravelSenseModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        Companion.reactContext = reactContext
    }

    companion object {
        var reactContext: ReactApplicationContext? = null
            private set
    }

    override fun getName(): String = "TravelSenseModule"

    @ReactMethod
    fun startRecordingService(startTime: Int, isPaused: Boolean, batteryThreshold: Int) {
        val intent = Intent(reactApplicationContext, TravelSenseService::class.java).apply {
            action = "START"
            putExtra("startTime", startTime)
            putExtra("isPaused", isPaused)
            putExtra("batteryThreshold", batteryThreshold)
        }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun updateServiceState(time: Int, isPaused: Boolean, batteryThreshold: Int) {
        val intent = Intent(reactApplicationContext, TravelSenseService::class.java).apply {
            action = "UPDATE"
            putExtra("time", time)
            putExtra("isPaused", isPaused)
            putExtra("batteryThreshold", batteryThreshold)
        }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun stopRecordingService() {
        val intent = Intent(reactApplicationContext, TravelSenseService::class.java).apply {
            action = "STOP"
        }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent().apply {
                action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                data = Uri.parse("package:${reactApplicationContext.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
        }
    }

    @ReactMethod
    fun isBatteryOptimizationIgnored(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            promise.resolve(powerManager.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestActivityRecognitionPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val permission = Manifest.permission.ACTIVITY_RECOGNITION
            val status = ContextCompat.checkSelfPermission(reactApplicationContext, permission)
            if (status != PackageManager.PERMISSION_GRANTED) {
            val activity = getCurrentActivity()
            if (activity != null) {
                ActivityCompat.requestPermissions(activity, arrayOf(permission), 100)
                promise.resolve("requested")
            } else {
                promise.reject("ERROR", "No current activity")
            }
            } else {
                promise.resolve("granted")
            }
        } else {
            promise.resolve("not_required")
        }
    }

    @ReactMethod
    fun exitApp() {
        stopRecordingService()
        // Wait 500ms for service to stop and flush buffer to disk
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            android.os.Process.killProcess(android.os.Process.myPid())
            // Also call exit for complete termination
            System.exit(0)
        }, 500)
    }

    @ReactMethod
    fun getInMemoryBuffer(promise: Promise) {
        val service = TravelSenseService.instance
        if (service != null) {
            promise.resolve(service.getBufferJson())
        } else {
            promise.resolve("[]")
        }
    }

    @ReactMethod
    fun getServiceState(promise: Promise) {
        val service = TravelSenseService.instance
        if (service != null) {
            val map = Arguments.createMap().apply {
                putInt("elapsedTime", service.getElapsedTime())
                putBoolean("isPaused", service.getIsPaused())
                putBoolean("isBatteryPaused", service.getIsBatteryPaused())
            }
            promise.resolve(map)
        } else {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun openNotificationSettings() {
        val intent = Intent().apply {
            action = "android.settings.APP_NOTIFICATION_SETTINGS"
            putExtra("android.provider.extra.APP_PACKAGE", reactApplicationContext.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactApplicationContext.startActivity(intent)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep for NativeEventEmitter compatibility
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep for NativeEventEmitter compatibility
    }
}
