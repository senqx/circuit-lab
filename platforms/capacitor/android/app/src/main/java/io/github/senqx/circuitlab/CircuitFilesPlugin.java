package io.github.senqx.circuitlab;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Uses Android's document picker, without broad storage permissions. */
@CapacitorPlugin(name = "CircuitFiles")
public class CircuitFilesPlugin extends Plugin {
    private static final int MAX_BYTES = 1000000;

    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(call, intent, "opened");
    }

    @PluginMethod
    public void save(PluginCall call) {
        String contents = call.getString("contents");
        String name = call.getString("name");
        if (contents == null || name == null || contents.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            call.reject("Circuit files must be smaller than 1 MB.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "saved");
    }

    private Uri selected(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return null;
        }
        return result.getData().getData();
    }

    @ActivityCallback
    private void opened(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = selected(call, result);
        if (uri == null) return;
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            if (input == null) throw new java.io.IOException();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (bytes.size() + count > MAX_BYTES) {
                    call.reject("Circuit files must be smaller than 1 MB.");
                    return;
                }
                bytes.write(buffer, 0, count);
            }
            JSObject response = new JSObject();
            response.put("contents", bytes.toString(StandardCharsets.UTF_8.name()));
            response.put("name", "circuit.json");
            response.put("cancelled", false);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("This circuit file could not be read.");
        }
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = selected(call, result);
        if (uri == null) return;
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new java.io.IOException();
            output.write(call.getString("contents", "").getBytes(StandardCharsets.UTF_8));
            JSObject response = new JSObject();
            response.put("cancelled", false);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("This circuit file could not be saved.");
        }
    }
}
