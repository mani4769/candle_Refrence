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
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

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

    val drawingData = data["drawingData"].orEmpty()
    
    // Always fetch fresh data from Appwrite for reliability
    Log.d(TAG, "Fetching fresh data from Appwrite...")
    fetchAndUpdateFromAppwrite(roomId, data)
  }

  private fun fetchAndUpdateFromAppwrite(roomId: String, fallbackData: Map<String, String>) {
    thread {
      try {
        val endpoint = "https://cloud.appwrite.io/v1"
        val projectId = BuildConfig.APPWRITE_PROJECT_ID
        val databaseId = BuildConfig.APPWRITE_DATABASE_ID
        val collectionId = "shared_notes"
        val apiKey = BuildConfig.APPWRITE_API_KEY
        
        val url = URL("$endpoint/databases/$databaseId/collections/$collectionId/documents/$roomId")
        val connection = url.openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.setRequestProperty("X-Appwrite-Project", projectId)
        connection.setRequestProperty("X-Appwrite-Key", apiKey)
        connection.setRequestProperty("Content-Type", "application/json")
        connection.connectTimeout = 10000
        connection.readTimeout = 10000

        val responseCode = connection.responseCode
        if (responseCode == HttpURLConnection.HTTP_OK) {
          val response = connection.inputStream.bufferedReader().readText()
          val doc = JSONObject(response)
          
          val noteJson = JSONObject().apply {
            put("roomId", roomId)
            put("roomCode", doc.optString("roomCode", ""))
            put("drawingData", doc.optString("drawingData", ""))
            put("done", doc.optBoolean("done", false))
            put("updatedBy", doc.optString("updatedBy", "push"))
            put("updatedAt", doc.optString("updatedAt", System.currentTimeMillis().toString()))
          }.toString()

          Log.d(TAG, "Fetched from Appwrite, drawingData length: ${doc.optString("drawingData", "").length}")
          saveWidgetState(noteJson)
          requestWidgetRefresh()
        } else {
          Log.e(TAG, "Appwrite fetch failed: $responseCode")
          // Fall back to FCM data without drawing
          useFallbackData(roomId, fallbackData)
        }
        connection.disconnect()
      } catch (e: Exception) {
        Log.e(TAG, "Failed to fetch from Appwrite: ${e.message}")
        useFallbackData(roomId, fallbackData)
      }
    }
  }

  private fun useFallbackData(roomId: String, data: Map<String, String>) {
    val noteJson = JSONObject().apply {
      put("roomId", roomId)
      put("roomCode", data["roomCode"].orEmpty())
      put("drawingData", "")  // No drawing data available
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
