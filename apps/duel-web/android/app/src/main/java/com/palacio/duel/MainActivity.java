package com.palacio.duel;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Collections;

public class MainActivity extends BridgeActivity {
    // Disables the WebView's own native edge-glow/overscroll effect --
    // a separate mechanism from the CSS "overscroll-behavior" property
    // (see apps/duel-web/src/style.css's body.landscape-locked), and not
    // guaranteed to be suppressed by CSS alone on every WebView version.
    // Belt-and-suspenders for the same "feels like a scroll that
    // shouldn't be there" complaint: this kills it at the native layer
    // regardless of what the web layer does.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        View webView = getBridge().getWebView();
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // A *different* source of an unwanted "horizontal scroll" feeling
        // than the WebView overscroll glow above: Android's system
        // gesture navigation (the default since API 29) reserves a strip
        // along the screen's edges for its own edge-swipe "go back"
        // gesture -- its own shadow/arrow animation, which can intercept
        // the touch below the web layer entirely, so no CSS
        // overflow/overscroll-behavior rule can suppress it. Most
        // noticeable on a screen with no scrolling of its own, where
        // nothing else masks a stray edge touch -- exactly what got
        // reported. Opting the whole webview area out (API 29+; this
        // app's minSdk is 24, hence the version guard) tells the system
        // not to reserve that gesture area here at all. Has to be
        // re-applied whenever the view's size changes (rotation, etc.),
        // per Android's own documented contract for this API, hence the
        // layout listener rather than a single one-shot call.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            webView.addOnLayoutChangeListener((v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
                if (right > left && bottom > top) {
                    v.setSystemGestureExclusionRects(Collections.singletonList(new Rect(0, 0, right - left, bottom - top)));
                }
            });
        }
    }

    // Full screen for the game: hide the status and navigation bars.
    // A swipe from the edge shows them briefly.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsetsCompat.Type.systemBars());
        }
    }
}
