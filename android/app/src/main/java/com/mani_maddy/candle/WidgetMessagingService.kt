package com.mani_maddy.candle

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.ContentValues
import android.content.Intent
import android.util.Log
import android.util.Base64
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.mani_maddy.candle.widget.SharedNoteWidget
import com.mani_maddy.candle.widget.SharedImageWidget
import com.mani_maddy.candle.widget.SharedStatusWidget
import com.reactnativecommunity.asyncstorage.ReactDatabaseSupplier
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
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

  private fun readStoredValue(key: String): String {
    return try {
      val db = ReactDatabaseSupplier.getInstance(applicationContext).get()
      val cursor = db.query(
        TABLE_CATALYST,
        arrayOf("value"),
        "key = ?",
        arrayOf(key),
        null,
        null,
        null,
        "1",
      )
      cursor.use {
        if (it.moveToFirst()) {
          it.getString(0) ?: ""
        } else {
          ""
        }
      }
    } catch (_: Exception) {
      ""
    }
  }

  private fun saveKeyValue(key: String, value: String) {
    val db = ReactDatabaseSupplier.getInstance(applicationContext).get()
    val values = ContentValues().apply {
      put("key", key)
      put("value", value)
    }
    db.insertWithOnConflict(
      TABLE_CATALYST,
      null,
      values,
      android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE,
    )
  }

  private fun firstNonBlank(vararg values: String?): String {
    for (v in values) {
      val s = (v ?: "").trim()
      // JSONObject.optString returns literal "null" when the value is JSONObject.NULL.
      if (s.isNotBlank() && !s.equals("null", ignoreCase = true)) return s
    }
    return ""
  }

  private fun stripDataUrlBase64(raw: String): String {
    val idx = raw.indexOf("base64,")
    return if (idx >= 0) raw.substring(idx + "base64,".length) else raw
  }

  private fun writeImageToCache(roomId: String, base64Data: String): String {
    val cleaned = stripDataUrlBase64(base64Data).trim()
    val bytes = Base64.decode(cleaned, Base64.DEFAULT)
    val outFile = File(cacheDir, "shared_image_${roomId}.jpg")
    FileOutputStream(outFile).use { it.write(bytes) }
    return outFile.absolutePath
  }

  private fun fetchAndUpdateFromAppwrite(roomId: String, fallbackData: Map<String, String>) {
    thread {
      try {
        val endpoint = "https://fra.cloud.appwrite.io/v1"
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
          
          val currentUserId = readStoredValue(CURRENT_USER_KEY)

          val noteJson = JSONObject().apply {
            put("roomId", roomId)
            put("roomCode", doc.optString("roomCode", ""))
            put("drawingData", doc.optString("drawingData", ""))
            put("done", doc.optBoolean("done", false))
            put("updatedBy", doc.optString("updatedBy", "push"))
            put("updatedAt", doc.optString("updatedAt", System.currentTimeMillis().toString()))
          }.toString()

          Log.d(TAG, "Fetched from Appwrite, drawingData length: ${doc.optString("drawingData", "").length}")
          saveKeyValue(STORAGE_KEY, noteJson)

          // Media/status updates should apply only to the receiver (not the sender).
          val statusText = firstNonBlank(
            doc.optString("statusText", ""),
            doc.optString("lastStatusText", ""),
          )
          val statusFrom = firstNonBlank(
            doc.optString("statusFromUserId", ""),
            doc.optString("lastStatusFromUserId", ""),
          )

          val imageBase64 = firstNonBlank(
            doc.optString("statusImageBase64", ""),
            doc.optString("lastImageBase64", ""),
            doc.optString("imageBase64", ""),
          )
          val imageFrom = firstNonBlank(
            doc.optString("statusImageFromUserId", ""),
            doc.optString("lastImageFromUserId", ""),
            doc.optString("imageFromUserId", ""),
          )

          // Receiver-only: if either status or image was updated by someone else, update BOTH widget states.
          // This allows "image-only" sends to clear the status widget ("No status yet") and vice-versa.
          val shareFromUserId = firstNonBlank(statusFrom, imageFrom)
          if (shareFromUserId.isNotBlank() && shareFromUserId != currentUserId) {
            // Status widget: store empty string when not provided so widget shows placeholder.
            val statusJson = JSONObject().apply {
              put("roomId", roomId)
              put("status", statusText) // may be blank
              put("fromUserId", shareFromUserId)
              put("updatedAt", doc.optString("statusUpdatedAt", doc.optString("updatedAt", System.currentTimeMillis().toString())))
            }.toString()
            saveKeyValue(STATUS_STORAGE_KEY, statusJson)

            // Image widget: store empty path when not provided so widget shows placeholder.
            var imagePath = ""
            if (imageBase64.isNotBlank()) {
              try {
                imagePath = writeImageToCache(roomId, imageBase64)
              } catch (e: Exception) {
                Log.e(TAG, "Image decode/write failed: ${e.message}")
              }
            }
            val imageJson = JSONObject().apply {
              put("roomId", roomId)
              put("imagePath", imagePath)
              put("fromUserId", shareFromUserId)
              put("updatedAt", doc.optString("statusUpdatedAt", doc.optString("updatedAt", System.currentTimeMillis().toString())))
            }.toString()
            saveKeyValue(IMAGE_STORAGE_KEY, imageJson)
          }

          requestWidgetRefreshAll()
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

    saveKeyValue(STORAGE_KEY, noteJson)
    requestWidgetRefreshAll()
  }

  private fun toBoolean(value: String?): Boolean {
    return value == "1" || value.equals("true", ignoreCase = true)
  }

  private fun requestWidgetRefresh(clazz: Class<*>) {
    val appWidgetManager = AppWidgetManager.getInstance(this)
    val component = ComponentName(this, clazz)
    val widgetIds = appWidgetManager.getAppWidgetIds(component)
    if (widgetIds.isEmpty()) {
      return
    }
    val updateIntent = Intent(this, clazz).apply {
      action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds)
    }
    sendBroadcast(updateIntent)
  }

  private fun requestWidgetRefreshAll() {
    requestWidgetRefresh(SharedNoteWidget::class.java)
    requestWidgetRefresh(SharedImageWidget::class.java)
    requestWidgetRefresh(SharedStatusWidget::class.java)
  }

  companion object {
    private const val TABLE_CATALYST = "catalystLocalStorage"
    private const val STORAGE_KEY = "shared_note_widget_state"
    private const val IMAGE_STORAGE_KEY = "shared_image_widget_state"
    private const val STATUS_STORAGE_KEY = "shared_status_widget_state"
    private const val CURRENT_USER_KEY = "current_user_id"
    private const val TAG = "WidgetMessagingSvc"
  }
}
