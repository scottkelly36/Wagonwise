package expo.modules.usbcardreader

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UsbCardReaderException(code: String, message: String) : CodedException(code, message, null)

/**
 * The phone side of reading a tachograph card with a USB card reader. It does the least it can: finds USB card readers (the CCID
 * class), asks the driver for permission, opens one, and moves raw bytes to and from its two bulk endpoints. Everything about what the
 * bytes mean is in JavaScript (src/lib/tachograph-card/ccid.ts), so it can be fixed and sent over the air without a new build.
 *
 * Bytes cross as base64 text. A card exchange is a few hundred bytes at a time, so nothing faster is needed.
 */
class UsbCardReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw UsbCardReaderException("ERR_NO_CONTEXT", "The app is not ready")

  private val usb: UsbManager
    get() = context.getSystemService(Context.USB_SERVICE) as UsbManager

  // One reader open at a time. A reader is a single physical thing, so this is a plain field set under [lock].
  private val lock = Any()
  private var connection: UsbDeviceConnection? = null
  private var claimed: UsbInterface? = null
  private var bulkIn: UsbEndpoint? = null
  private var bulkOut: UsbEndpoint? = null
  private var openName: String? = null
  private var detachReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("UsbCardReader")

    Events("onDetached")

    // Every USB device plugged in, saying which look like card readers. The whole list (not just readers) is returned so that if a
    // reader does not appear, the log shows what the phone did see.
    Function("listDevices") { devices() }

    AsyncFunction("requestPermission") { name: String, promise: Promise -> requestPermission(name, promise) }

    AsyncFunction("open") { name: String -> open(name) }

    AsyncFunction("write") { data: String, timeoutMs: Int -> write(data, timeoutMs) }

    // One USB transfer's worth of bytes as base64, or an empty string if nothing came in time.
    AsyncFunction("read") { timeoutMs: Int -> read(timeoutMs) }

    Function("close") { close() }

    OnDestroy { close() }
  }

  private fun devices(): List<Map<String, Any?>> =
    usb.deviceList.values.map { device ->
      val classes = (0 until device.interfaceCount).map { device.getInterface(it).interfaceClass }
      mapOf(
        "name" to device.deviceName,
        "vendorId" to device.vendorId,
        "productId" to device.productId,
        "product" to try { device.productName } catch (e: SecurityException) { null },
        "interfaceClasses" to classes,
        "isCardReader" to classes.contains(UsbConstants.USB_CLASS_CSCID),
        "hasPermission" to usb.hasPermission(device),
      )
    }

  private fun find(name: String): UsbDevice =
    usb.deviceList.values.firstOrNull { it.deviceName == name }
      ?: throw UsbCardReaderException("ERR_NO_DEVICE", "That USB device is no longer plugged in")

  private fun registerNotExported(receiver: BroadcastReceiver, filter: IntentFilter) {
    if (Build.VERSION.SDK_INT >= 33) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
  }

  private fun requestPermission(name: String, promise: Promise) {
    val device = find(name)
    if (usb.hasPermission(device)) {
      promise.resolve(true)
      return
    }
    val action = "${context.packageName}.USB_PERMISSION"
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        try {
          context.unregisterReceiver(this)
        } catch (e: IllegalArgumentException) {
          // Already unregistered.
        }
        promise.resolve(intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false))
      }
    }
    registerNotExported(receiver, IntentFilter(action))
    // Mutable on Android 12 and later, so the system can say in the intent whether permission was given; an immutable one would
    // always read as "no". It must name this app, which Android 14 insists on for a mutable one.
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
    val pending = PendingIntent.getBroadcast(context, 0, Intent(action).setPackage(context.packageName), flags)
    usb.requestPermission(device, pending)
  }

  private fun open(name: String): Map<String, Any?> {
    synchronized(lock) {
      close()
      val device = find(name)
      if (!usb.hasPermission(device)) {
        throw UsbCardReaderException("ERR_NO_PERMISSION", "No permission to use this reader")
      }
      val iface = (0 until device.interfaceCount)
        .map { device.getInterface(it) }
        .firstOrNull { it.interfaceClass == UsbConstants.USB_CLASS_CSCID }
        ?: throw UsbCardReaderException("ERR_NOT_A_READER", "This USB device is not a smart-card reader")
      var inEndpoint: UsbEndpoint? = null
      var outEndpoint: UsbEndpoint? = null
      for (i in 0 until iface.endpointCount) {
        val endpoint = iface.getEndpoint(i)
        if (endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
          if (endpoint.direction == UsbConstants.USB_DIR_IN) inEndpoint = endpoint else outEndpoint = endpoint
        }
      }
      if (inEndpoint == null || outEndpoint == null) {
        throw UsbCardReaderException("ERR_NO_ENDPOINTS", "The reader has no bulk endpoints")
      }
      val opened = usb.openDevice(device)
        ?: throw UsbCardReaderException("ERR_OPEN", "The phone would not open the reader")
      if (!opened.claimInterface(iface, true)) {
        opened.close()
        throw UsbCardReaderException("ERR_CLAIM", "Another app is using the reader")
      }
      connection = opened
      claimed = iface
      bulkIn = inEndpoint
      bulkOut = outEndpoint
      openName = name
      watchForUnplug(name)
      return mapOf(
        "descriptors" to Base64.encodeToString(opened.rawDescriptors ?: ByteArray(0), Base64.NO_WRAP),
        "vendorId" to device.vendorId,
        "productId" to device.productId,
        "product" to try { device.productName } catch (e: SecurityException) { null },
        "maxPacketIn" to inEndpoint.maxPacketSize,
        "maxPacketOut" to outEndpoint.maxPacketSize,
      )
    }
  }

  private fun watchForUnplug(name: String) {
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        val gone = if (Build.VERSION.SDK_INT >= 33) {
          intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        } else {
          @Suppress("DEPRECATION") intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
        }
        if (gone?.deviceName == name) {
          sendEvent("onDetached", mapOf("name" to name))
          close()
        }
      }
    }
    registerNotExported(receiver, IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED))
    detachReceiver = receiver
  }

  private fun write(data: String, timeoutMs: Int) {
    val conn = connection ?: throw UsbCardReaderException("ERR_NOT_OPEN", "No reader is open")
    val out = bulkOut ?: throw UsbCardReaderException("ERR_NOT_OPEN", "No reader is open")
    val bytes = Base64.decode(data, Base64.DEFAULT)
    val sent = conn.bulkTransfer(out, bytes, bytes.size, timeoutMs)
    if (sent != bytes.size) {
      throw UsbCardReaderException("ERR_WRITE", "Sent $sent of ${bytes.size} bytes to the reader")
    }
    // A message that fills whole packets is ended with an empty one, so the reader knows it is complete.
    if (bytes.isNotEmpty() && bytes.size % out.maxPacketSize == 0) {
      conn.bulkTransfer(out, ByteArray(0), 0, timeoutMs)
    }
  }

  private fun read(timeoutMs: Int): String {
    val conn = connection ?: throw UsbCardReaderException("ERR_NOT_OPEN", "No reader is open")
    val input = bulkIn ?: throw UsbCardReaderException("ERR_NOT_OPEN", "No reader is open")
    val buffer = ByteArray(1024)
    val count = conn.bulkTransfer(input, buffer, buffer.size, timeoutMs)
    if (count < 0) {
      // Nothing came in time, or the reader has gone.
      if (connection == null) throw UsbCardReaderException("ERR_NOT_OPEN", "The reader was unplugged")
      return ""
    }
    return Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP)
  }

  private fun close() {
    synchronized(lock) {
      detachReceiver?.let {
        try {
          context.unregisterReceiver(it)
        } catch (e: IllegalArgumentException) {
          // Already unregistered.
        }
      }
      detachReceiver = null
      claimed?.let { iface -> connection?.releaseInterface(iface) }
      connection?.close()
      connection = null
      claimed = null
      bulkIn = null
      bulkOut = null
      openName = null
    }
  }
}
