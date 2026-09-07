package com.coachdi.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CoachDiNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge().getWebView();
                webView.evaluateJavascript(
                    "(function(){var sheet=document.getElementById('sheetWrap');" +
                    "if(sheet&&!sheet.classList.contains('hidden')&&typeof closeSheet==='function'){closeSheet();return true;}" +
                    "if(document.getElementById('csModalRoot')&&typeof csCloseModal==='function'){csCloseModal();return true;}" +
                    "return false;})()",
                    handled -> {
                        if ("true".equals(handled)) return;
                        if (webView.canGoBack()) webView.goBack();
                        else moveTaskToBack(true);
                    }
                );
            }
        });
    }
}
