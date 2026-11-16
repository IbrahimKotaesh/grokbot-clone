import SwiftUI

@main
struct FinoApp: App {
    var body: some Scene {
        WindowGroup { WorkspaceView().ignoresSafeArea(.container, edges: .bottom) }
    }
}
