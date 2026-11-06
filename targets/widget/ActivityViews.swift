import SwiftUI
import WidgetKit

// MARK: - Header (centered total points)

/// Centered live dot + total points. Intentionally NO "YOUR XI" wordmark — it
/// crowded the rounded corners; centering gives the total breathing room.
struct TotalHeader: View {
  let total: Int

  var body: some View {
    HStack(spacing: 4) {
//      Circle().fill(Color("liveRed")).frame(width: 7, height: 7)
      Text("\(total)")
        .font(.system(size: 20, weight: .heavy))
        .monospacedDigit()
        .contentTransition(.numericText())
        .foregroundColor(Color("pointsGreen"))
      Text("PTS")
        .font(.system(size: 11, weight: .bold))
        .tracking(0.5)
        .foregroundColor(.white.opacity(0.65))
    }
    .frame(maxWidth: .infinity)
  }
}

// MARK: - Player photo badge

struct PlayerBadge: View {
  let player: CS.Player
  var size: CGFloat = 36

  var body: some View {
    avatar
      .frame(width: size, height: size)
      .clipShape(Circle())
      .overlay(
        Circle().stroke(
          player.isCaptain ? Color("captainGold") : Color.white.opacity(0.18),
          lineWidth: 2
        )
      )
      .overlay(alignment: .bottom) {
        PointsPill(points: player.points, isCaptain: player.isCaptain).offset(y: 8)
      }
      .overlay(alignment: .topTrailing) {
        if player.isCaptain { CrownBadge().offset(x: 5, y: -5) }
      }
      .padding(.top, 2)
      .padding(.bottom, 6)
      .padding(.horizontal, 3)
  }

  @ViewBuilder private var avatar: some View {
    if let img = AppGroup.playerPhoto(player.id) {
      Image(uiImage: img).resizable().scaledToFill()
    } else {
      ZStack {
        Circle().fill(positionColor(player.position).opacity(0.30))
        Text(player.initials)
          .font(.system(size: size * 0.32, weight: .bold))
          .foregroundColor(.white)
      }
    }
  }
}

/// Centered row of player badges (focused layout).
struct PlayerBadgesRow: View {
  let players: [CS.Player]
  var body: some View {
    HStack(spacing: 2) {
      ForEach(players, id: \.id) { PlayerBadge(player: $0) }
    }
  }
}

// MARK: - Scoreboard (focused layout)

struct ScoreboardView: View {
  let match: CS.Match

  var body: some View {
    HStack(spacing: 12) {
      teamColumn(match.homeCode, edge: .leading)
      score(match.homeScore)
      center
      score(match.awayScore)
      teamColumn(match.awayCode, edge: .trailing)
    }
  }

  // Flag + code are CENTERED on each other (default VStack alignment); the whole
  // block is pushed to the leading/trailing edge. Fixes the code-vs-flag offset.
  private func teamColumn(_ code: String, edge: Alignment) -> some View {
    VStack(spacing: 5) {
      FlagView(code: code, size: 44)
      Text(code).font(.system(size: 12, weight: .bold)).foregroundColor(.white)
    }
    .frame(maxWidth: .infinity, alignment: edge)
  }

  private func score(_ value: Int?) -> some View {
    Text(value.map(String.init) ?? "–")
      .font(.system(size: 34, weight: .heavy))
      .monospacedDigit()
      .contentTransition(.numericText())
      .foregroundColor(.white)
  }

  private var center: some View {
    HStack(spacing: 4) {
      Circle().fill(Color("liveRed")).frame(width: 6, height: 6)
      // white (not red) so it stays legible on a red/green team tint
      Text(match.minute ?? "")
        .font(.system(size: 13, weight: .heavy))
        .foregroundColor(.white)
    }
    .frame(minWidth: 34)
  }
}

// MARK: - Match row (compact multi layout)

struct MatchRow: View {
  let match: CS.Match

  var body: some View {
    HStack(spacing: 7) {
      FlagView(code: match.homeCode, size: 17)
      Text(match.homeCode).font(.system(size: 12, weight: .bold))
      Text(match.homeScore.map(String.init) ?? "–")
        .font(.system(size: 16, weight: .heavy)).monospacedDigit()

      VStack(spacing: 1) {
        Text(match.minute ?? "").font(.system(size: 10, weight: .heavy)).foregroundColor(.white)
      }
      .frame(minWidth: 30)

      Text(match.awayScore.map(String.init) ?? "–")
        .font(.system(size: 16, weight: .heavy)).monospacedDigit()
      Text(match.awayCode).font(.system(size: 12, weight: .bold))
      FlagView(code: match.awayCode, size: 17)

      Spacer(minLength: 4)

      Text("+\(match.contributedPoints)")
        .font(.system(size: 14, weight: .heavy))
        .monospacedDigit()
        .contentTransition(.numericText())
        .foregroundColor(Color("pointsGreen"))
    }
    .foregroundColor(.white)
  }

  private var tag: String {
    if match.hasCaptain { return "C · \(match.playerCount)" }
    return "\(match.playerCount) plyr"
  }
}

// MARK: - Lock Screen layouts

/// Subtle cyan-sheen scoreboard band over a darker player band.
/// Apple-Sports-style background: the two nations' colors blended on a diagonal,
/// darkened (top→bottom) so white/green/gold text stays legible and the lower
/// player band reads slightly darker — without explicit band fills.
struct MatchTint: View {
  let home: String
  let away: String
  var body: some View {
    ZStack {
      LinearGradient(
        colors: [teamColor(home), teamColor(away)],
        startPoint: .topLeading, endPoint: .bottomTrailing
      )
      LinearGradient(
        colors: [Color.black.opacity(0.34), Color.black.opacity(0.74)],
        startPoint: .top, endPoint: .bottom
      )
    }
  }
}

private struct BandA<Content: View>: View {
  @ViewBuilder var content: Content
  var body: some View {
    content.padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 4)
      .frame(maxWidth: .infinity)
  }
}

private struct BandB<Content: View>: View {
  @ViewBuilder var content: Content
  var body: some View {
    content.padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 14)
      .frame(maxWidth: .infinity)
  }
}

struct LockScreenView: View {
  let state: CS

  var body: some View {
    let first = state.matches.first
    VStack(spacing: 0) {
      if state.layout == "focused", let match = state.matches.first {
        BandA {
          VStack(spacing: 0) {
            TotalHeader(total: state.totalPoints)
            ScoreboardView(match: match)
          }
        }
        BandB {
          VStack(spacing: 0) {
            PlayerBadgesRow(players: state.players)
          }
        }
      } else {
        BandA { TotalHeader(total: state.totalPoints) }
        BandB {
          VStack(spacing: 7) {
            ForEach(Array(state.matches.enumerated()), id: \.offset) { _, m in
              MatchRow(match: m)
            }
          }
        }
      }
    }
    .background(MatchTint(home: first?.homeCode ?? "", away: first?.awayCode ?? ""))
  }

  private func eventLine(_ text: String) -> some View {
    HStack(spacing: 7) {
      Circle().fill(Color("pointsGreen")).frame(width: 5, height: 5)
      Text(text).font(.system(size: 11, weight: .semibold)).foregroundColor(Color("pointsGreen").opacity(0.9))
    }
  }
}
