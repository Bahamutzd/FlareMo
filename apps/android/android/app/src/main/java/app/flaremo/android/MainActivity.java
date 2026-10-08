package app.flaremo.android;

import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import java.io.OutputStream;

/**
 * The FlareMo shell. Capacitor already routes microphone requests to the
 * Android permission prompt and sends links to other hosts to the system
 * browser; this activity adds the system Back button walking the page
 * history, and saving files, which a WebView does not do on its own.
 * Server files (attachments, exports) go through
 * DownloadManager with the session cookie; files the page builds in memory
 * (blob: and data: URLs, e.g. the share image) are read by injected script
 * and written to Downloads through MediaStore.
 */
public class MainActivity extends BridgeActivity {

    /** Reads a blob:/data: URL in the page and hands its bytes to {@link Saver}. */
    private static final String READ_IN_PAGE =
        "(function(url,name,type){" +
        "fetch(url).then(function(r){return r.blob();}).then(function(b){" +
        "var f=new FileReader();" +
        "f.onloadend=function(){FlareMoAndroid.save(String(f.result).split(',')[1]||'',name,b.type||type);};" +
        "f.readAsDataURL(b);" +
        "}).catch(function(){FlareMoAndroid.save('',name,type);});" +
        "})";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new Saver(getApplicationContext()), "FlareMoAndroid");
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                webView.evaluateJavascript(
                    READ_IN_PAGE + "(" + quote(url) + "," + quote(name) + "," + quote(mimeType) + ")",
                    null
                );
                return;
            }
            enqueueDownload(url, userAgent, mimeType, name);
        });
        // System Back walks the page history (closing an open memo, leaving
        // a sub-page) and only leaves the app from the first page.
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
    }

    private void enqueueDownload(String url, String userAgent, String mimeType, String name) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            request.addRequestHeader("User-Agent", userAgent);
            request.setMimeType(mimeType);
            request.setTitle(name);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, getString(R.string.download_started, name), Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show();
        }
    }

    private static String quote(String value) {
        if (value == null) return "''";
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "") + "'";
    }

    /** Writes page-built files into the public Downloads folder. */
    static final class Saver {

        private final Context context;

        Saver(Context context) {
            this.context = context;
        }

        // Only pages the app keeps in its WebView can call this: the FlareMo
        // instance (links to any other host open in the system browser). It
        // can do nothing but add a file to Downloads.
        @JavascriptInterface
        public void save(String base64, String name, String mimeType) {
            boolean saved = false;
            if (base64 != null && !base64.isEmpty()) {
                try {
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    saved = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? writeToDownloads(bytes, name, mimeType)
                        : writeToAppDownloads(bytes, name);
                } catch (Exception ignored) {
                    saved = false;
                }
            }
            final boolean ok = saved;
            final String message = ok
                ? context.getString(R.string.download_saved, name)
                : context.getString(R.string.download_failed);
            new android.os.Handler(android.os.Looper.getMainLooper()).post(() ->
                Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
            );
        }

        /** Android 10+: the shared Downloads collection, no permission needed. */
        private boolean writeToDownloads(byte[] bytes, String name, String mimeType) throws Exception {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            Uri item = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (item == null) return false;
            try (OutputStream out = context.getContentResolver().openOutputStream(item)) {
                if (out == null) return false;
                out.write(bytes);
                return true;
            }
        }

        /** Android 7–9: the app's own Downloads folder, also permission-free. */
        private boolean writeToAppDownloads(byte[] bytes, String name) throws Exception {
            java.io.File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) return false;
            try (OutputStream out = new java.io.FileOutputStream(new java.io.File(dir, name))) {
                out.write(bytes);
                return true;
            }
        }
    }
}
