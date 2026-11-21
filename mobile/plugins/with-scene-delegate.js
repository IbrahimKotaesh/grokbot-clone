const { withInfoPlist, withAppDelegate } = require("expo/config-plugins");
// Keep scene identity distinct from the legacy SwiftUI wrapper when upgrading.
module.exports = (config) => {
  config = withInfoPlist(config, (config) => {
    const roles =
      config.modResults.UIApplicationSceneManifest?.UISceneConfigurations;
    if (roles)
      for (const entries of Object.values(roles))
        for (const entry of entries)
          if (
            String(entry.UISceneDelegateClassName ?? "").endsWith(
              "SceneDelegate",
            )
          ) {
            entry.UISceneDelegateClassName = "SceneDelegate";
            entry.UISceneConfigurationName = "Fino Native";
          }
    return config;
  });
  return withAppDelegate(config, (config) => {
    if (!config.modResults.contents.includes("Fino Native"))
      config.modResults.contents = config.modResults.contents.replace(
        "  var window: UIWindow?",
        `  public func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Fino Native", sessionRole: session.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }

  var window: UIWindow?`,
      );
    if (!config.modResults.contents.includes("saved SwiftUI scene"))
      config.modResults.contents = config.modResults.contents.replace(
        "    // The window is created",
        '    // A saved SwiftUI scene may reconnect without invoking the new scene delegate.\n    // Attach React Native to that scene without deleting the user\'s app container.\n    NotificationCenter.default.addObserver(forName: UIScene.didActivateNotification, object: nil, queue: .main) { [weak self] notification in\n      guard let self, self.window == nil, let scene = notification.object as? UIWindowScene,\n            let factory = self.reactNativeFactory else { return }\n      let window = UIWindow(windowScene: scene)\n      self.window = window\n      factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)\n    }\n\n' +
          "    // The window is created",
      );
    return config;
  });
};
