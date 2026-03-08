package com.mani_maddy.candle

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.ContentValues
import android.content.Intent
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.mani_maddy.candle.widget.SharedNoteWidget
import com.reactnativecommunity.asyncstorage.ReactDatabaseSupplier
import org.json.JSONObject

class WidgetMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    if (data.isNullOrEmpty()) {
      Log.d(TAG, "FCM message received with no data payload")
      return
    }

    val roomId = data["roomId"].orEmpty()
    if (roomId.isBlank()) {
      Log.d(TAG, "FCM data missing roomId; skip")
      return
    }
    Log.d(TAG, "FCM data received for roomId=$roomId")

    val noteJson = JSONObject().apply {
      put("roomId", roomId)
      put("roomCode", data["roomCode"].orEmpty())
      put("text", data["text"].orEmpty())
      put("done", toBoolean(data["done"]))
      put("updatedBy", data["updatedBy"] ?: "push")
      put("updatedAt", data["updatedAt"] ?: System.currentTimeMillis().toString())
    }.toString()

    saveWidgetState(noteJson)
    requestWidgetRefresh()
  }

  private fun toBoolean(value: String?): Boolean {
    return value == "1" || value.equals("true", ignoreCase = true)
  }

  private fun saveWidgetState(noteJson: String) {
    val db = ReactDatabaseSupplier.getInstance(applicationContext).get()
    val values = ContentValues().apply {
      put("key", STORAGE_KEY)
      put("value", noteJson)
    }
    db.insertWithOnConflict(
      TABLE_CATALYST,
      null,
      values,
      android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE,
    )
  }

  private fun requestWidgetRefresh() {
    val appWidgetManager = AppWidgetManager.getInstance(this)
    val component = ComponentName(this, SharedNoteWidget::class.java)
    val widgetIds = appWidgetManager.getAppWidgetIds(component)
    if (widgetIds.isEmpty()) {
      return
    }
    val updateIntent = Intent(this, SharedNoteWidget::class.java).apply {
      action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds)
    }
    sendBroadcast(updateIntent)
  }

  companion object {
    private const val TABLE_CATALYST = "catalystLocalStorage"
    private const val STORAGE_KEY = "shared_note_widget_state"
    private const val TAG = "WidgetMessagingSvc"
  }
}
