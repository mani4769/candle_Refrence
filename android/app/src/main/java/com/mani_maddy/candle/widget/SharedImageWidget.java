package com.mani_maddy.candle.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import com.mani_maddy.candle.MainActivity;
import com.mani_maddy.candle.R;

import org.json.JSONObject;

import java.io.File;

/**
 * Pure native widget. Displays last received image for the room.
 * Shows a placeholder when no image has been received yet.
 */
public class SharedImageWidget extends AppWidgetProvider {
  private static final String TAG = "SharedImageWidget";
  private static final String STORAGE_DB = "RKStorage";
  private static final String STORAGE_TABLE = "catalystLocalStorage";
  private static final String STORAGE_KEY = "shared_image_widget_state";
  private static final int FALLBACK_WIDGET_SIZE_DP = 190;

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
      ComponentName thisWidget = new ComponentName(context, SharedImageWidget.class);
      int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
      onUpdate(context, appWidgetManager, appWidgetIds);
    }
  }

  @Override
  public void onAppWidgetOptionsChanged(
    Context context,
    AppWidgetManager appWidgetManager,
    int appWidgetId,
    Bundle newOptions
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions);
    updateWidget(context, appWidgetManager, appWidgetId);
  }

  private void updateWidget(Context context, AppWidgetManager appWidgetManager, int widgetId) {
    JSONObject state = readStoredJson(context);
    String imagePath = state.optString("imagePath", "");

    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_shared_image_native);

    boolean hasImage = imagePath != null && !imagePath.isEmpty() && new File(imagePath).exists();
    if (hasImage) {
      Bitmap bitmap = BitmapFactory.decodeFile(imagePath);
      if (bitmap != null) {
        Bitmap composedBitmap = createWidgetBitmap(context, appWidgetManager, widgetId, bitmap);
        // Hide the placeholder overlay so the image becomes full-bleed (no inner padding/gaps).
        views.setViewVisibility(R.id.widget_placeholder, View.GONE);
        views.setViewVisibility(R.id.widget_image_crop, View.VISIBLE);
        views.setImageViewBitmap(R.id.widget_image_crop, composedBitmap);
      } else {
        hasImage = false;
      }
    }

    if (!hasImage) {
      views.setViewVisibility(R.id.widget_placeholder, View.VISIBLE);
      views.setViewVisibility(R.id.widget_image_crop, View.GONE);
      views.setImageViewResource(R.id.widget_image_crop, android.R.color.transparent);
    }

    Intent launchIntent = new Intent(context, MainActivity.class);
    launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    launchIntent.setData(Uri.parse("candle://widget/camera?wid=" + widgetId));
    PendingIntent launchPending = PendingIntent.getActivity(
      context, widgetId, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    views.setOnClickPendingIntent(R.id.widget_root, launchPending);

    appWidgetManager.updateAppWidget(widgetId, views);
  }

  private Bitmap createWidgetBitmap(
    Context context,
    AppWidgetManager appWidgetManager,
    int widgetId,
    Bitmap sourceBitmap
  ) {
    int[] widgetSize = resolveWidgetSizePx(context, appWidgetManager, widgetId);
    int targetWidth = widgetSize[0];
    int targetHeight = widgetSize[1];

    Bitmap output = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(output);
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    drawBitmapCover(canvas, sourceBitmap, targetWidth, targetHeight, paint);
    return output;
  }

  private int[] resolveWidgetSizePx(Context context, AppWidgetManager appWidgetManager, int widgetId) {
    int fallbackSize = dpToPx(context, FALLBACK_WIDGET_SIZE_DP);
    int width = fallbackSize;
    int height = fallbackSize;

    Bundle options = appWidgetManager.getAppWidgetOptions(widgetId);
    if (options != null) {
      int minWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
      int minHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
      if (minWidthDp > 0) {
        width = dpToPx(context, minWidthDp);
      }
      if (minHeightDp > 0) {
        height = dpToPx(context, minHeightDp);
      }
    }

    return new int[]{Math.max(1, width), Math.max(1, height)};
  }

  private int dpToPx(Context context, int dp) {
    return Math.round(
      TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        dp,
        context.getResources().getDisplayMetrics()
      )
    );
  }

  private void drawBitmapCover(Canvas canvas, Bitmap bitmap, int width, int height, Paint paint) {
    float scale = Math.max(
      width / (float) bitmap.getWidth(),
      height / (float) bitmap.getHeight()
    );
    float scaledWidth = bitmap.getWidth() * scale;
    float scaledHeight = bitmap.getHeight() * scale;
    float left = (width - scaledWidth) / 2f;
    float top = (height - scaledHeight) / 2f;
    canvas.drawBitmap(bitmap, null, new RectF(left, top, left + scaledWidth, top + scaledHeight), paint);
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
