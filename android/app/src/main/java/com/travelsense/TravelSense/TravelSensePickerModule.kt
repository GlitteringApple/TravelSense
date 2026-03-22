package com.travelsense.TravelSense

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import com.facebook.react.bridge.*

class TravelSensePickerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TravelSensePicker"

    @ReactMethod
    fun openFileManager(promise: Promise) {
        val currentActivity = getCurrentActivity() ?: run {
            promise.reject("ACTIVITY_NOT_FOUND", "Current activity not found")
            return
        }

        val rootUri = Uri.parse("content://com.travelsense.TravelSense.documents/root/travelsense_root")
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(rootUri, "vnd.android.document/root")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        try {
            currentActivity.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("OPEN_ERROR", "Failed to open file manager: ${e.message}")
        }
    }
}
