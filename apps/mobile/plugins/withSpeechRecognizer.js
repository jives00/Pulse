const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PKG = ['com', 'jives00', 'dram'];
const PKG_NAME = PKG.join('.');

// Kotlin strings use $ for templates — defined as JS arrays to avoid
// accidental JS template-literal interpolation of ${...} expressions.
const MODULE_KT = [
  'package ' + PKG_NAME,
  '',
  'import android.app.Activity',
  'import android.content.Intent',
  'import android.speech.RecognizerIntent',
  'import com.facebook.react.bridge.ActivityEventListener',
  'import com.facebook.react.bridge.Promise',
  'import com.facebook.react.bridge.ReactApplicationContext',
  'import com.facebook.react.bridge.ReactContextBaseJavaModule',
  'import com.facebook.react.bridge.ReactMethod',
  'import java.util.Locale',
  '',
  'class SpeechRecognizerModule(private val reactCtx: ReactApplicationContext) :',
  '    ReactContextBaseJavaModule(reactCtx), ActivityEventListener {',
  '',
  '    private var pending: Promise? = null',
  '    private val RC = 7142',
  '',
  '    init { reactCtx.addActivityEventListener(this) }',
  '',
  '    override fun getName(): String = "SpeechRecognizer"',
  '',
  '    @ReactMethod',
  '    fun startRecognition(promise: Promise) {',
  '        val activity = reactCtx.currentActivity',
  '        if (activity == null) {',
  '            promise.reject("E_NO_ACTIVITY", "No current activity")',
  '            return',
  '        }',
  '        pending = promise',
  '        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {',
  '            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)',
  '            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())',
  '        }',
  '        try {',
  '            @Suppress("DEPRECATION")',
  '            activity.startActivityForResult(intent, RC)',
  '        } catch (e: Exception) {',
  '            pending = null',
  '            promise.reject("E_UNAVAILABLE", e.message ?: "Speech recognizer unavailable")',
  '        }',
  '    }',
  '',
  '    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {',
  '        if (requestCode != RC) return',
  '        val p = pending ?: return',
  '        pending = null',
  '        val text = if (resultCode == Activity.RESULT_OK)',
  '            data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull() ?: ""',
  '        else ""',
  '        p.resolve(text)',
  '    }',
  '',
  '    override fun onNewIntent(intent: Intent) {}',
  '}',
].join('\n');

const PACKAGE_KT = [
  'package ' + PKG_NAME,
  '',
  'import com.facebook.react.ReactPackage',
  'import com.facebook.react.bridge.NativeModule',
  'import com.facebook.react.bridge.ReactApplicationContext',
  'import com.facebook.react.uimanager.ViewManager',
  '',
  'class SpeechRecognizerPackage : ReactPackage {',
  '    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =',
  '        listOf(SpeechRecognizerModule(ctx))',
  '    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =',
  '        emptyList()',
  '}',
].join('\n');

module.exports = (config) => {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const root = config.modRequest.platformProjectRoot;
      const srcDir = path.join(root, 'app', 'src', 'main', 'java', ...PKG);

      // Write the two Kotlin source files
      fs.writeFileSync(path.join(srcDir, 'SpeechRecognizerModule.kt'), MODULE_KT);
      fs.writeFileSync(path.join(srcDir, 'SpeechRecognizerPackage.kt'), PACKAGE_KT);

      // Register the package in the generated MainApplication.kt
      const mainAppPath = path.join(srcDir, 'MainApplication.kt');
      let content = fs.readFileSync(mainAppPath, 'utf8');

      if (!content.includes('SpeechRecognizerPackage')) {
        // Expo SDK 55 / RN 0.83 new arch: ExpoReactHostFactory with .apply {} block.
        // The template has a comment "// add(MyReactNativePackage())" — inject after it.
        let modified = content.replace(
          /^([ \t]+)(\/\/ add\(MyReactNativePackage\(\)\))[ \t]*$/m,
          '$1$2\n$1add(SpeechRecognizerPackage())'
        );

        // Legacy fallback: getPackages() with `return packages` on its own line
        if (modified === content) {
          modified = content.replace(
            /^([ \t]+)(return packages[ \t]*)$/m,
            '$1packages.add(SpeechRecognizerPackage())\n$1$2'
          );
        }

        if (modified === content) {
          throw new Error(
            '[withSpeechRecognizer] Could not find injection point in MainApplication.kt. ' +
            'Expected "// add(MyReactNativePackage())" or "return packages" line.'
          );
        }

        fs.writeFileSync(mainAppPath, modified);
      }

      return config;
    },
  ]);
};
