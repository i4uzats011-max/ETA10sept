package com.antigravity.cargotracking;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "CargoLogisticsApp";
    private static final int STARTUP_PERMISSIONS_REQUEST_CODE = 2001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestStartupAppPermissions();
    }

    /**
     * Request runtime permissions when the mobile app is installed & opened:
     * 1. Notification Permission (POST_NOTIFICATIONS on Android 13+ / API 33+)
     * 2. GPS Location Permissions (ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION)
     */
    private void requestStartupAppPermissions() {
        List<String> permissionsToRequest = new ArrayList<>();

        // 1. Notification permission for Android 13+ (API 33+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        // 2. Location permissions (Fine GPS & Coarse Network)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }

        if (!permissionsToRequest.isEmpty()) {
            Log.i(TAG, "Requesting startup permissions for Notifications & Location: " + permissionsToRequest);
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toArray(new String[0]),
                STARTUP_PERMISSIONS_REQUEST_CODE
            );
        } else {
            Log.i(TAG, "All startup permissions (Notification & Location) are already granted.");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == STARTUP_PERMISSIONS_REQUEST_CODE) {
            for (int i = 0; i < permissions.length; i++) {
                String permission = permissions[i];
                boolean isGranted = (i < grantResults.length && grantResults[i] == PackageManager.PERMISSION_GRANTED);
                Log.i(TAG, "Startup Permission result for " + permission + ": " + (isGranted ? "GRANTED" : "DENIED"));
            }
        }
    }
}
