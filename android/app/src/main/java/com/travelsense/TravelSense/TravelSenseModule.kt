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

import com.facebook.react.modules.core.PermissionListener

class TravelSenseModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), PermissionListener {
    private var activityPromise: Promise? = null

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
                if (activity is com.facebook.react.modules.core.PermissionAwareActivity) {
                    activityPromise = promise
                    activity.requestPermissions(arrayOf(permission), 100, this)
                } else {
                    val currentActivity = getCurrentActivity()
                    if (currentActivity != null) {
                        try {
                            activityPromise = promise
                            ActivityCompat.requestPermissions(currentActivity, arrayOf(permission), 100)
                            // Safety fallback if no result comes back after 30 seconds
                            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                                if (activityPromise != null) {
                                    val newStatus = ContextCompat.checkSelfPermission(reactApplicationContext, permission)
                                    activityPromise?.resolve(if (newStatus == PackageManager.PERMISSION_GRANTED) "granted" else "denied")
                                    activityPromise = null
                                }
                            }, 30000)
                        } catch (e: Exception) {
                            promise.reject("ERROR", "Failed to show request: ${e.message}")
                        }
                    } else {
                        promise.reject("ERROR", "No current activity")
                    }
                }
            } else {
                promise.resolve("granted")
            }
        } else {
            promise.resolve("not_required")
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray): Boolean {
        if (requestCode == 100) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                activityPromise?.resolve("granted")
            } else {
                activityPromise?.resolve("denied")
            }
            activityPromise = null
            return true
        }
        return false
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
    fun openAppSettings() {
        try {
            // Attempt to go directly to Permissions screen (if supported)
            val intent = Intent("android.intent.action.MANAGE_APP_PERMISSIONS")
            intent.putExtra("android.intent.extra.PACKAGE_NAME", reactApplicationContext.packageName)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
        } catch (e: Exception) {
            // Fallback to general App Info screen
            val intent = Intent().apply {
                action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                data = Uri.fromParts("package", reactApplicationContext.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
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
