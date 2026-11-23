package app.workbetter.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

/** Downloads only newer builds from the product's GitHub Releases feed. */
final class TvUpdates {
    private static final String REPO = "eivinallen4-netizen/DAY-TRACKER";
    private static final String APK = "Work-Better-TV.apk";
    private static final long INTERVAL = 6L * 60 * 60 * 1000;
    private static final int MAX_APK = 64 * 1024 * 1024;
    private final Activity activity;
    private final SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Runnable scheduled = () -> check(false);
    private boolean visible, busy, promptOpen, awaitingPermission;
    private File ready;
    private int readyCode;

    TvUpdates(Activity activity) {
        this.activity = activity;
        prefs = activity.getSharedPreferences("tv-updates", Activity.MODE_PRIVATE);
    }

    void resume() {
        visible = true;
        if (awaitingPermission) {
            awaitingPermission = false;
            if (activity.getPackageManager().canRequestPackageInstalls()) install();
            else toast("Update saved. Allow installation to continue from Check for updates.");
        } else if (ready != null && !promptOpen) {
            offer();
        }
        schedule();
    }

    void pause() {
        visible = false;
        handler.removeCallbacks(scheduled);
    }

    void close() {
        pause();
        worker.shutdownNow();
    }

    private void schedule() {
        handler.removeCallbacks(scheduled);
        if (!visible) return;
        long elapsed = System.currentTimeMillis() - prefs.getLong("lastAttempt", 0L);
        long delay = elapsed < 0 ? 0 : Math.max(0, INTERVAL - elapsed);
        handler.postDelayed(scheduled, Math.max(1500L, delay));
    }

    void check(boolean manual) {
        if (busy || promptOpen) {
            if (manual && busy) toast("Checking for an update…");
            return;
        }
        busy = true;
        prefs.edit().putLong("lastAttempt", System.currentTimeMillis()).apply();
        if (manual) toast("Checking GitHub for updates…");
        worker.execute(() -> {
            try {
                PackageInfo installed = activity.getPackageManager().getPackageInfo(
                        activity.getPackageName(), PackageManager.GET_SIGNATURES);
                JSONObject release = metadata();
                if (release == null) {
                    finish(null, 0, manual ? "No TV release has been published yet." : null);
                    return;
                }
                String tag = release.getString("tag_name");
                if (!tag.matches("tv-build-[1-9][0-9]{0,8}") || release.optBoolean("draft") || release.optBoolean("prerelease"))
                    throw new IOException("Latest release is not a stable TV build.");
                int code = Integer.parseInt(tag.substring("tv-build-".length()));
                if (code <= installed.versionCode) {
                    finish(null, 0, manual ? "Work Better is up to date (" + installed.versionName + ")." : null);
                    return;
                }
                JSONArray assets = release.getJSONArray("assets");
                JSONObject asset = null;
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject candidate = assets.getJSONObject(i);
                    if (APK.equals(candidate.optString("name"))) asset = candidate;
                }
                String url = "https://github.com/" + REPO + "/releases/download/" + tag + "/" + APK;
                if (asset == null || !url.equals(asset.optString("browser_download_url")))
                    throw new IOException("Release APK is missing.");
                String digest = asset.optString("digest");
                long size = asset.getLong("size");
                if (!digest.matches("sha256:[0-9a-f]{64}") || size <= 0 || size > MAX_APK)
                    throw new IOException("Release verification details are missing.");
                File file = verifiedDownload(url, digest.substring(7), size, installed, code);
                finish(file, code, null);
            } catch (Exception error) {
                finish(null, 0, manual ? "Update check failed: " + error.getMessage() : null);
            }
        });
    }

    private JSONObject metadata() throws Exception {
        HttpsURLConnection api = open("https://api.github.com/repos/" + REPO + "/releases/latest");
        try {
            if (api.getResponseCode() == 404) return null;
            try (InputStream in = api.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) {
                    if (bytes.size() + n > 1024 * 1024) throw new IOException("Unexpected release response.");
                    bytes.write(buf, 0, n);
                }
                return new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            }
        } finally { api.disconnect(); }
    }

    private HttpsURLConnection open(String url) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("User-Agent", "Work-Better-TV");
        connection.setUseCaches(false);
        return connection;
    }

    private File verifiedDownload(String url, String expected, long size, PackageInfo installed, int code) throws Exception {
        File dir = new File(activity.getCacheDir(), "tv-updates");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Cannot create update cache.");
        File apk = new File(dir, "update.apk");
        if (apk.length() == size && digest(apk).equals(expected)) {
            checkIdentity(apk, installed, code);
            return apk;
        }
        File temp = File.createTempFile("download-", ".apk", dir);
        HttpsURLConnection connection = open(url);
        try {
            try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(temp)) {
                byte[] buffer = new byte[32768];
                long total = 0;
                int n;
                while ((n = in.read(buffer)) != -1) {
                    total += n;
                    if (total > size || Thread.currentThread().isInterrupted()) throw new IOException("Download interrupted.");
                    out.write(buffer, 0, n);
                }
                if (total != size) throw new IOException("Incomplete download.");
            }
            if (!digest(temp).equals(expected)) throw new IOException("APK checksum mismatch.");
            checkIdentity(temp, installed, code);
            if (!temp.renameTo(apk)) throw new IOException("Cannot save verified update.");
            return apk;
        } finally { connection.disconnect(); temp.delete(); }
    }

    private String digest(File file) throws Exception {
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[32768];
            int n;
            while ((n = in.read(buffer)) != -1) sha.update(buffer, 0, n);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : sha.digest()) hex.append(String.format(java.util.Locale.US, "%02x", b & 255));
        return hex.toString();
    }

    private void checkIdentity(File file, PackageInfo installed, int code) throws IOException {
        PackageInfo candidate = activity.getPackageManager().getPackageArchiveInfo(file.getPath(), PackageManager.GET_SIGNATURES);
        if (candidate == null || !installed.packageName.equals(candidate.packageName)
                || candidate.versionCode != code || code <= installed.versionCode
                || installed.signatures == null || installed.signatures.length == 0 || candidate.signatures == null
                || !new HashSet<>(Arrays.asList(installed.signatures)).equals(new HashSet<>(Arrays.asList(candidate.signatures))))
            throw new IOException("APK does not match this app, build number, or signing key.");
    }

    private void finish(File file, int code, String message) {
        handler.post(() -> {
            if (activity.isDestroyed() || activity.isFinishing()) return;
            busy = false;
            ready = file;
            readyCode = code;
            if (visible && message != null) toast(message);
            if (visible && file != null) offer();
            schedule();
        });
    }

    private void offer() {
        if (promptOpen || ready == null) return;
        promptOpen = true;
        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Work Better update ready")
                .setMessage("GitHub build " + readyCode + " is downloaded and verified.")
                .setPositiveButton("Install", (d, w) -> install())
                .setNegativeButton("Later", (d, w) -> ready = null)
                .create();
        dialog.setOnCancelListener(d -> ready = null);
        dialog.setOnDismissListener(d -> promptOpen = false);
        dialog.show();
    }

    private void install() {
        if (ready == null) return;
        try {
            if (!activity.getPackageManager().canRequestPackageInstalls()) {
                awaitingPermission = true;
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName())));
                return;
            }
            Uri uri = FileProvider.getUriForFile(activity, "app.workbetter.tv.updates", ready);
            Intent installer = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(installer);
            ready = null;
        } catch (RuntimeException error) {
            awaitingPermission = false;
            toast("Could not open the installer. Try Check for updates or sideload the APK.");
        }
    }

    private void toast(String message) {
        Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
    }
}
