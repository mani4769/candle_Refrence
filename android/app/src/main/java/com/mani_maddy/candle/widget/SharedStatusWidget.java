package com.mani_maddy.candle.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import com.mani_maddy.candle.MainActivity;
import com.mani_maddy.candle.R;

import org.json.JSONObject;

/**
 * Pure native widget. Displays last received status text for the room.
 */
public class SharedStatusWidget extends AppWidgetProvider {
  private static final String TAG = "SharedStatusWidget";
  private static final String STORAGE_DB = "RKStorage";
  private static final String STORAGE_TABLE = "catalystLocalStorage";
  private static final String STORAGE_KEY = "shared_status_widget_state";

  @Override
  public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
    if (appWidgetIds == null) return;
    for (int widgetId : appWidgetIds) {
      updateWidget(context, appWidgetManager, widgetId);
    }
  }

  @Override
  public void onReceive(Context context, Intent intent) {
    super.onReceive(context, intent);
    if (AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(intent.getAction())) {
      AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
      ComponentName thisWidget = new ComponentName(context, SharedStatusWidget.class);
      int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
      onUpdate(context, appWidgetManager, appWidgetIds);
    }
  }

  private void updateWidget(Context context, AppWidgetManager appWidgetManager, int widgetId) {
    JSONObject state = readStoredJson(context);
    String status = state.optString("status", "");

    // JSONObject.optString returns literal "null" when the value is JSONObject.NULL.
    if (status != null && status.trim().equalsIgnoreCase("null")) {
      status = "";
    }

    boolean hasStatus = status != null && !status.trim().isEmpty();
    String text = hasStatus ? status : "No status yet";

    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_shared_status_native);
    views.setTextViewText(R.id.widget_status_text, text);
    views.setTextColor(R.id.widget_status_text, hasStatus ? 0xFFFFFFFF : 0xFF6F6F6F);
    views.setViewVisibility(R.id.widget_status_yet_icon, hasStatus ? View.GONE : View.VISIBLE);

    Intent launchIntent = new Intent(context, MainActivity.class);
    launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    launchIntent.setData(Uri.parse("candle://widget/status?wid=" + widgetId));
    PendingIntent launchPending = PendingIntent.getActivity(
      context, widgetId, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    views.setOnClickPendingIntent(R.id.widget_root, launchPending);

    appWidgetManager.updateAppWidget(widgetId, views);
  }

  private JSONObject readStoredJson(Context context) {
    SQLiteDatabase db = null;
    Cursor cursor = null;
    try {
      db = context.openOrCreateDatabase(STORAGE_DB, Context.MODE_PRIVATE, null);
      cursor = db.query(
        STORAGE_TABLE,
        new String[]{"value"},
        "key = ?",
        new String[]{STORAGE_KEY},
        null,
        null,
        null
      );
      if (cursor != null && cursor.moveToFirst()) {
        String raw = cursor.getString(0);
        if (raw != null && !raw.isEmpty()) {
          return new JSONObject(raw);
        }
      }
    } catch (Exception e) {
      Log.e(TAG, "readStoredJson failed: " + e.getMessage());
    } finally {
      if (cursor != null) cursor.close();
      if (db != null) db.close();
    }
    return new JSONObject();
  }
}
