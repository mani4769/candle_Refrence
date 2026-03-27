package com.mani_maddy.candle

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.mani_maddy.candle.widget.SharedNoteWidget
import com.mani_maddy.candle.widget.SharedImageWidget
import com.mani_maddy.candle.widget.SharedStatusWidget

class WidgetModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    override fun getName(): String {
        return "WidgetModule"
    }
    
    @ReactMethod
    fun refreshWidget() {
        val context = reactApplicationContext
        val appWidgetManager = AppWidgetManager.getInstance(context)

        fun broadcastUpdate(clazz: Class<*>) {
            val widgetComponent = ComponentName(context, clazz)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(widgetComponent)
            if (appWidgetIds.isEmpty()) {
                return
            }
            val intent = Intent(context, clazz)
            intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, appWidgetIds)
            context.sendBroadcast(intent)
        }

        broadcastUpdate(SharedNoteWidget::class.java)
        broadcastUpdate(SharedImageWidget::class.java)
        broadcastUpdate(SharedStatusWidget::class.java)
    }
}
