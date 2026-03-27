import Foundation
import RoomPlan
import ARKit
import UIKit

@objc(RoomPlanModule)
class RoomPlanModule: RCTEventEmitter {

  private var captureSession: RoomCaptureSession?
  private var captureView: RoomCaptureView?
  private var isScanning = false

  override static func requiresMainQueueSetup() -> Bool { return true }

  override func supportedEvents() -> [String]! {
    return ["RoomPlanProgress", "RoomPlanComplete", "RoomPlanError"]
  }

  @objc func isLiDARAvailable(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let available = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    resolve(available)
  }

  @objc func startScan(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !isScanning else {
      reject("ALREADY_SCANNING", "A scan is already in progress.", nil)
      return
    }
    guard ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) else {
      reject("LIDAR_UNAVAILABLE", "LiDAR is not available on this device.", nil)
      return
    }
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      // Release any previous session before starting a new one.
      // Failure to do so causes exceedSceneSizeLimit on the next scan.
      self.captureSession = nil
      self.captureView = nil
      let session = RoomCaptureSession()
      session.delegate = self
      self.captureSession = session
      let view = RoomCaptureView(frame: .zero)
      self.captureView = view
      if let keyWindow = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows })
        .first(where: { $0.isKeyWindow }) {
        view.frame = keyWindow.bounds
        keyWindow.addSubview(view)
      }
      let config = RoomCaptureSession.Configuration()
      session.run(configuration: config)
      self.isScanning = true
      resolve(nil)
    }
  }

  @objc func stopScan(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard isScanning, let session = captureSession else {
      reject("NOT_SCANNING", "No scan is currently in progress.", nil)
      return
    }
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      if #available(iOS 17.0, *) {
        session.stop(pauseARSession: false)
      } else {
        session.stop()
      }
      self.captureView?.removeFromSuperview()
      self.captureView = nil
      self.isScanning = false
      resolve(nil)
    }
  }
}

extension RoomPlanModule: RoomCaptureSessionDelegate {

  func captureSession(
    _ session: RoomCaptureSession,
    didUpdate room: CapturedRoom
  ) {
    let instruction = room.walls.first.map { surface -> String in
      switch surface.confidence {
      case .high:   return "Looking good — keep scanning"
      case .medium: return "Keep moving slowly around the room"
      case .low:    return "Move closer to walls for better accuracy"
      @unknown default: return "Scanning..."
      }
    } ?? "Scanning..."
    sendEvent(withName: "RoomPlanProgress", body: ["instruction": instruction])
  }

  func captureSession(
    _ session: RoomCaptureSession,
    didProvide structure: CapturedRoomData
  ) {
    processResults(structure)
  }

  func captureSession(
    _ session: RoomCaptureSession,
    didEndWith data: CapturedRoomData,
    error: Error?
  ) {
    if let error = error {
      handleSessionError(error)
      return
    }
    if isScanning {
      processResults(data)
      isScanning = false
    }
  }
}

private extension RoomPlanModule {

  /// Determine which wall face a surface belongs to based on its world-space transform.
  /// The front wall is at +z, back at -z, left at -x, right at +x.
  func wallSide(for transform: simd_float4x4, roomWidth: Float, roomDepth: Float) -> String {
    let pos = transform.columns.3
    let halfW = roomWidth / 2
    let halfD = roomDepth / 2
    let ax = abs(pos.x)
    let az = abs(pos.z)
    if az >= ax {
      return pos.z > 0 ? "front" : "back"
    } else {
      return pos.x > 0 ? "right" : "left"
    }
  }

  func processResults(_ data: CapturedRoomData) {
    let builder = RoomBuilder(options: [.beautifyObjects])
    Task {
      do {
        let room = try await builder.capturedRoom(from: data)

        // ── Dimensions ─────────────────────────────
        let walls = room.walls
        let xs = walls.map { abs($0.dimensions.x) }
        let zs = walls.map { abs($0.dimensions.z) }
        let width  = Float(xs.max() ?? 5.0)
        let depth  = Float(zs.max() ?? 4.5)
        let height = Float(room.walls.first?.dimensions.y ?? 2.7)

        // ── Doors ──────────────────────────────────
        let doorDicts: [[String: Any]] = room.doors.map { door in
          let pos = door.transform.columns.3
          let side = wallSide(for: door.transform, roomWidth: width, roomDepth: depth)
          return [
            "x":        Double(pos.x),
            "z":        Double(pos.z),
            "width":    Double(door.dimensions.x),
            "wallSide": side,
          ]
        }

        // ── Windows ────────────────────────────────
        let windowDicts: [[String: Any]] = room.windows.map { window in
          let pos = window.transform.columns.3
          let side = wallSide(for: window.transform, roomWidth: width, roomDepth: depth)
          return [
            "x":        Double(pos.x),
            "z":        Double(pos.z),
            "width":    Double(window.dimensions.x),
            "height":   Double(window.dimensions.y),
            "wallSide": side,
          ]
        }

        // ── Thumbnail ──────────────────────────────
        var thumbnailBase64 = ""
        await MainActor.run {
          if let view = self.captureView {
            let renderer = UIGraphicsImageRenderer(bounds: view.bounds)
            let image = renderer.image { ctx in
              view.layer.render(in: ctx.cgContext)
            }
            thumbnailBase64 = image.jpegData(compressionQuality: 0.7)?.base64EncodedString() ?? ""
          }
        }

        sendEvent(withName: "RoomPlanComplete", body: [
          "width":           Double(width),
          "depth":           Double(depth),
          "height":          Double(height),
          "doors":           doorDicts,
          "windows":         windowDicts,
          "thumbnailBase64": thumbnailBase64,
        ])
      } catch {
        handleSessionError(error)
      }
    }
  }

  func handleSessionError(_ error: Error) {
    isScanning = false

    // Specific guidance for known RoomPlan / ARKit failure modes
    let message: String
    if let roomPlanError = error as? RoomCaptureSession.Error {
      switch roomPlanError {
      case .exceedSceneSizeLimit:
        message = "Room too large to scan. Try a smaller space or stand closer to the center."
      default:
        message = error.localizedDescription
      }
    } else if let arError = error as? ARError {
      switch arError.code {
      case .worldTrackingFailed:
        message = "Tracking lost. Move slowly and make sure the room is well lit with visible surface texture."
      case .cameraUnauthorized:
        message = "Camera access is required for LiDAR scanning. Enable it in Settings."
      default:
        message = error.localizedDescription
      }
    } else {
      message = error.localizedDescription
    }

    // ⚠️ Key is "error" — useRoomPlan.ts reads data.error
    sendEvent(withName: "RoomPlanError", body: ["error": message])
  }
}
