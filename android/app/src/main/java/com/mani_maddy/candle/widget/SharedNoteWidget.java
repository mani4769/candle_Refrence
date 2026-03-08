package com.mani_maddy.candle.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;
import android.widget.RemoteViews;

import com.mani_maddy.candle.MainActivity;
import com.mani_maddy.candle.R;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Pure native widget - no JS dependency.
 * Shows text, status, and updated by/time.
 * Click anywhere to open app.
 */
public class SharedNoteWidget extends AppWidgetProvider {
  private static final String TAG = "SharedNoteWidget";
  private static final String STORAGE_DB = "RKStorage";
  private static final String STORAGE_TABLE = "catalystLocalStorage";
  private static final String STORAGE_KEY = "shared_note_widget_state";

  @Override
  public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
    if (appWidgetIds == null) return;
    for (int widgetId : appWidgetIds) {
      updateWidget(context, appWidgetManager, widgetId);
    }
  }

  private void updateWidget(Context context, AppWidgetManager appWidgetManager, int widgetId) {
    JSONObject note = readStoredNote(context);

    String roomCode = note.optString("roomCode", "No room");
    String text = note.optString("text", "").trim();
    boolean done = note.optBoolean("done", false);
    String doneText = done ? "Done" : "Pending";
    String updatedBy = note.optString("updatedBy", "system");
    String updatedAt = note.optString("updatedAt", "");

    if (text.isEmpty()) {
      text = "No text yet";
    }

    String timeStr = formatTime(updatedAt);

    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_shared_note_native);
    views.setTextViewText(R.id.widget_title, "Candle " + roomCode);
    views.setTextViewText(R.id.widget_text, text);
    views.setTextViewText(R.id.widget_status, "Status: " + doneText);
    views.setTextViewText(R.id.widget_by, "By: " + updatedBy + " at " + timeStr);

    // Click anywhere to open app
    Intent launchIntent = new Intent(context, MainActivity.class);
    launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent launchPending = PendingIntent.getActivity(
        context, 0, launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(R.id.widget_root, launchPending);

    appWidgetManager.updateAppWidget(widgetId, views);
  }

  private String formatTime(String iso) {
    if (iso == null || iso.isEmpty()) return "Never";
    try {
      SimpleDateFormat isoFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
      Date date = isoFormat.parse(iso.replace("Z", "").split("\\.")[0]);
      if (date == null) return "Never";
      return new SimpleDateFormat("hh:mm a", Locale.US).format(date);
    } catch (Exception e) {
      return "Never";
    }
  }

  private JSONObject readStoredNote(Context context) {
    SQLiteDatabase db = null;
    Cursor cursor = null;
    try {
      db = context.openOrCreateDatabase(STORAGE_DB, Context.MODE_PRIVATE, null);
      cursor = db.rawQuery(
          "SELECT value FROM " + STORAGE_TABLE + " WHERE key = ? LIMIT 1",
          new String[]{STORAGE_KEY});
      if (cursor.moveToFirst()) {
        String raw = cursor.getString(0);
        if (raw != null && !raw.isEmpty()) {
          return new JSONObject(raw);
        }
      }
    } catch (Exception e) {
      Log.e(TAG, "readStoredNote error", e);
    } finally {
      if (cursor != null) cursor.close();
      if (db != null) db.close();
    }
    return new JSONObject();
  }
}
