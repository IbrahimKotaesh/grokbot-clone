import AppKit
import WebKit
import AuthenticationServices
import CryptoKit
import ScreenCaptureKit
import ApplicationServices

let workspace = URL(string: Bundle.main.object(forInfoDictionaryKey: "FinoWorkspaceURL") as? String ?? "https://grokbot.89-167-54-211.sslip.io")!
func jsonString(_ value: Any) -> String { String(data: try! JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]), encoding: .utf8)! }
func failure(_ message: String) -> NSError { NSError(domain: "Fino", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
func png(_ image: CGImage, width: Int, height: Int) throws -> Data {
    guard let context = CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:0,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else { throw failure("Screenshot unavailable") }
    context.draw(image,in:CGRect(x:0,y:0,width:width,height:height))
    let rep = NSBitmapImageRep(cgImage:context.makeImage()!)
    guard let data=rep.representation(using:.png,properties:[:]),data.count <= 3*1024*1024 else {throw failure("Screenshot exceeds 3 MB")};return data
}
@MainActor final class FinoApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, ASWebAuthenticationPresentationContextProviding, URLSessionTaskDelegate, NSToolbarDelegate, NSSplitViewDelegate, WKScriptMessageHandler {
    var window:NSWindow!,web:WKWebView!,browser:WKWebView!,serverView:WKWebView!
    var split:NSSplitView!,panel:NSView!,panelContent:NSView!,paneTitle:NSTextField!,address:NSTextField!,browserControls:NSStackView!,macPreview:NSImageView!,placeholder:NSTextField!
    var selectedBotID:String?
    var control:NSButton!,mode:NSPopUpButton!,status:NSTextField!
    var socket:URLSessionWebSocketTask?,connectionSession:URLSession?,authentication:ASWebAuthenticationSession?
    var actionTask:Task<Void,Never>?
    var expires:Date?,queue:[[String:Any]]=[],running=false,connected=false
    var currentDeadline=Date.distantFuture
    var screenSize=CGSize(width:1280,height:800)
    let selfTest=CommandLine.arguments.contains("--self-test")
    func applicationDidFinishLaunching(_ notification:Notification){
        NSApp.setActivationPolicy(.regular)
        let menu=NSMenu(),appMenu=NSMenu();let item=NSMenuItem();item.submenu=appMenu;menu.addItem(item)
        appMenu.addItem(withTitle:"About Fino",action:#selector(about),keyEquivalent:"")
        appMenu.addItem(withTitle:"Sign in…",action:#selector(login),keyEquivalent:"")
        appMenu.addItem(withTitle:"Reload",action:#selector(reload),keyEquivalent:"r")
        appMenu.addItem(withTitle:"Stop local control",action:#selector(stopControl),keyEquivalent:".")
        appMenu.addItem(.separator());appMenu.addItem(withTitle:"Quit Fino",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        let edit=NSMenuItem();let editMenu=NSMenu(title:"Edit");edit.submenu=editMenu;menu.addItem(edit)
        for (title,selector,key) in [("Undo","undo:","z"),("Cut","cut:","x"),("Copy","copy:","c"),("Paste","paste:","v"),("Select All","selectAll:","a")] {editMenu.addItem(withTitle:title,action:Selector(selector),keyEquivalent:key)}
        for entry in appMenu.items where entry.action != #selector(NSApplication.terminate(_:)){entry.target=self}
        NSApp.mainMenu=menu
        let visible=NSScreen.main?.visibleFrame ?? NSRect(x:0,y:0,width:1440,height:900)
        window=NSWindow(contentRect:NSRect(x:0,y:0,width:min(1380,visible.width*0.94),height:min(900,visible.height*0.94)),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title="Fino";window.titleVisibility = .hidden;window.titlebarAppearsTransparent=true;window.toolbarStyle = .unifiedCompact
        window.appearance=NSAppearance(named:.darkAqua);window.backgroundColor=NSColor(red:0.045,green:0.055,blue:0.075,alpha:1)
        window.minSize=NSSize(width:850,height:600);window.center();window.isReleasedWhenClosed=false
        mode=NSPopUpButton();mode.addItems(withTitles:["Server","Local Browser","This Mac"]);mode.target=self;mode.action=#selector(environmentChanged);mode.setAccessibilityLabel("Execution environment");mode.toolTip="Choose where the bot works. Your conversations stay on the Fino server."
        control=NSButton(title:"Open computer",target:self,action:#selector(toggleControl));control.bezelStyle = .rounded
        status=NSTextField(labelWithString:"Linux · Server");status.font = .systemFont(ofSize:11);status.textColor = .secondaryLabelColor;status.lineBreakMode = .byTruncatingTail
        let toolbar=NSToolbar(identifier:"FinoWorkspaceToolbar");toolbar.delegate=self;toolbar.displayMode = .iconOnly;toolbar.allowsUserCustomization=false;window.toolbar=toolbar
        let root=NSView();root.userInterfaceLayoutDirection = .leftToRight;window.contentView=root
        split=NSSplitView();split.userInterfaceLayoutDirection = .leftToRight;split.isVertical=true;split.dividerStyle = .thin;split.delegate=self;split.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(split)
        let cfg=WKWebViewConfiguration();cfg.websiteDataStore = .default();cfg.userContentController.add(self,name:"finoUI")
        cfg.userContentController.addUserScript(WKUserScript(source:"window.__FINO_DESKTOP__=true;window.__finoDesktopState={environment:'server',connected:false,panelOpen:false};(()=>{const mark=()=>{if(document.documentElement)document.documentElement.dataset.finoDesktop='true'};mark();document.addEventListener('DOMContentLoaded',mark,{once:true})})();",injectionTime:.atDocumentStart,forMainFrameOnly:true))
        web=WKWebView(frame:.zero,configuration:cfg);web.navigationDelegate=self;web.uiDelegate=self;web.setValue(false,forKey:"drawsBackground")
        web.autoresizingMask=[.width,.height];split.addArrangedSubview(web)
        panel=NSView(frame:NSRect(x:0,y:0,width:500,height:800));panel.userInterfaceLayoutDirection = .leftToRight;panel.autoresizingMask=[.height];panel.wantsLayer=true;panel.layer?.backgroundColor=NSColor(red:0.045,green:0.055,blue:0.075,alpha:1).cgColor;split.addArrangedSubview(panel);panel.isHidden=true
        buildPanel()
        NSLayoutConstraint.activate([split.topAnchor.constraint(equalTo:root.topAnchor),split.leadingAnchor.constraint(equalTo:root.leadingAnchor),split.trailingAnchor.constraint(equalTo:root.trailingAnchor),split.bottomAnchor.constraint(equalTo:root.bottomAnchor)])
        window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
        web.load(URLRequest(url:workspace));if selfTest { Task { await testBrowser() } }
        Timer.scheduledTimer(withTimeInterval:1,repeats:true){[weak self] _ in Task { @MainActor in if let e=self?.expires,e<Date(){self?.stopControl()} }}
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{true}
    func applicationWillTerminate(_ notification:Notification){stopControl()}
    @objc func reload(){web.reload()}
    @objc func about(){let alert=NSAlert();alert.messageText="Fino for Mac";alert.informativeText="Your Fino workspace, plus an opt-in local browser or Mac control session. Local control stops after 30 minutes, when you press Stop, or when the app closes.";alert.runModal()}
    @objc func stopControl(){actionTask?.cancel();actionTask=nil;socket?.cancel(with:.goingAway,reason:nil);socket=nil;connectionSession?.invalidateAndCancel();connectionSession=nil;connected=false;expires=nil;queue=[];control?.title=mode?.indexOfSelectedItem==0 ? "Open computer":"Connect";mode?.isEnabled=true;status?.stringValue=mode?.indexOfSelectedItem==0 ? "Linux · Server":"Not connected";emitDesktopState()}
    @objc func toggleControl(){
        if mode.indexOfSelectedItem==0{showWorkspace();return}
        if socket != nil {stopControl();return}
        let mac=mode.indexOfSelectedItem==2
        let alert=NSAlert();alert.messageText=mac ? "Allow Fino to control this Mac?" : "Allow Fino to use its local browser?"
        alert.informativeText=mac ? "Only bots responding to your direct messages can request actions for 30 minutes. Your bot’s configured permission mode still applies. Screen images are sent to your Fino server and selected model. Background routines cannot use this session. Press Stop or ⌘. to disconnect." : "For 30 minutes, bots responding to your direct messages can browse in Fino’s separate browser window. Its page screenshots are sent to your Fino server and selected model. Other Mac apps are not controlled. Press Stop or ⌘. to disconnect."
        alert.addButton(withTitle:"Allow this session");alert.addButton(withTitle:"Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        if mac {
            let options=[kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String:true] as CFDictionary
            let accessibility=AXIsProcessTrustedWithOptions(options),capture=CGPreflightScreenCaptureAccess()
            if !capture {_ = CGRequestScreenCaptureAccess()}
            guard accessibility && capture else {status.stringValue="Enable Accessibility + Screen Recording in macOS Settings, then try again.";return}
        } else {ensureBrowser()}
        web.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in DispatchQueue.main.async {
            guard let self else{return}
            let valid=cookies.filter{cookie in let domain=cookie.domain.trimmingCharacters(in:CharacterSet(charactersIn:"."));return domain==workspace.host && (cookie.expiresDate ?? .distantFuture)>Date()}
            guard valid.contains(where:{$0.name=="grokbot_session"}) else{self.status.stringValue="Sign in to Fino first";self.login();return}
            var parts=URLComponents(url:workspace,resolvingAgainstBaseURL:false)!;parts.scheme="wss";parts.path="/api/desktop/connect";parts.queryItems=[URLQueryItem(name:"mode",value:mac ? "mac":"browser")]
            var req=URLRequest(url:parts.url!);req.setValue(valid.map{"\($0.name)=\($0.value)"}.joined(separator:"; "),forHTTPHeaderField:"Cookie");req.setValue(workspace.absoluteString,forHTTPHeaderField:"Origin")
            self.connectionSession=URLSession(configuration:.ephemeral);let ws=self.connectionSession!.webSocketTask(with:req);self.socket=ws;self.control.title="Stop";self.status.stringValue="Connecting…";self.emitDesktopState();ws.resume();self.receive(ws)
        }}
    }
    func receive(_ ws:URLSessionWebSocketTask){ws.receive{[weak self] response in Task { @MainActor in
        guard let self,self.socket===ws else{return}
        switch response{
        case .failure: self.stopControl();self.status.stringValue="Disconnected — sign in or reconnect to enable control"
        case .success(let message):
            let data:Data;switch message{case .data(let d):data=d;case .string(let s):data=Data(s.utf8);@unknown default:return}
            if let obj=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] {
                if obj["type"] as? String=="connected" {self.connected=true;self.expires=Date(timeIntervalSince1970:(obj["expires"] as? Double ?? 0)/1000);self.status.stringValue="Connected · Local";self.emitDesktopState()}
                else if self.connected,obj["id"] is String {self.queue.append(obj);self.drain()}
            };self.receive(ws)
        }
    }}}
    func drain(){guard !running,!queue.isEmpty else{return};running=true;let message=queue.removeFirst();let ws=socket;currentDeadline=Date(timeIntervalSince1970:(message["deadline"] as? Double ?? 0)/1000)
        actionTask=Task { @MainActor in
            var reply:[String:Any] = ["id":message["id"] ?? ""]
            do{guard let ws,self.socket===ws,self.connected,let e=self.expires,e>Date() else{throw failure("Local control is off")};reply["result"]=try await perform(message["action"] as? String ?? "",message["args"] as? [String:Any] ?? [:])}
            catch{reply["error"]=error.localizedDescription}
            if let ws,self.socket===ws {try? await ws.send(.string(jsonString(reply)))}
            self.running=false;self.drain()
        }
    }
    func toolbarAllowedItemIdentifiers(_ toolbar:NSToolbar)->[NSToolbarItem.Identifier]{[.init("environment"),.init("status"),.flexibleSpace,.init("control"),.init("workspace")]}
    func toolbarDefaultItemIdentifiers(_ toolbar:NSToolbar)->[NSToolbarItem.Identifier]{toolbarAllowedItemIdentifiers(toolbar)}
    func toolbar(_ toolbar:NSToolbar,itemForItemIdentifier identifier:NSToolbarItem.Identifier,willBeInsertedIntoToolbar flag:Bool)->NSToolbarItem?{
        let item=NSToolbarItem(itemIdentifier:identifier)
        switch identifier.rawValue {
        case "environment":let label=NSTextField(labelWithString:"Environment");label.font = .systemFont(ofSize:11,weight:.medium);label.textColor = .secondaryLabelColor;let row=NSStackView(views:[label,mode]);row.spacing=9;mode.widthAnchor.constraint(equalToConstant:155).isActive=true;item.view=row;item.label="Environment"
        case "status":status.widthAnchor.constraint(equalToConstant:130).isActive=true;item.view=status;item.label="Connection"
        case "control":item.view=control;item.label="Control"
        case "workspace":let button=NSButton(image:NSImage(systemSymbolName:"sidebar.right",accessibilityDescription:"Show workspace")!,target:self,action:#selector(toggleWorkspace));button.bezelStyle = .rounded;button.toolTip="Show or hide the workspace on the right";button.setAccessibilityLabel("Toggle workspace panel");item.view=button;item.label="Workspace"
        default:return nil
        };return item
    }
    func splitView(_ splitView:NSSplitView,constrainMinCoordinate proposedMinimumPosition:CGFloat,ofSubviewAt dividerIndex:Int)->CGFloat{650}
    func splitView(_ splitView:NSSplitView,constrainMaxCoordinate proposedMaximumPosition:CGFloat,ofSubviewAt dividerIndex:Int)->CGFloat{splitView.bounds.width-360}
    func buildPanel(){
        let header=NSStackView();header.orientation = .horizontal;header.spacing=8;header.translatesAutoresizingMaskIntoConstraints=false
        paneTitle=NSTextField(labelWithString:"Workspace");paneTitle.font = .systemFont(ofSize:12,weight:.semibold)
        let spacer=NSView();spacer.setContentHuggingPriority(.defaultLow,for:.horizontal)
        let close=NSButton(image:NSImage(systemSymbolName:"xmark",accessibilityDescription:"Close workspace")!,target:self,action:#selector(hideWorkspace));close.bezelStyle = .inline;close.setAccessibilityLabel("Close workspace panel")
        [paneTitle!,spacer,close].forEach{header.addArrangedSubview($0)}
        browserControls=NSStackView();browserControls.orientation = .horizontal;browserControls.spacing=5;browserControls.translatesAutoresizingMaskIntoConstraints=false
        for (icon,selector,label) in [("chevron.left",#selector(browserBack),"Back"),("chevron.right",#selector(browserForward),"Forward"),("arrow.clockwise",#selector(browserReload),"Reload page")]{let button=NSButton(image:NSImage(systemSymbolName:icon,accessibilityDescription:label)!,target:self,action:selector);button.bezelStyle = .inline;button.setAccessibilityLabel(label);browserControls.addArrangedSubview(button)}
        address=NSTextField();address.placeholderString="Enter a URL";address.font = .systemFont(ofSize:11);address.bezelStyle = .roundedBezel;address.target=self;address.action=#selector(browserNavigate);address.setAccessibilityLabel("Browser address");browserControls.addArrangedSubview(address)
        panelContent=NSView();panelContent.translatesAutoresizingMaskIntoConstraints=false
        macPreview=NSImageView();macPreview.imageScaling = .scaleProportionallyUpOrDown;macPreview.frame=panelContent.bounds;macPreview.autoresizingMask=[.width,.height];panelContent.addSubview(macPreview)
        placeholder=NSTextField(wrappingLabelWithString:"Connect This Mac above to preview the main display.");placeholder.textColor = .secondaryLabelColor;placeholder.alignment = .center;placeholder.translatesAutoresizingMaskIntoConstraints=false;panelContent.addSubview(placeholder)
        [header,browserControls!,panelContent!].forEach{panel.addSubview($0)}
        NSLayoutConstraint.activate([header.topAnchor.constraint(equalTo:panel.topAnchor,constant:10),header.leadingAnchor.constraint(equalTo:panel.leadingAnchor,constant:14),header.trailingAnchor.constraint(equalTo:panel.trailingAnchor,constant:-12),header.heightAnchor.constraint(equalToConstant:26),browserControls.topAnchor.constraint(equalTo:header.bottomAnchor,constant:6),browserControls.leadingAnchor.constraint(equalTo:panel.leadingAnchor,constant:12),browserControls.trailingAnchor.constraint(equalTo:panel.trailingAnchor,constant:-12),browserControls.heightAnchor.constraint(equalToConstant:28),address.widthAnchor.constraint(greaterThanOrEqualToConstant:120),panelContent.topAnchor.constraint(equalTo:browserControls.bottomAnchor,constant:8),panelContent.leadingAnchor.constraint(equalTo:panel.leadingAnchor),panelContent.trailingAnchor.constraint(equalTo:panel.trailingAnchor),panelContent.bottomAnchor.constraint(equalTo:panel.bottomAnchor),placeholder.centerXAnchor.constraint(equalTo:panelContent.centerXAnchor),placeholder.centerYAnchor.constraint(equalTo:panelContent.centerYAnchor),placeholder.widthAnchor.constraint(lessThanOrEqualToConstant:260)])
    }
    func showPanel(){
        guard panel.isHidden else{return};panel.isHidden=false;window.minSize=NSSize(width:1120,height:650)
        if window.frame.width<1120{var frame=window.frame;frame.size.width=1120;if let visible=window.screen?.visibleFrame{frame.origin.x=min(frame.origin.x,visible.maxX-1120)};window.setFrame(frame,display:true,animate:true)}
        window.contentView?.layoutSubtreeIfNeeded();split.adjustSubviews();split.setPosition(max(650,split.bounds.width-500),ofDividerAt:0);emitDesktopState()
    }
    @objc func hideWorkspace(){suspendServerPreview();panel.isHidden=true;window.minSize=NSSize(width:850,height:600);split.adjustSubviews();emitDesktopState()}
    @objc func toggleWorkspace(){if panel.isHidden{showWorkspace()}else{hideWorkspace()}}
    @objc func environmentChanged(){stopControl();showWorkspace();emitDesktopState()}
    func showWorkspace(){
        if mode.indexOfSelectedItem==1{ensureBrowser();return}
        showPanel();browser?.isHidden=true;browserControls.isHidden=true
        if mode.indexOfSelectedItem==0 {
            paneTitle.stringValue="Server computer · Linux";macPreview.isHidden=true;placeholder.isHidden=true
            if serverView==nil{let config=WKWebViewConfiguration();config.websiteDataStore = .default();config.userContentController.add(self,name:"finoPane");config.userContentController.addUserScript(WKUserScript(source:"window.addEventListener('fino-close-computer',()=>window.webkit.messageHandlers.finoPane.postMessage({action:'close'}));",injectionTime:.atDocumentStart,forMainFrameOnly:true));serverView=WKWebView(frame:panelContent.bounds,configuration:config);serverView.autoresizingMask=[.width,.height];serverView.navigationDelegate=self;serverView.uiDelegate=self;serverView.setValue(false,forKey:"drawsBackground");panelContent.addSubview(serverView)}
            serverView.isHidden=false;var parts=URLComponents(url:workspace,resolvingAgainstBaseURL:false)!;parts.queryItems=[URLQueryItem(name:"desktop_view",value:"1")];if let bot=selectedBotID{parts.queryItems?.append(URLQueryItem(name:"bot",value:bot))};if serverView.url != parts.url{serverView.load(URLRequest(url:parts.url!))}
        }else{suspendServerPreview();paneTitle.stringValue="This Mac · Main display";serverView?.isHidden=true;macPreview.isHidden=false;placeholder.isHidden=macPreview.image != nil}
        emitDesktopState()
    }
    func suspendServerPreview(){if serverView?.url?.scheme=="https"{serverView?.loadHTMLString("<html><body style='background:#0c0f15'></body></html>",baseURL:nil)}}
    func ensureBrowser(){
        suspendServerPreview();showPanel();paneTitle.stringValue="Local Browser";browserControls.isHidden=false;serverView?.isHidden=true;macPreview.isHidden=true;placeholder.isHidden=true
        if browser==nil{let config=WKWebViewConfiguration();config.websiteDataStore=WKWebsiteDataStore(forIdentifier:UUID(uuidString:"0FB17465-9FA6-46CF-A98F-60EA1BFEB651")!);browser=WKWebView(frame:panelContent.bounds,configuration:config);browser.autoresizingMask=[.width,.height];browser.navigationDelegate=self;browser.uiDelegate=self;panelContent.addSubview(browser);browser.loadHTMLString("<html><body style='font:15px -apple-system;padding:36px;background:#10151e;color:#e7edf8'><h2>Local Browser</h2><p>Browse here, or connect above to let your agent work in this panel.</p></body></html>",baseURL:nil)}
        browser.isHidden=false;emitDesktopState()
    }
    @objc func browserBack(){browser?.goBack()}
    @objc func browserForward(){browser?.goForward()}
    @objc func browserReload(){browser?.reload()}
    @objc func browserNavigate(){let raw=address.stringValue;let value=raw.contains("://") ? raw:"https://"+raw;Task {do{try await browserAction("open_browser",["url":value])}catch{address.toolTip=error.localizedDescription}}}
    func emitDesktopState(){guard web != nil else{return};let value:[String:Any]=["environment":mode.indexOfSelectedItem==0 ? "server":mode.indexOfSelectedItem==1 ? "browser":"mac","connected":connected,"panelOpen":!panel.isHidden];web.evaluateJavaScript("window.__finoDesktopState=\(jsonString(value));window.dispatchEvent(new Event('fino-desktop-state'));",completionHandler:nil)}
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage){
        guard message.frameInfo.isMainFrame,message.frameInfo.securityOrigin.host==workspace.host,message.frameInfo.securityOrigin.protocol=="https",let body=message.body as? [String:Any] else{return}
        if message.webView===web,let action=body["action"] as? String {if let bot=body["botId"] as? String,bot.range(of:"^[A-Za-z0-9_-]{1,100}$",options:.regularExpression) != nil{selectedBotID=bot};if action=="showComputer"{showWorkspace()}}
        if message.webView===serverView,body["action"] as? String=="close"{hideWorkspace()}
    }
    func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){if webView===web{emitDesktopState()}else if webView===browser{address.stringValue=browser.url?.scheme=="about" ? "":browser.url?.absoluteString ?? ""}}
    func evaluate(_ script:String)async throws->Any?{try await withCheckedThrowingContinuation{continuation in browser.evaluateJavaScript(script){value,error in if let error{continuation.resume(throwing:error)}else{continuation.resume(returning:value)}}}}
    func browserSnapshot()async throws->[String:Any]{
        let image:NSImage=try await withCheckedThrowingContinuation{continuation in let config=WKSnapshotConfiguration();config.afterScreenUpdates=true;browser.takeSnapshot(with:config){image,error in if let image{continuation.resume(returning:image)}else{continuation.resume(throwing:error ?? failure("Browser screenshot failed"))}}}
        guard let cg=image.cgImage(forProposedRect:nil,context:nil,hints:nil) else{throw failure("Browser image unavailable")}
        let width=Int(browser.bounds.width),height=Int(browser.bounds.height);let data=try png(cg,width:width,height:height)
        return ["image":data.base64EncodedString(),"width":width,"height":height,"mime_type":"image/png"]
    }
    func macSnapshot()async throws->[String:Any]{
        guard CGPreflightScreenCaptureAccess() else{throw failure("Screen Recording permission is required")}
        let content=try await SCShareableContent.excludingDesktopWindows(false,onScreenWindowsOnly:true)
        guard let display=content.displays.first(where:{$0.displayID==CGMainDisplayID()}) else{throw failure("Main display unavailable")}
        let bounds=CGDisplayBounds(display.displayID),width=min(1280,Int(bounds.width)),height=Int(Double(width)*bounds.height/bounds.width)
        let configuration=SCStreamConfiguration();configuration.width=width;configuration.height=height;configuration.showsCursor=true
        let image=try await SCScreenshotManager.captureImage(contentFilter:SCContentFilter(display:display,excludingWindows:[]),configuration:configuration)
        macPreview.image=NSImage(cgImage:image,size:NSSize(width:width,height:height));placeholder.isHidden=true;screenSize=CGSize(width:width,height:height);return ["image":try png(image,width:width,height:height).base64EncodedString(),"width":width,"height":height,"mime_type":"image/png"]
    }
    func perform(_ action:String,_ args:[String:Any])async throws->[String:Any]{
        guard ["computer_screenshot","computer_click","computer_type","computer_key","computer_scroll","computer_drag","open_browser"].contains(action) else{throw failure("Unsupported action")}
        guard currentDeadline>Date() else{throw failure("This action expired; ask your bot to retry")}
        let mac=mode.indexOfSelectedItem==2
        if mac && action != "computer_screenshot" {
            let protected=["com.apple.systempreferences","com.apple.SecurityAgent","com.apple.keychainaccess","com.apple.Terminal","com.googlecode.iterm2","com.apple.ScriptEditor2"]
            let previousApplication=NSWorkspace.shared.frontmostApplication
            if let front=previousApplication?.bundleIdentifier,protected.contains(front){throw failure("Handle security settings and command-line apps yourself; Fino will not control them")}

        }
        if mac {try await macAction(action,args);return try await macSnapshot()}
        ensureBrowser();try await browserAction(action,args);return try await browserSnapshot()
    }
    func browserAction(_ action:String,_ a:[String:Any])async throws{
        if action=="computer_screenshot" {return}
        if action=="open_browser" {
            guard let raw=a["url"] as? String,let url=URL(string:raw),["http","https"].contains(url.scheme ?? ""),url.user==nil,url.password==nil else{throw failure("Only HTTP/HTTPS URLs are supported")}
            address.stringValue=url.absoluteString;browser.load(URLRequest(url:url));try await Task.sleep(nanoseconds:350_000_000);let end=Date().addingTimeInterval(20);while browser.isLoading && Date()<end {try await Task.sleep(nanoseconds:200_000_000)}
        }else if action=="computer_click" {
            guard a["button"] as? String != "right",a["button"] as? String != "middle" else{throw failure("Browser mode supports left clicks; use Mac mode for context menus")}
            let x=a["x"] as? Double ?? -1,y=a["y"] as? Double ?? -1;try browserPoint(x,y)
            let script="(()=>{const e=document.elementFromPoint(\(x),\(y));if(!e)throw Error('No element at that position');e.focus();e.click();\((a["double"] as? Bool == true) ? "e.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));":"")return true})()"
            _=try await evaluate(script)
        }else if action=="computer_type" {
            let text=a["text"] as? String ?? "";guard text.count<=10000 else{throw failure("Text too long")}
            _=try await evaluate("(()=>{const e=document.activeElement,t=\(jsonString(text));if(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement){const p=e instanceof HTMLInputElement?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;const s=Object.getOwnPropertyDescriptor(p,'value').set;s.call(e,e.value+t);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true}if(e.isContentEditable){document.execCommand('insertText',false,t);return true}throw Error('Focus a text field first')})()")
        }else if action=="computer_key" {
            let key=String(a["keys"] as? String ?? "").lowercased()
            if ["return","enter"].contains(key){_ = try await evaluate("(()=>{const e=document.activeElement;if(e.form){e.form.requestSubmit();return true}e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));return true})()")}
            else if key=="ctrl+a"||key=="cmd+a" { _=try await evaluate("(()=>{const e=document.activeElement;if(e.select)e.select();else document.execCommand('selectAll');return true})()") }
            else if key=="backspace" { _=try await evaluate("(()=>{const e=document.activeElement;if(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement){e.setRangeText('',e.selectionStart||Math.max(0,e.value.length-1),e.selectionEnd||e.value.length,'end');e.dispatchEvent(new Event('input',{bubbles:true}));return true}throw Error('Focus a text field first')})()") }
            else {throw failure("This browser shortcut is not supported yet; use clicks or Mac mode")}
        }else if action=="computer_scroll" {let delta=min(10,max(0,a["amount"] as? Double ?? 3))*120*(a["direction"] as? String=="up" ? -1:1);_ = try await evaluate("window.scrollBy(0,\(delta));true")}
        else {throw failure("Drag is available in Mac mode, not DOM browser mode")}
        try await Task.sleep(nanoseconds:650_000_000)
    }
    func browserPoint(_ x:Double,_ y:Double)throws{guard x>=0,y>=0,x<browser.bounds.width,y<browser.bounds.height else{throw failure("Point outside the browser screenshot")}}
    func macPoint(_ x:Double,_ y:Double)throws->CGPoint{guard x>=0,y>=0,x<screenSize.width,y<screenSize.height else{throw failure("Point outside the main display")};let bounds=CGDisplayBounds(CGMainDisplayID());return CGPoint(x:bounds.origin.x+x*bounds.width/screenSize.width,y:bounds.origin.y+y*bounds.height/screenSize.height)}
    func macAction(_ action:String,_ a:[String:Any])async throws{
        guard AXIsProcessTrusted() else{throw failure("Accessibility permission is required")}
        if action=="computer_screenshot" {return}
        if action=="open_browser" {guard let raw=a["url"] as? String,let url=URL(string:raw),["http","https"].contains(url.scheme ?? ""),url.user==nil,url.password==nil else{throw failure("Invalid browser URL")};NSWorkspace.shared.open(url)}
        else if action=="computer_type" {let text=a["text"] as? String ?? "";guard text.count<=10000 else{throw failure("Text too long")};if text.isEmpty{return};let units=Array(text.utf16);let event=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:true)!;units.withUnsafeBufferPointer{event.keyboardSetUnicodeString(stringLength:units.count,unicodeString:$0.baseAddress!)};event.post(tap:.cghidEventTap);CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:false)?.post(tap:.cghidEventTap)}
        else if action=="computer_click" {let point=try macPoint(a["x"] as? Double ?? -1,a["y"] as? Double ?? -1);let right=a["button"] as? String=="right",button:CGMouseButton=right ? .right:.left
            for n in 1...((a["double"] as? Bool == true) ? 2:1){for down in [true,false]{let event=CGEvent(mouseEventSource:nil,mouseType:right ? (down ? .rightMouseDown:.rightMouseUp):(down ? .leftMouseDown:.leftMouseUp),mouseCursorPosition:point,mouseButton:button);event?.setIntegerValueField(.mouseEventClickState,value:Int64(n));event?.post(tap:.cghidEventTap)}}
        }else if action=="computer_scroll" {let delta=Int32(min(10,max(0,a["amount"] as? Double ?? 3)))*(a["direction"] as? String=="up" ? 1:-1);CGEvent(scrollWheelEvent2Source:nil,units:.line,wheelCount:1,wheel1:delta,wheel2:0,wheel3:0)?.post(tap:.cghidEventTap)}
        else if action=="computer_drag" {let start=try macPoint(a["start_x"] as? Double ?? -1,a["start_y"] as? Double ?? -1),end=try macPoint(a["end_x"] as? Double ?? -1,a["end_y"] as? Double ?? -1);CGEvent(mouseEventSource:nil,mouseType:.leftMouseDown,mouseCursorPosition:start,mouseButton:.left)?.post(tap:.cghidEventTap);defer{CGEvent(mouseEventSource:nil,mouseType:.leftMouseUp,mouseCursorPosition:end,mouseButton:.left)?.post(tap:.cghidEventTap)};for n in 1...12 {let t=Double(n)/12;CGEvent(mouseEventSource:nil,mouseType:.leftMouseDragged,mouseCursorPosition:CGPoint(x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t),mouseButton:.left)?.post(tap:.cghidEventTap);try await Task.sleep(nanoseconds:20_000_000)};CGEvent(mouseEventSource:nil,mouseType:.leftMouseUp,mouseCursorPosition:end,mouseButton:.left)?.post(tap:.cghidEventTap)}
        else if action=="computer_key" {let name=(a["keys"] as? String ?? "").lowercased();let pieces=name.split(separator:"+").map(String.init),last=pieces.last ?? "";let keys:[String:CGKeyCode]=["return":36,"enter":36,"tab":48,"escape":53,"backspace":51,"space":49,"left":123,"right":124,"down":125,"up":126,"a":0,"c":8,"v":9,"l":37,"t":17,"w":13]
            guard let code=keys[last] else{throw failure("Unsupported Mac key")};var flags:CGEventFlags=[];for part in pieces.dropLast(){switch part{case "cmd","meta","super":flags.insert(.maskCommand);case "ctrl","control":flags.insert(.maskControl);case "alt","option":flags.insert(.maskAlternate);case "shift":flags.insert(.maskShift);default:throw failure("Unsupported modifier")}}
            for down in [true,false]{let event=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:down);event?.flags=flags;event?.post(tap:.cghidEventTap)}
        }
        try await Task.sleep(nanoseconds:700_000_000)
    }
    func presentationAnchor(for session:ASWebAuthenticationSession)->ASPresentationAnchor{window}
    @objc func login(){
        let verifier=Data((0..<32).map{_ in UInt8.random(in:0...255)}).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        let challenge=Data(SHA256.hash(data:Data(verifier.utf8))).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        var parts=URLComponents(url:workspace.appendingPathComponent("api/auth/google/start"),resolvingAgainstBaseURL:false)!;parts.queryItems=[URLQueryItem(name:"native_challenge",value:challenge)]
        authentication=ASWebAuthenticationSession(url:parts.url!,callbackURLScheme:"fino"){[weak self] callback,error in Task { @MainActor in
            guard let self else{return};self.authentication=nil
            guard error==nil,let callback,callback.host=="auth",let code=URLComponents(url:callback,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name=="code"})?.value else{self.status.stringValue="Sign-in cancelled or failed";return}
            var req=URLRequest(url:workspace.appendingPathComponent("api/auth/native/exchange"));req.httpMethod="POST";req.setValue("application/x-www-form-urlencoded",forHTTPHeaderField:"Content-Type");req.setValue(workspace.absoluteString,forHTTPHeaderField:"Origin");var form=URLComponents();form.queryItems=[URLQueryItem(name:"code",value:code),URLQueryItem(name:"verifier",value:verifier)];req.httpBody=form.percentEncodedQuery?.data(using:.utf8)
            let session=URLSession(configuration:.ephemeral,delegate:self,delegateQueue:nil)
            do{let (_,response)=try await session.data(for:req);guard let http=response as? HTTPURLResponse,http.statusCode==303 else{throw failure("Sign-in exchange failed")};let headers=http.allHeaderFields.reduce(into:[String:String]()){if let k=$1.key as? String,let v=$1.value as? String{$0[k]=v}};let cookies=HTTPCookie.cookies(withResponseHeaderFields:headers,for:workspace);guard let cookie=cookies.first(where:{$0.name=="grokbot_session"}) else{throw failure("Sign-in cookie missing")};await self.web.configuration.websiteDataStore.httpCookieStore.setCookie(cookie);self.web.load(URLRequest(url:workspace));self.serverView?.reload();self.status.stringValue="Signed in";self.emitDesktopState()}catch{self.status.stringValue=error.localizedDescription};session.finishTasksAndInvalidate()
        }};authentication?.presentationContextProvider=self;_ = authentication?.start()
    }
    nonisolated func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void){completionHandler(nil)}
    func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
        guard let url=navigationAction.request.url else{decisionHandler(.cancel);return}
        if webView===web || webView===serverView {if url.host==workspace.host && url.path=="/api/auth/google/start"{decisionHandler(.cancel);login();return};if url.host != workspace.host {decisionHandler(.cancel);if ["https","http"].contains(url.scheme ?? ""){NSWorkspace.shared.open(url)};return}}
        if !["https","http","about"].contains(url.scheme ?? "") {decisionHandler(.cancel);return};decisionHandler(.allow)
    }
    func webView(_ webView:WKWebView,createWebViewWith configuration:WKWebViewConfiguration,for navigationAction:WKNavigationAction,windowFeatures:WKWindowFeatures)->WKWebView?{if let url=navigationAction.request.url,["http","https"].contains(url.scheme ?? "") {if webView===browser {browser.load(URLRequest(url:url))}else{NSWorkspace.shared.open(url)}};return nil}
    func webView(_ webView:WKWebView,runJavaScriptAlertPanelWithMessage message:String,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping()->Void){completionHandler()}
    func webView(_ webView:WKWebView,runJavaScriptConfirmPanelWithMessage message:String,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping(Bool)->Void){completionHandler(false)}
    func testBrowser()async{
        do{
            mode.selectItem(at:1);control.title="Connect";ensureBrowser();browser.loadHTMLString("<html><body style='font:24px -apple-system;padding:32px;background:#101723;color:white'><h1>Fino local browser test</h1><input id='q' style='font:24px;width:400px;height:48px'><button style='font:24px' onclick=\"document.getElementById('result').textContent=document.getElementById('q').value\">Show result</button><p id='result'></p></body></html>",baseURL:nil)
            try await Task.sleep(nanoseconds:2_000_000_000)
            let bounds=try await evaluate("JSON.stringify((()=>{const r=document.querySelector('input').getBoundingClientRect();return {x:r.x+10,y:r.y+10}})())") as! String;let p=try JSONSerialization.jsonObject(with:Data(bounds.utf8)) as! [String:Any]
            try await browserAction("computer_click",p);try await browserAction("computer_type",["text":"Fino browser control works ✓"])
            let button=try await evaluate("JSON.stringify((()=>{const r=document.querySelector('button').getBoundingClientRect();return {x:r.x+10,y:r.y+10}})())") as! String;try await browserAction("computer_click",try JSONSerialization.jsonObject(with:Data(button.utf8)) as! [String:Any])
            guard try await evaluate("document.getElementById('result').textContent") as? String=="Fino browser control works ✓" else{throw failure("Browser input/click assertion failed")}
            guard browser.window===window,web.bounds.width>=650,browser.bounds.width>=360,panel.frame.minX>=web.frame.maxX else{throw failure("Workspace pane layout assertion failed")}
            let shot=try await browserSnapshot();try Data(base64Encoded:shot["image"] as! String)!.write(to:URL(fileURLWithPath:"/tmp/fino-mac-browser-test.png"))
            try Data(jsonString(["ok":true,"browserClick":true,"browserType":true,"screenshot":true,"macControlEnabled":false,"dockedBrowser":true,"mainPaneWidth":Int(web.bounds.width),"workspacePaneWidth":Int(browser.bounds.width)]).utf8).write(to:URL(fileURLWithPath:"/tmp/fino-mac-selftest.json"));status.stringValue="Preview · Not connected";emitDesktopState()
        }catch{try? Data(jsonString(["ok":false,"error":error.localizedDescription]).utf8).write(to:URL(fileURLWithPath:"/tmp/fino-mac-selftest.json"));status.stringValue="Self-test: \(error.localizedDescription)";try? Data(jsonString(["split":NSStringFromRect(split.frame),"panel":NSStringFromRect(panel.frame),"content":NSStringFromRect(panelContent.frame),"browser":NSStringFromRect(browser.frame),"window":NSStringFromRect(window.frame)]).utf8).write(to:URL(fileURLWithPath:"/tmp/fino-layout-debug.json"))}
    }
}
@main enum FinoMain {
 @MainActor static func main(){let app=NSApplication.shared;let delegate=FinoApp();app.delegate=delegate;withExtendedLifetime(delegate){app.run()}}
}
