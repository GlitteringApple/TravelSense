package com.travelsense.TravelSense

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import com.facebook.react.bridge.*

class TravelSensePickerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var pickerPromise: Promise? = null

    private val receiver = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode == PICK_FILE_REQUEST_CODE) {
                if (resultCode == Activity.RESULT_OK) {
                    data?.data?.let { uri ->
                        pickerPromise?.resolve(uri.toString())
                    } ?: pickerPromise?.reject("PICKER_ERROR", "No data returned")
                } else {
                    pickerPromise?.reject("PICKER_CANCELLED", "User cancelled the picker")
                }
                pickerPromise = null
            }
        }
    }

    init {
        reactContext.addActivityEventListener(receiver)
    }

    override fun getName(): String = "TravelSensePicker"

    @ReactMethod
    fun openPickerAtRoot(promise: Promise) {
        val currentActivity = getCurrentActivity() ?: run {
            promise.reject("ACTIVITY_NOT_FOUND", "Current activity not found")
            return
        }

        if (pickerPromise != null) {
            promise.reject("PICKER_ALREADY_OPEN", "Another picker is already open")
            return
        }

        pickerPromise = promise

        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            val rootUri = Uri.parse("content://com.travelsense.TravelSense.documents/document/travelsense_root_doc")
            putExtra(DocumentsContract.EXTRA_INITIAL_URI, rootUri)
        }

        currentActivity.startActivityForResult(intent, PICK_FILE_REQUEST_CODE)
    }

    companion object {
        private const val PICK_FILE_REQUEST_CODE = 4242
    }
}
