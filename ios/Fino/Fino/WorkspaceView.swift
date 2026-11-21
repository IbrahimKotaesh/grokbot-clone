import SwiftUI
import WebKit
import AuthenticationServices
import CryptoKit
import Security

private let workspace: URL = {
    #if DEBUG && targetEnvironment(simulator)
    // Simulator-only QA uses an isolated loopback server, never production auth.
    if ProcessInfo.processInfo.arguments.contains("--mobile-qa") {
        return URL(string: "http://127.0.0.1:8791/?qa=\(UUID().uuidString)")!
    }
    #endif
    return URL(string: "https://grokbot.89-167-54-211.sslip.io")!
}()

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
        web.backgroundColor = .systemBackground
        web.scrollView.backgroundColor = .systemBackground
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = true
        let loading = UIStackView()
        loading.axis = .vertical
        loading.alignment = .center
        loading.spacing = 12
        loading.translatesAutoresizingMaskIntoConstraints = false
        loading.isAccessibilityElement = false
        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.color = UIColor(red: 0.09, green: 0.43, blue: 0.44, alpha: 1)
        spinner.startAnimating()
        let label = UILabel()
        label.text = "Opening Fino…"
        label.font = .preferredFont(forTextStyle: .body)
        label.textColor = .secondaryLabel
        label.numberOfLines = 0
        label.textAlignment = .center
        let retry = UIButton(configuration: .filled())
        retry.setTitle("Try again", for: .normal)
        retry.configuration?.baseBackgroundColor = spinner.color
        retry.isHidden = true
        retry.addAction(UIAction { [weak coordinator = context.coordinator] _ in
            coordinator?.retryLoading()
        }, for: .touchUpInside)
        loading.addArrangedSubview(spinner)
        loading.addArrangedSubview(label)
        loading.addArrangedSubview(retry)
        web.addSubview(loading)
        NSLayoutConstraint.activate([loading.centerXAnchor.constraint(equalTo: web.centerXAnchor), loading.centerYAnchor.constraint(equalTo: web.centerYAnchor), loading.widthAnchor.constraint(lessThanOrEqualToConstant: 280)])
        context.coordinator.spinner = spinner
        context.coordinator.loadingLabel = label
        context.coordinator.retryButton = retry
        context.coordinator.loading = loading
        context.coordinator.web = web
        web.load(URLRequest(url: workspace, cachePolicy: .reloadIgnoringLocalCacheData))
        return web
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, ASWebAuthenticationPresentationContextProviding, URLSessionTaskDelegate {
        weak var web: WKWebView?
        var authentication: ASWebAuthenticationSession?
        weak var loading: UIStackView?
        weak var spinner: UIActivityIndicatorView?
        weak var loadingLabel: UILabel?
        weak var retryButton: UIButton?
        func retryLoading() {
            recoveredWebProcess = false
            web?.load(URLRequest(url: workspace, cachePolicy: .reloadIgnoringLocalCacheData))
        }
        var navigationTimeout: DispatchWorkItem?
        var recoveredWebProcess = false
        private func finishLoading() {
            navigationTimeout?.cancel()
            loading?.isHidden = true
        }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            loading?.isHidden = false
            spinner?.startAnimating()
            loadingLabel?.text = "Opening Fino…"
            retryButton?.isHidden = true
            if let loading { webView.bringSubviewToFront(loading) }
            navigationTimeout?.cancel()
            let timeout = DispatchWorkItem { [weak self] in
                guard let self else { return }
                self.web?.stopLoading()
                self.showConnectionError()
            }
            navigationTimeout = timeout
            #if targetEnvironment(simulator)
            let timeoutSeconds: Double = 120 // The first simulator WebKit launch compiles its graphics pipeline.
            #else
            let timeoutSeconds: Double = 30
            #endif
            DispatchQueue.main.asyncAfter(deadline: .now() + timeoutSeconds, execute: timeout)
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { finishLoading() }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            if !recoveredWebProcess { recoveredWebProcess = true; webView.reload() }
            else { showConnectionError() }
        }
        private func showConnectionError() {
            finishLoading()
            loading?.isHidden = false
            spinner?.stopAnimating()
            loadingLabel?.text = "Let's reconnect\nCheck your internet connection and try again."
            retryButton?.isHidden = false
            if let web, let loading { web.bringSubviewToFront(loading) }
        }
        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            web?.window ?? ASPresentationAnchor()
        }
        private func showLoginError(_ message: String) {
            finishLoading()
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
                        DispatchQueue.main.async { web.load(URLRequest(url: workspace, cachePolicy: .reloadIgnoringLocalCacheData)) }
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
            if let url = navigationAction.request.url, ["https", "http", "mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
            return nil
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            showConnectionError()
        }
    }
}
