package com.mani_maddy.candle.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "WidgetModule"

  @ReactMethod
  fun refreshWidget() {
    val context = reactApplicationContext ?: return
    val appWidgetManager = AppWidgetManager.getInstance(context)
    val component = ComponentName(context, SharedNoteWidget::class.java)
    val widgetIds = appWidgetManager.getAppWidgetIds(component)
    if (widgetIds.isEmpty()) {
      return
    }
    val updateIntent = Intent(context, SharedNoteWidget::class.java).apply {
      action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds)
    }
    context.sendBroadcast(updateIntent)
  }
}
