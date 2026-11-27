// Badr for Windows: a small native window around the Badr workspace (https://finobots.com).
// Conversations, bots and accounts live on the server, so web changes show up on the next reload.
//
// Google sign-in runs in the person's default browser (Google refuses embedded browsers), using the same
// single-use PKCE ticket as the Mac and iPhone apps: the browser comes back through a `fino://auth?code=…`
// link, and the app redeems the code inside the workspace page so the session cookie lands in this window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

const WORKSPACE: &str = "https://finobots.com";
const HOST: &str = "finobots.com";

/// The PKCE verifier for a sign-in that is waiting for the browser to come back.
struct PendingLogin(Mutex<Option<String>>);

fn focus(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Opens Google sign-in in the default browser with a fresh PKCE challenge.
fn start_browser_login(app: &AppHandle) {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    *app.state::<PendingLogin>().0.lock().unwrap() = Some(verifier);
    let url = format!("{WORKSPACE}/api/auth/google/start?native_challenge={challenge}");
    let _ = app.opener().open_url(url, None::<&str>);
}

/// Handles `fino://auth?code=…` (sign-in finished) and `fino://connected…` (an app was connected).
fn handle_link(app: &AppHandle, raw: &str) {
    let Ok(url) = Url::parse(raw) else { return };
    if url.scheme() != "fino" {
        return;
    }
    focus(app);
    let Some(w) = app.get_webview_window("main") else { return };
    match url.host_str() {
        Some("auth") => {
            let code = url.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.to_string());
            let verifier = app.state::<PendingLogin>().0.lock().unwrap().take();
            if let (Some(code), Some(verifier)) = (code, verifier) {
                // Submitted from the workspace page itself, so it is a same-origin POST and the
                // session cookie the server sets belongs to this window.
                let js = format!(
                    "(function(){{var f=document.createElement('form');f.method='POST';f.action='/api/auth/native/exchange';\
                     [['code',{c}],['verifier',{v}]].forEach(function(p){{var i=document.createElement('input');i.type='hidden';i.name=p[0];i.value=p[1];f.appendChild(i);}});\
                     document.body.appendChild(f);f.submit();}})();",
                    c = serde_json::to_string(&code).unwrap(),
                    v = serde_json::to_string(&verifier).unwrap()
                );
                let _ = w.eval(&js);
            }
        }
        Some("connected") => {
            let _ = w.eval("location.reload()");
        }
        _ => {}
    }
}

/// Decides what may load inside the window: the workspace stays in, Google sign-in goes to the
/// browser with PKCE, and every other site opens in the default browser.
fn allow_navigation(app: &AppHandle, url: &Url) -> bool {
    match url.scheme() {
        "about" | "data" | "blob" => return true,
        "http" | "https" => {}
        _ => return false,
    }
    let host = url.host_str().unwrap_or_default();
    let ours = host == HOST || host.ends_with(&format!(".{HOST}"));
    if ours && url.path() == "/api/auth/google/start" && !url.query_pairs().any(|(k, _)| k == "native_challenge") {
        start_browser_login(app);
        return false;
    }
    if ours {
        return true;
    }
    if host == "accounts.google.com" {
        start_browser_login(app);
        return false;
    }
    let _ = app.opener().open_url(url.as_str(), None::<&str>);
    false
}

fn main() {
    tauri::Builder::default()
        // A second launch (for example the browser handing back `fino://auth…`) goes to the open window.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for arg in argv.iter().skip(1) {
                handle_link(app, arg);
            }
            focus(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .manage(PendingLogin(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let nav = handle.clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(WORKSPACE.parse().unwrap()))
                .title("Badr")
                .inner_size(1280.0, 820.0)
                .min_inner_size(900.0, 600.0)
                .center()
                .on_navigation(move |url| allow_navigation(&nav, url))
                .build()?;
            #[cfg(any(windows, target_os = "linux"))]
            {
                let _ = app.deep_link().register_all();
            }
            let links = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_link(&links, url.as_str());
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Badr could not start");
}
