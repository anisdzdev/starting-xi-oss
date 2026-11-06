import ActivityKit
import SwiftUI
import WidgetKit

struct StartingXILiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: StartingXIAttributes.self) { context in
      // Lock Screen / banner
      LockScreenView(state: context.state)
        .activityBackgroundTint(Color("bgNavy"))
        .activitySystemActionForegroundColor(Color("pointsGreen"))
    } dynamicIsland: { context in
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          
        }
        DynamicIslandExpandedRegion(.trailing) {
          totalLabel(state.totalPoints)
        }
        DynamicIslandExpandedRegion(.bottom) {
          if state.layout == "focused", let match = state.matches.first {
            VStack(spacing: 10) {
              ScoreboardView(match: match)
              PlayerBadgesRow(players: state.players)
            }
            .padding(.top, 4)
          } else {
            VStack(spacing: 6) {
              ForEach(Array(state.matches.enumerated()), id: \.offset) { _, m in
                MatchRow(match: m)
              }
            }
            .padding(.top, 4)
          }
        }
      } compactLeading: {
        Circle().fill(Color("liveRed")).frame(width: 8, height: 8)
      } compactTrailing: {
        Text("\(state.totalPoints)")
          .font(.system(size: 15, weight: .heavy))
          .monospacedDigit()
          .contentTransition(.numericText())
          .foregroundColor(Color("pointsGreen"))
      } minimal: {
        Text("\(state.totalPoints)")
          .font(.system(size: 13, weight: .heavy))
          .monospacedDigit()
          .contentTransition(.numericText())
          .foregroundColor(Color("pointsGreen"))
      }
      .widgetURL(URL(string: "startingxi://live"))
      .keylineTint(Color("liveRed"))
    }
  }

  private func totalLabel(_ total: Int) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 3) {
      Text("\(total)")
        .font(.system(size: 18, weight: .heavy))
        .monospacedDigit()
        .contentTransition(.numericText())
        .foregroundColor(Color("pointsGreen"))
      Text("pts").font(.system(size: 10, weight: .semibold)).foregroundColor(Color("textMuted"))
    }
  }
}

// MARK: - Xcode canvas previews (DEBUG only — excluded from release builds)
// Open this file in Xcode and show the Canvas (⌥⌘↩) to iterate live without an
// EAS build or a device. Player photos/flags aren't in the App Group during a
// preview, so badges render their monogram/code fallback — colors + layout are
// faithful.

#if DEBUG
@available(iOS 17.0, *)
private extension StartingXIAttributes {
  static var preview: StartingXIAttributes { .init(userId: "preview", gameDay: "2026-06-14") }

  static var focused: ContentState {
    .init(
      layout: "focused", totalPoints: 65, updatedAt: 0,
      matches: [
        .init(homeCode: "SWE", awayCode: "TUN", homeScore: 0, awayScore: 0, minute: "2'",
              contributedPoints: 65, playerCount: 3, hasCaptain: true),
      ],
      players: [
        .init(id: 1, initials: "VG", position: "FWD", teamCode: "SWE", points: 31, isCaptain: true),
        .init(id: 2, initials: "AI", position: "MID", teamCode: "SWE", points: 20, isCaptain: false),
        .init(id: 3, initials: "YM", position: "DEF", teamCode: "TUN", points: 14, isCaptain: false),
      ],
      lastEvent: "Gyökeres +6 · Goal (captain ×2)"
    )
  }

  static var multi: ContentState {
    .init(
      layout: "multi", totalPoints: 88, updatedAt: 0,
      matches: [
        .init(homeCode: "BRA", awayCode: "MEX", homeScore: 2, awayScore: 1, minute: "63'",
              contributedPoints: 41, playerCount: 2, hasCaptain: true),
        .init(homeCode: "FRA", awayCode: "SEN", homeScore: 0, awayScore: 0, minute: "28'",
              contributedPoints: 27, playerCount: 2, hasCaptain: false),
        .init(homeCode: "ARG", awayCode: "ENG", homeScore: 1, awayScore: 0, minute: "HT",
              contributedPoints: 20, playerCount: 1, hasCaptain: false),
      ],
      players: [],
      lastEvent: nil
    )
  }
}

@available(iOS 17.0, *)
#Preview("Lock Screen", as: .content, using: StartingXIAttributes.preview) {
  StartingXILiveActivity()
} contentStates: {
  StartingXIAttributes.focused
  StartingXIAttributes.multi
}

@available(iOS 17.0, *)
#Preview("Dynamic Island (expanded)", as: .dynamicIsland(.expanded), using: StartingXIAttributes.preview) {
  StartingXILiveActivity()
} contentStates: {
  StartingXIAttributes.focused
  StartingXIAttributes.multi
}
#endif
