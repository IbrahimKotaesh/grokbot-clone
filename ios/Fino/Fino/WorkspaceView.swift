import SwiftUI
import WebKit
import AuthenticationServices
import CryptoKit
import Security

private let workspace = URL(string: "https://grokbot.89-167-54-211.sslip.io")!

struct WorkspaceView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.97, green: 0.98, blue: 0.97, alpha: 1)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = true
        context.coordinator.web = web
        web.load(URLRequest(url: workspace))
        return web
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, ASWebAuthenticationPresentationContextProviding, URLSessionTaskDelegate {
        weak var web: WKWebView?
        var authentication: ASWebAuthenticationSession?
        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            web?.window ?? ASPresentationAnchor()
        }
        private func showLoginError(_ message: String) {
            let alert = UIAlertController(title: "Sign-in couldn't finish", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Try again", style: .default) { [weak self] _ in self?.login() })
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
            web?.window?.rootViewController?.present(alert, animated: true)
        }
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil) // Inspect Set-Cookie before loading the workspace in WKWebView.
        }
        private func exchange(code: String, verifier: String) {
            var request = URLRequest(url: workspace.appendingPathComponent("api/auth/native/exchange"))
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.setValue(workspace.absoluteString, forHTTPHeaderField: "Origin")
            var form = URLComponents()
            form.queryItems = [URLQueryItem(name: "code", value: code), URLQueryItem(name: "verifier", value: verifier)]
            request.httpBody = form.percentEncodedQuery?.data(using: .utf8)
            let session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: nil)
            session.dataTask(with: request) { [weak self] _, response, error in
                defer { session.finishTasksAndInvalidate() }
                DispatchQueue.main.async {
                    guard let self else { return }
                    guard error == nil, let response = response as? HTTPURLResponse, response.statusCode == 303 else {
                        self.showLoginError("The login session could not be transferred. Please try again.")
                        return
                    }
                    let headers = response.allHeaderFields.reduce(into: [String:String]()) { result, pair in
                        if let key = pair.key as? String, let value = pair.value as? String { result[key] = value }
                    }
                    let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: workspace)
                    guard let cookie = cookies.first(where: { $0.name == "grokbot_session" }), let web = self.web else {
                        self.showLoginError("The server didn't return a sign-in session."); return
                    }
                    web.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {
                        DispatchQueue.main.async { web.load(URLRequest(url: workspace)) }
                    }
                }
            }.resume()
        }
        private func login() {
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return }
            func base64url(_ data: Data) -> String { data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
            let verifier = base64url(Data(bytes))
            let challenge = base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
            var url = URLComponents(url: workspace.appendingPathComponent("api/auth/google/start"), resolvingAgainstBaseURL: false)!
            url.queryItems = [URLQueryItem(name: "native_challenge", value: challenge)]
            authentication = ASWebAuthenticationSession(url: url.url!, callbackURLScheme: "fino") { [weak self] callback, error in
                DispatchQueue.main.async {
                    guard let self else { return }
                    defer { self.authentication = nil }
                    if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin { return }
                    guard error == nil, let callback, callback.host == "auth",
                          let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else {
                        self.showLoginError("Google didn't return to Fino. Please try again."); return
                    }
                    self.exchange(code: code, verifier: verifier)
                }
            }
            authentication?.presentationContextProvider = self
            if authentication?.start() != true {
                authentication = nil
                showLoginError("The secure sign-in browser couldn't open.")
            }
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if url.host == workspace.host && url.path == "/api/auth/google/start" {
                decisionHandler(.cancel); login(); return
            }
            if url.host == workspace.host || url.scheme == "about" || url.scheme == "blob" {
                decisionHandler(.allow); return
            }
            decisionHandler(.cancel)
            if ["https", "http", "mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url { UIApplication.shared.open(url) }
            return nil
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            let alert = UIAlertController(title: "Fino couldn't connect", message: "Check your internet connection and try again.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Retry", style: .default) { _ in webView.load(URLRequest(url: workspace)) })
            webView.window?.rootViewController?.present(alert, animated: true)
        }
    }
}
