package kz.routehub.app

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DgisNavigationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "DgisNavigation"

  @ReactMethod
  fun openNavigation(
    fromLat: Double,
    fromLon: Double,
    toLat: Double,
    toLon: Double
  ) {
    val intent = Intent(reactContext, DgisNavigationActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      putExtra(DgisNavigationActivity.EXTRA_FROM_LAT, fromLat)
      putExtra(DgisNavigationActivity.EXTRA_FROM_LON, fromLon)
      putExtra(DgisNavigationActivity.EXTRA_TO_LAT, toLat)
      putExtra(DgisNavigationActivity.EXTRA_TO_LON, toLon)
    }

    reactContext.startActivity(intent)
  }
}
