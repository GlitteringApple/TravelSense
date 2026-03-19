package com.travelsense.TravelSense

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        val action = intent?.action
        Log.d("TravelSenseReceiver", "Received action: $action")
        
        when (action) {
            "PAUSE_RESUME" -> {
                val serviceIntent = Intent(context, TravelSenseService::class.java).apply {
                    this.action = "PAUSE_RESUME"
                }
                context?.startService(serviceIntent)
            }
            "EXIT" -> {
                val serviceIntent = Intent(context, TravelSenseService::class.java).apply {
                    this.action = "EXIT"
                }
                context?.startService(serviceIntent)
            }
        }
    }
}
