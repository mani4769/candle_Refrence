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
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.net.Uri;
import android.util.Log;
import android.widget.RemoteViews;

import com.mani_maddy.candle.MainActivity;
import com.mani_maddy.candle.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;


/**
 * Pure native widget - no JS dependency.
 * Shows drawing from JSON stroke data in a minimal candle-style card.
 * Click anywhere to open app.
 */
public class SharedNoteWidget extends AppWidgetProvider {
  private static final String TAG = "SharedNoteWidget";
  private static final String STORAGE_DB = "RKStorage";
  private static final String STORAGE_TABLE = "catalystLocalStorage";
  private static final String STORAGE_KEY = "shared_note_widget_state";
  private static final int BITMAP_WIDTH = 500;
  private static final int BITMAP_HEIGHT = 500; // Square bitmap matches square canvas
  private static final int CANVAS_BG_COLOR = Color.parseColor("#191919");

  @Override
  public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
    Log.d(TAG, "onUpdate called with " + (appWidgetIds != null ? appWidgetIds.length : 0) + " widgets");
    if (appWidgetIds == null) return;
    for (int widgetId : appWidgetIds) {
      updateWidget(context, appWidgetManager, widgetId);
    }
  }

  @Override
  public void onReceive(Context context, Intent intent) {
    super.onReceive(context, intent);
    Log.d(TAG, "onReceive called with action: " + intent.getAction());
    
    // Force update on any broadcast
    if (AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(intent.getAction())) {
      AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
      ComponentName thisWidget = new ComponentName(context, SharedNoteWidget.class);
      int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
      Log.d(TAG, "Triggering update for " + appWidgetIds.length + " widgets");
      onUpdate(context, appWidgetManager, appWidgetIds);
    }
  }

  private void updateWidget(Context context, AppWidgetManager appWidgetManager, int widgetId) {
    JSONObject note = readStoredNote(context);
    Log.d(TAG, "updateWidget called, widgetId: " + widgetId);

    String drawingData = note.optString("drawingData", "");

    Log.d(TAG, "drawingData length: " + (drawingData != null ? drawingData.length() : 0));
    Log.d(TAG, "minimal widget render");

    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_shared_note_native);
    // Render drawing from JSON stroke data
    Bitmap drawingBitmap = null;
    if (drawingData != null && !drawingData.isEmpty()) {
      Log.d(TAG, "Attempting to render drawing...");
      drawingBitmap = renderDrawingFromJson(drawingData);
      Log.d(TAG, "Drawing bitmap: " + (drawingBitmap != null ? "success" : "null"));
    } else {
      Log.d(TAG, "No drawing data found");
    }

    if (drawingBitmap != null) {
      views.setImageViewBitmap(R.id.widget_drawing, drawingBitmap);
    } else {
      views.setImageViewResource(R.id.widget_drawing, android.R.color.transparent);
    }

    // Click anywhere to open app
    Intent launchIntent = new Intent(context, MainActivity.class);
    launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    launchIntent.setData(Uri.parse("candle://widget/canvas?wid=" + widgetId));
    PendingIntent launchPending = PendingIntent.getActivity(
        context, widgetId, launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(R.id.widget_root, launchPending);

    appWidgetManager.updateAppWidget(widgetId, views);
  }

  private Bitmap renderDrawingFromJson(String jsonData) {
    try {
      Log.d(TAG, "renderDrawingFromJson called, data length: " + jsonData.length());
      JSONArray paths = new JSONArray(jsonData);
      Log.d(TAG, "Parsed " + paths.length() + " paths");
      if (paths.length() == 0) return null;

      // First pass: find actual drawing bounds AND max stroke width
      float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE;
      float maxX = Float.MIN_VALUE, maxY = Float.MIN_VALUE;
      float maxStrokeWidth = 0f;
      
      for (int i = 0; i < paths.length(); i++) {
        JSONObject pathObj = paths.getJSONObject(i);
        String d = pathObj.optString("d", "");
        float strokeWidth = (float) pathObj.optDouble("strokeWidth", 4);
        maxStrokeWidth = Math.max(maxStrokeWidth, strokeWidth);
        
        String[] tokens = d.split("\\s+");
        
        for (String token : tokens) {
          token = token.trim();
          if (token.isEmpty()) continue;
          char cmd = token.charAt(0);
          if (cmd == 'M' || cmd == 'L') {
            String coords = token.substring(1);
            String[] xy = coords.split(",");
            if (xy.length >= 2) {
              try {
                float x = Float.parseFloat(xy[0].trim());
                float y = Float.parseFloat(xy[1].trim());
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
              } catch (NumberFormatException e) {}
            }
          }
        }
      }
      
      if (minX == Float.MAX_VALUE) return null;
      
      // Expand bounds by half stroke width (strokes extend beyond center line)
      float strokePadding = maxStrokeWidth / 2f;
      minX -= strokePadding;
      minY -= strokePadding;
      maxX += strokePadding;
      maxY += strokePadding;
      
      // Calculate raw drawing dimensions (including stroke)
      float rawWidth = maxX - minX;
      float rawHeight = maxY - minY;
      
      // Ensure non-zero dimensions
      if (rawWidth < 1f) rawWidth = 1f;
      if (rawHeight < 1f) rawHeight = 1f;
      
      Log.d(TAG, "Drawing bounds (with stroke): " + minX + "," + minY + " to " + maxX + "," + maxY);
      Log.d(TAG, "Drawing size: " + rawWidth + "x" + rawHeight + ", maxStroke: " + maxStrokeWidth);
      
      // Padding to ensure drawing doesn't touch edges
      float padding = 10f;
      
      // Calculate scale to fit the drawing inside widget with padding
      float availableWidth = BITMAP_WIDTH - 2 * padding;
      float availableHeight = BITMAP_HEIGHT - 2 * padding;
      float scale = Math.min(availableWidth / rawWidth, availableHeight / rawHeight);
      
      // Limit scale to prevent extremely thick strokes or tiny drawings
      scale = Math.min(scale, 2.0f);  // Don't scale up more than 2x
      
      // Calculate scaled dimensions
      float scaledWidth = rawWidth * scale;
      float scaledHeight = rawHeight * scale;
      
      // Calculate offset to center the drawing in the widget
      float leftMargin = (BITMAP_WIDTH - scaledWidth) / 2f;
      float topMargin = (BITMAP_HEIGHT - scaledHeight) / 2f;
      float offsetX = leftMargin - minX * scale;
      float offsetY = topMargin - minY * scale;
      
      Log.d(TAG, "Scale: " + scale + ", offset: " + offsetX + "," + offsetY);

      // Create bitmap and canvas
      Bitmap bitmap = Bitmap.createBitmap(BITMAP_WIDTH, BITMAP_HEIGHT, Bitmap.Config.ARGB_8888);
      Canvas canvas = new Canvas(bitmap);
      canvas.drawColor(Color.TRANSPARENT);  // Keep widget dark background visible

      Paint paint = new Paint();
      paint.setStyle(Paint.Style.STROKE);
      paint.setStrokeCap(Paint.Cap.ROUND);
      paint.setStrokeJoin(Paint.Join.ROUND);
      paint.setAntiAlias(true);

      for (int i = 0; i < paths.length(); i++) {
        JSONObject pathObj = paths.getJSONObject(i);
        String d = pathObj.optString("d", "");
        String color = pathObj.optString("color", "#000000");
        float strokeWidth = (float) pathObj.optDouble("strokeWidth", 4) * scale;

        // Normalize legacy eraser colors to current canvas background.
        if (isEraserLikeColor(color)) {
          color = "#191919";
        }

        try {
          paint.setColor(Color.parseColor(color));
        } catch (Exception e) {
          paint.setColor(CANVAS_BG_COLOR);
        }
        paint.setStrokeWidth(Math.max(strokeWidth, 1f));

        Path path = parseSvgPathScaled(d, scale, offsetX, offsetY);
        if (path != null && !path.isEmpty()) {
          canvas.drawPath(path, paint);
        }
      }

      Log.d(TAG, "Drawing rendered successfully");
      return bitmap;
    } catch (Exception e) {
      Log.e(TAG, "Failed to render drawing from JSON: " + e.getMessage(), e);
      return null;
    }
  }

  private boolean isEraserLikeColor(String color) {
    if (color == null) return false;
    String normalized = color.trim().toLowerCase(Locale.US);
    return normalized.equals("#0c1020")
        || normalized.equals("#11131b")
        || normalized.equals("#12151d")
        || normalized.equals("#191919")
        || normalized.equals("#000000");
  }

  private Path parseSvgPathScaled(String d, float scale, float offsetX, float offsetY) {
    if (d == null || d.isEmpty()) return null;
    
    Path path = new Path();
    boolean hasPoints = false;
    
    String[] tokens = d.split("\\s+");
    
    for (String token : tokens) {
      token = token.trim();
      if (token.isEmpty()) continue;
      
      char cmd = token.charAt(0);
      if (cmd == 'M' || cmd == 'L') {
        String coords = token.substring(1);
        String[] xy = coords.split(",");
        
        if (xy.length >= 2) {
          try {
            float x = Float.parseFloat(xy[0].trim()) * scale + offsetX;
            float y = Float.parseFloat(xy[1].trim()) * scale + offsetY;
            
            if (cmd == 'M') {
              path.moveTo(x, y);
            } else {
              path.lineTo(x, y);
            }
            hasPoints = true;
          } catch (NumberFormatException e) {}
        }
      }
    }
    
    return hasPoints ? path : null;
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
        Log.d(TAG, "Read raw data, length: " + (raw != null ? raw.length() : 0));
        if (raw != null && !raw.isEmpty()) {
          JSONObject result = new JSONObject(raw);
          Log.d(TAG, "Parsed JSON keys: " + result.keys().toString());
          return result;
        }
      } else {
        Log.d(TAG, "No data found in storage");
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
