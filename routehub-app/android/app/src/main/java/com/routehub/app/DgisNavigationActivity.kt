package com.routehub.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.location.Location
import android.location.LocationManager
import android.os.Bundle
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import ru.dgis.sdk.Context as DGisContext
import ru.dgis.sdk.DGis
import ru.dgis.sdk.coordinates.GeoPoint
import ru.dgis.sdk.coordinates.Latitude
import ru.dgis.sdk.coordinates.Longitude
import ru.dgis.sdk.map.MapView
import ru.dgis.sdk.map.MyLocationMapObjectSource
import ru.dgis.sdk.navigation.NavigationManager
import ru.dgis.sdk.navigation.NavigationView
import ru.dgis.sdk.navigation.RouteBuildOptions
import ru.dgis.sdk.positioning.DefaultLocationSource
import ru.dgis.sdk.positioning.registerPlatformLocationSource
import ru.dgis.sdk.routing.CarRouteSearchOptions
import ru.dgis.sdk.routing.RouteSearchOptions
import ru.dgis.sdk.routing.RouteSearchPoint
import ru.dgis.sdk.routing.TrafficRouter

class DgisNavigationActivity : AppCompatActivity() {
  private lateinit var sdkContext: DGisContext
  private lateinit var mapView: MapView
  private lateinit var navigationManager: NavigationManager
  private var locationSource: DefaultLocationSource? = null
  private var rootView: FrameLayout? = null
  private var statusView: TextView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    if (hasLocationPermission()) {
      openNavigation()
    } else {
      ActivityCompat.requestPermissions(
        this,
        arrayOf(
          Manifest.permission.ACCESS_FINE_LOCATION,
          Manifest.permission.ACCESS_COARSE_LOCATION
        ),
        LOCATION_PERMISSION_REQUEST
      )
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)

    if (requestCode == LOCATION_PERMISSION_REQUEST && grantResults.any { it == PackageManager.PERMISSION_GRANTED }) {
      openNavigation()
    } else if (requestCode == LOCATION_PERMISSION_REQUEST) {
      showNavigationError(IllegalStateException("Нужно разрешение геолокации, чтобы начать маршрут"))
    }
  }

  private fun hasLocationPermission(): Boolean {
    return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
  }

  private fun openNavigation() {
    try {
      sdkContext = DGis.initialize(applicationContext)
      locationSource = DefaultLocationSource(applicationContext).also {
        registerPlatformLocationSource(sdkContext, it)
      }
      navigationManager = NavigationManager(sdkContext)

      rootView = FrameLayout(this)
      mapView = MapView(this)
      lifecycle.addObserver(mapView)

      val navigationView = NavigationView(this).apply {
        navigationManager = this@DgisNavigationActivity.navigationManager
      }

      mapView.addView(
        navigationView,
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT
        )
      )

      rootView!!.addView(
        mapView,
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT
        )
      )
      rootView!!.addView(createStatusView())
      rootView!!.addView(createCloseButton())

      setContentView(rootView)
      setStatus("Получаем текущую геолокацию...")

      mapView.getMapAsync { map ->
        try {
          navigationManager.mapManager.addMap(map)
          map.addSource(MyLocationMapObjectSource(sdkContext))
          startRouteFromUserLocation()
        } catch (error: Throwable) {
          showNavigationError(error)
        }
      }
    } catch (error: Throwable) {
      showNavigationError(error)
    }
  }

  private fun createStatusView(): TextView {
    return TextView(this).apply {
      textSize = 14f
      setTextColor(Color.WHITE)
      setBackgroundColor(Color.argb(210, 8, 17, 32))
      setPadding(22, 14, 22, 14)
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.WRAP_CONTENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.TOP or Gravity.START
      ).apply {
        setMargins(22, 48, 0, 0)
      }
      statusView = this
    }
  }

  private fun createCloseButton(): TextView {
    return TextView(this).apply {
      text = "Закрыть"
      textSize = 15f
      setTextColor(Color.WHITE)
      setBackgroundColor(Color.rgb(17, 24, 39))
      gravity = Gravity.CENTER
      setPadding(28, 14, 28, 14)
      setOnClickListener { finish() }
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.WRAP_CONTENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.TOP or Gravity.END
      ).apply {
        setMargins(0, 48, 28, 0)
      }
    }
  }

  private fun setStatus(text: String) {
    statusView?.text = text
  }

  private fun getLastKnownUserLocation(): Location? {
    val manager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val providers = listOf(
      LocationManager.GPS_PROVIDER,
      LocationManager.NETWORK_PROVIDER,
      LocationManager.PASSIVE_PROVIDER
    )

    return providers
      .mapNotNull { provider ->
        try {
          if (manager.isProviderEnabled(provider)) manager.getLastKnownLocation(provider) else null
        } catch (_: SecurityException) {
          null
        } catch (_: IllegalArgumentException) {
          null
        }
      }
      .maxByOrNull { it.time }
  }

  private fun startRouteFromUserLocation() {
    val userLocation = getLastKnownUserLocation()
    val toLat = intent.getDoubleExtra(EXTRA_TO_LAT, 51.1801)
    val toLon = intent.getDoubleExtra(EXTRA_TO_LON, 71.4306)

    val finishPoint = RouteSearchPoint(
      coordinates = GeoPoint(
        latitude = Latitude(toLat),
        longitude = Longitude(toLon)
      )
    )
    val routeSearchOptions = RouteSearchOptions(CarRouteSearchOptions())
    val routeBuildOptions = RouteBuildOptions(
      finishPoint = finishPoint,
      routeSearchOptions = routeSearchOptions
    )

    if (userLocation == null) {
      navigationManager.start(routeBuildOptions)
      setStatus("2GIS строит маршрут от текущей геолокации к точке назначения...")
      return
    }

    val startPoint = RouteSearchPoint(
      coordinates = GeoPoint(
        latitude = Latitude(userLocation.latitude),
        longitude = Longitude(userLocation.longitude)
      )
    )

    setStatus("Строим маршрут от вашей геолокации...")

    TrafficRouter(sdkContext)
      .findRoute(
        startPoint = startPoint,
        finishPoint = finishPoint,
        routeSearchOptions = routeSearchOptions
      )
      .onComplete(
        { routes ->
          runOnUiThread {
            try {
              val route = routes.firstOrNull()
              if (route != null) {
                navigationManager.start(routeBuildOptions, route)
                setStatus("Маршрут построен от вашей геолокации.")
              } else {
                navigationManager.start(routeBuildOptions)
                setStatus("2GIS строит маршрут от текущей геолокации...")
              }
            } catch (error: Throwable) {
              showNavigationError(error)
            }
          }
        },
        { error ->
          runOnUiThread {
            try {
              navigationManager.start(routeBuildOptions)
              setStatus("2GIS строит маршрут от текущей геолокации...")
            } catch (_: Throwable) {
              showNavigationError(error)
            }
          }
        }
      )
  }

  private fun showNavigationError(error: Throwable) {
    val text = TextView(this).apply {
      this.text = "Не удалось открыть встроенную 2GIS-навигацию\n\n${error.message ?: error::class.java.simpleName}"
      textSize = 16f
      setTextColor(Color.WHITE)
      setBackgroundColor(Color.rgb(8, 17, 32))
      setPadding(36, 80, 36, 36)
    }
    setContentView(text)
  }

  override fun onDestroy() {
    if (::navigationManager.isInitialized) {
      navigationManager.stop()
    }
    super.onDestroy()
  }

  companion object {
    private const val LOCATION_PERMISSION_REQUEST = 2401
    const val EXTRA_FROM_LAT = "fromLat"
    const val EXTRA_FROM_LON = "fromLon"
    const val EXTRA_TO_LAT = "toLat"
    const val EXTRA_TO_LON = "toLon"
  }
}
