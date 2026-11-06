import SwiftUI
import UIKit

typealias CS = StartingXIAttributes.ContentState

/// Shared container with the main app. The app pre-downloads player photos and
/// team flags here (Phase 5); the widget renders them by file path. Widgets have
/// no network access, so anything missing falls back to a monogram / text code.
enum AppGroup {
  static let id = "group.com.novem.startingxi"

  static func image(_ relativePath: String) -> UIImage? {
    guard
      let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
    else { return nil }
    return UIImage(contentsOfFile: dir.appendingPathComponent(relativePath).path)
  }

  static func playerPhoto(_ id: Int) -> UIImage? { image("players/\(id).png") }
  static func flag(_ code: String) -> UIImage? { image("flags/\(code.uppercased()).png") }
}

extension Color {
  /// 0xRRGGBB hex.
  init(rgb: UInt) {
    self.init(
      .sRGB,
      red: Double((rgb >> 16) & 0xFF) / 255,
      green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255
    )
  }
}

/// Primary national colors (FIFA codes) — tint the activity background like
/// Apple Sports tints by team. Unknown codes fall back to a deep slate so the
/// tint still looks intentional. Easy to tweak any single value.
private let teamColors: [String: UInt] = [
  "ARG": 0x6CACE4, "BRA": 0x009C3B, "FRA": 0x1B2A6B, "ENG": 0xCF142B, "ESP": 0xAA151B,
  "GER": 0x1A1A1A, "POR": 0x006600, "NED": 0xEC6E26, "BEL": 0xE30613, "ITA": 0x0066B3,
  "CRO": 0xCE1126, "URU": 0x4D9DD6, "COL": 0xE8B100, "SUI": 0xD52B1E, "SEN": 0x00853F,
  "JPN": 0x132257, "KOR": 0xC8102E, "SWE": 0x006AA7, "TUN": 0xE70013, "DEN": 0xC60C30,
  "SRB": 0xC6363C, "POL": 0xDC143C, "ECU": 0xC9A000, "MAR": 0x006233, "MEX": 0x006847,
  "USA": 0x002868, "CAN": 0xD52B1E, "CIV": 0xFF8200, "GHA": 0x006B3F, "NGA": 0x008751,
  "CMR": 0x007A5E, "EGY": 0xCE1126, "ALG": 0x007229, "AUS": 0xCBA135, "JAM": 0x009B3A,
  "CRC": 0x002B7F, "PAN": 0xD21034, "QAT": 0x8A1538, "KSA": 0x006C35, "IRN": 0x239F40,
  "WAL": 0xC8102E, "SCO": 0x0065BF, "UKR": 0x005BBB, "TUR": 0xE30A17, "AUT": 0xED2939,
  "NZL": 0x1A1A1A, "PAR": 0xD52B1E, "PER": 0xD91023, "CHI": 0xD52B1E, "VEN": 0x9B1B30,
]

/// The match's background tint — blends the two nations' colors, darkened for
/// legible white text.
func teamColor(_ code: String) -> Color {
  Color(rgb: teamColors[code.uppercased()] ?? 0x2A3556)
}

/// Position tint used behind a monogram when no photo is cached.
func positionColor(_ pos: String) -> Color {
  switch pos {
  case "GK": return Color("captainGold")
  case "DEF": return Color("liveRed")
  case "MID": return Color("pointsGreen")
  default: return Color("textMuted") // FWD + unknown
  }
}

/// Round team flag — cached image, else the country code on a faint disc.
struct FlagView: View {
  let code: String
  var size: CGFloat = 26

  var body: some View {
    Group {
      if let img = AppGroup.flag(code) {
        Image(uiImage: img).resizable().scaledToFill()
      } else {
        ZStack {
          Circle().fill(Color.white.opacity(0.10))
          Text(code)
            .font(.system(size: size * 0.34, weight: .bold))
            .foregroundColor(.white.opacity(0.9))
        }
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 1))
  }
}

/// Small gold captain marker (crown) shown at the top-right of the avatar.
struct CrownBadge: View {
  var body: some View {
    Image(systemName: "crown.fill")
      .font(.system(size: 7, weight: .black))
      .foregroundColor(Color(red: 0.17, green: 0.11, blue: 0))
      .frame(width: 16, height: 16)
      .background(Circle().fill(Color("captainGold")))
      .overlay(Circle().stroke(Color("bgNavy"), lineWidth: 2))
  }
}

/// Points pill that sits on the bottom edge of an avatar. Rolls on change.
struct PointsPill: View {
  let points: Int
  let isCaptain: Bool

  var body: some View {
    let tint = isCaptain ? Color("captainGold") : Color("pointsGreen")
    Text("\(points)")
      .font(.system(size: 12, weight: .heavy))
      .foregroundColor(tint)
      .monospacedDigit()
      .contentTransition(.numericText())
      .padding(.horizontal, 6)
      .padding(.vertical, 1)
      .background(Capsule().fill(Color.black.opacity(0.85)))
      .overlay(Capsule().stroke(tint, lineWidth: 1.5))
  }
}
