# Flutter-specific rules
-keep public class io.flutter.app.FlutterApplication { *; }
-keep public class io.flutter.plugins.PluginRegistry { *; }
-keep public class io.flutter.plugins.PluginRegistry$GeneratedPluginRegistrant { *; }
-keep public class io.flutter.embedding.android.FlutterActivity { *; }
-keep public class io.flutter.embedding.android.FlutterFragment { *; }
-dontwarn io.flutter.embedding.**
-dontwarn io.flutter.util.FlashMode
-dontwarn io.flutter.view.FlutterView
-repackageclasses io.flutter

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep custom model classes
-keep class com.patrol.patrol_app.** { *; }