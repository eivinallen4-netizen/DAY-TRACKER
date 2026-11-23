package app.workbetter.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private WebView web;
    private SharedPreferences preferences;
    private String origin;
    private TvUpdates updates;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        updates = new TvUpdates(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        preferences = getSharedPreferences("work-better", MODE_PRIVATE);
        origin = preferences.getString("origin", "");
        if (origin.isEmpty()) setup(); else openBoard();
    }
    private int dp(int value) { return (int)(value * getResources().getDisplayMetrics().density); }
    private TextView text(String content, int size, int color) {
        TextView view = new TextView(this); view.setText(content); view.setTextSize(size); view.setTextColor(color); view.setPadding(0,dp(8),0,dp(8)); return view;
    }
    private void setup() {
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(dp(70),dp(40),dp(70),dp(40));layout.setBackgroundColor(Color.rgb(17,17,17));
        layout.addView(text("WORK BETTER",32,Color.rgb(244,99,37)));
        layout.addView(text("Connect your TV",24,Color.WHITE));
        layout.addView(text("Enter your Work Better server address. Your phone and TV use the same address.",16,Color.LTGRAY));
        EditText input = new EditText(this);input.setSingleLine(true);input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);input.setTextColor(Color.WHITE);input.setHintTextColor(Color.GRAY);input.setHint("http://YOUR-SERVER:4317");input.setText(origin);layout.addView(input);
        Button connect = new Button(this);connect.setText("Open my board");layout.addView(connect);
        layout.addView(text("Use HTTPS for hosting. The debug app also supports HTTP on your home Wi-Fi.\nPress Menu or Back to change this address later.",14,Color.LTGRAY));
        connect.setOnClickListener(v->{
            String candidate=input.getText().toString().trim().replaceAll("/+$", "");
            Uri uri=Uri.parse(candidate);
            if(!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost()==null || uri.getUserInfo()!=null || uri.getQuery()!=null || uri.getFragment()!=null || (uri.getPath()!=null && !uri.getPath().isEmpty())) { input.setError("Enter only an http:// or https:// server address, without a path."); return; }
            origin=candidate;preferences.edit().putString("origin",origin).apply();openBoard();
        });
        setContentView(layout);input.requestFocus();
    }
    private void openBoard() {
        if(web!=null)web.destroy();
        web=new WebView(this);web.setBackgroundColor(Color.rgb(17,17,17));
        web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);
        web.getSettings().setSupportZoom(false);web.getSettings().setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u=request.getUrl(),base=Uri.parse(origin);
                return !(base.getScheme().equals(u.getScheme()) && base.getHost().equals(u.getHost()) && base.getPort()==u.getPort());
            }
            @Override public void onPageFinished(WebView view,String url){CookieManager.getInstance().flush();}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
                if(request.isForMainFrame())new AlertDialog.Builder(MainActivity.this).setTitle("Your board is taking a break").setMessage("Check that the server is running and your TV is on the same network.\n"+origin).setPositiveButton("Retry",(d,w)->web.reload()).setNeutralButton("Change address",(d,w)->setup()).setNegativeButton("Close",null).show();
            }
        });
        setContentView(web);web.loadUrl(origin+"/?view=tv");web.requestFocus();
    }
    private void menu() {
        new AlertDialog.Builder(this).setTitle("Work Better")
            .setItems(new String[]{"Back to board","Reload board","Check for updates","Change server address","Exit"}, (dialog, item) -> {
                if (item == 1 && web != null) web.reload();
                if (item == 2) updates.check(true);
                if (item == 3) setup();
                if (item == 4) finish();
            }).show();
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if(event.getKeyCode()==KeyEvent.KEYCODE_MENU && event.getAction()==KeyEvent.ACTION_UP){menu();return true;}
        return super.dispatchKeyEvent(event);
    }
    @Override public void onBackPressed() { menu(); }
    @Override protected void onPause(){updates.pause();super.onPause();CookieManager.getInstance().flush();if(web!=null)web.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();updates.resume();}
    @Override protected void onDestroy(){updates.close();if(web!=null)web.destroy();super.onDestroy();}
}
