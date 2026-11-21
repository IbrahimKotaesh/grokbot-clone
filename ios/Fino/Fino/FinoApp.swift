import SwiftUI

@main
struct FinoApp: App {
    var body: some Scene {
        WindowGroup { WorkspaceView()
                .background(Color(red: 0.035, green: 0.043, blue: 0.059).ignoresSafeArea())
                .preferredColorScheme(.dark)
                .ignoresSafeArea(.container, edges: .bottom) }
    }
}
