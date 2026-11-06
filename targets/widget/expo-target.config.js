/**
 * Live Activity widget extension target (@bacons/apple-targets).
 *
 * The `widget` type links WidgetKit + SwiftUI + ActivityKit + AppIntents by
 * default. Swift sources in this folder build into the extension; files under
 * `_shared/` (StartingXIAttributes.swift) link into BOTH the widget and the
 * main app target, so the JS-side local-start path can construct the same
 * ActivityAttributes type.
 *
 * Brand colors are emitted into the target's Assets.xcassets and referenced in
 * SwiftUI as `Color("pointsGreen")` etc. — keep these in sync with
 * src/theme/tokens.js (dark theme).
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'StartingXIActivity',
  displayName: 'Starting XI Live',
  // Live Activities need 16.1+. Push-to-start (17.2+) is guarded at runtime.
  deploymentTarget: '16.2',
  entitlements: {
    'com.apple.security.application-groups':
      config.ios?.entitlements?.['com.apple.security.application-groups'] ?? [
        'group.com.novem.startingxi',
      ],
  },
  colors: {
    bgNavy: '#0A0E16',
    bandTop: '#1E2842',
    bandBottom: '#080B12',
    pointsGreen: '#34D399',
    captainGold: '#F5C543',
    liveRed: '#F03A3A',
    textMuted: '#93A0BC',
  },
});
