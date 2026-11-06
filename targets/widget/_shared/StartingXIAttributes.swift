import ActivityKit
import Foundation

/// Shared between the widget extension AND the main app target (this file lives
/// in `_shared/`). The `ContentState` Codable keys MUST match the JSON emitted
/// by `supabase/functions/_shared/buildActivityState.ts` exactly — APNs decodes
/// the `content-state` payload into this type.
struct StartingXIAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var layout: String // "focused" | "multi"
    var totalPoints: Int
    var updatedAt: Int
    var matches: [Match]
    var players: [Player]
    var lastEvent: String?

    struct Match: Codable, Hashable {
      var homeCode: String
      var awayCode: String
      var homeScore: Int?
      var awayScore: Int?
      var minute: String?
      var contributedPoints: Int
      var playerCount: Int
      var hasCaptain: Bool
    }

    struct Player: Codable, Hashable {
      var id: Int
      var initials: String
      var position: String // GK | DEF | MID | FWD
      var teamCode: String
      var points: Int
      var isCaptain: Bool
    }
  }

  // Static attributes — set once when the activity starts.
  var userId: String
  var gameDay: String
}
