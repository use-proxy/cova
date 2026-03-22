// RoomPlanModule.swift
// Cova — RoomPlan LiDAR bridge for React Native
// Minimum iOS deployment target: 16.0 (RoomPlan framework requirement)
// ⚠️ ASSERTION: This file must be added to the Xcode project under the main
//   app target (not a test target). Build will fail otherwise.
// ⚠️ ASSERTION: iOS deployment target must be set to 16.0 or higher in Xcode
//   project settings before building. RoomPlan is unavailable on iOS < 16.

import Foundation
import RoomPlan
import ARKit
import RealityKit

// ── Result types ────────────────────────────────────────────────────────────

struct DoorPosition: Codable {
  let x: Float
  let z: Float
  let width: Float
  let wallSide: String
}

struct WindowPosition: Codable {
  let x: Float
  let z: Float
  let width: Float
  let height: Float
  let wallSide: String
}

// ── Module ───────────────────────────────────────────────────────────────────

@objc(RoomPlanModule)
class RoomPlanModule: RCTEventEmitter {

  // MARK: – Properties

  private var captureSession: RoomCaptureSession?
  private var captureView: RoomCaptureView?
  private var isScanning = false

  // MARK: – RCTEventEmitter overrides

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! {
    return ["RoomPlanProgress", "RoomPlanComplete", "RoomPlanError"]
  }

  // MARK: – Exported methods

  /// Returns true if LiDAR hardware is available on this device.
  /// RoomPlan requires an iPhone 12 Pro or later with a LiDAR Scanner.
  @objc func isLiDARAvailable(_ resolve: RCTPromiseResolveBlock,
                               rejecter reject: RCTPromiseRejectBlock) {
    let available = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    resolve(available)
  }

  /// Begin a RoomPlan scan. Emits RoomPlanProgress events during the scan,
  /// then emits RoomPlanComplete or RoomPlanError when the session ends.
  @objc func startScan(_ resolve: RCTPromiseResolveBlock,
                       rejecter reject: RCTPromiseRejectBlock) {
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

      // ⚠️ ASSERTION: Always nil-out the previous session before creating a new one.
      // Retaining a stale session causes exceedSceneSizeLimit on the next scan.
      self.captureSession = nil
      self.captureView = nil

      let session = RoomCaptureSession()
      session.delegate = self
      self.captureSession = session

      let view = RoomCaptureView(frame: .zero)
      view.captureSession = session
      self.captureView = view

      // Present the capture view full-screen over the key window
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

  /// Stop the scan, process results, and emit RoomPlanComplete.
  @objc func stopScan(_ resolve: RCTPromiseResolveBlock,
                      rejecter reject: RCTPromiseRejectBlock) {
    guard isScanning, let session = captureSession else {
      reject("NOT_SCANNING", "No scan is currently in progress.", nil)
      return
    }

    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      session.stop(pauseARSession: true)
      self.captureView?.removeFromSuperview()
      self.isScanning = false
      resolve(nil)
    }
  }
}

// MARK: – RoomCaptureSessionDelegate ─────────────────────────────────────────

extension RoomPlanModule: RoomCaptureSessionDelegate {

  // Called repeatedly during scanning with the latest incremental model
  func captureSession(_ session: RoomCaptureSession,
                      didUpdate room: CapturedRoom) {
    // Extract a human-readable instruction from the first surface
    // RoomPlan surfaces carry a confidence indicator; emit it as progress
    let confidence = room.walls.first.map { surface -> String in
      switch surface.confidence {
      case .high:   return "Looking good — keep scanning"
      case .medium: return "Keep moving slowly around the room"
      case .low:    return "Move closer to walls for better accuracy"
      @unknown default: return "Scanning..."
      }
    } ?? "Scanning..."

    sendEvent(withName: "RoomPlanProgress", body: ["instruction": confidence])
  }

  // Called once when the session produces its final structured result
  func captureSession(_ session: RoomCaptureSession,
                      didProvide structure: CapturedRoomData) {
    processResults(structure)
  }

  // Called when the session ends (either stopped or errored)
  func captureSession(_ session: RoomCaptureSession,
                      didEndWith data: CapturedRoomData,
                      error: Error?) {
    if let error = error {
      handleSessionError(error)
      return
    }
    // Only process if we haven't already handled didProvide
    if isScanning {
      processResults(data)
      isScanning = false
    }
  }

  // MARK: – Private helpers

  private func processResults(_ data: CapturedRoomData) {
    // Use RoomBuilder to get a structured CapturedRoom from raw data
    let builder = RoomBuilder(options: [.beautifyObjects])
    Task {
      do {
        let room = try await builder.capturedRoom(from: data)
        emitRoomComplete(room)
      } catch {
        sendEvent(withName: "RoomPlanError", body: [
          "error": "Failed to process scan results: \(error.localizedDescription)"
        ])
      }
    }
  }

  private func emitRoomComplete(_ room: CapturedRoom) {
    // ── Compute bounding box of all wall surfaces ──────────────────────────
    // Each wall has a transform (simd_float4x4) and dimensions (simd_float3).
    // We extract world-space extents to derive room width, depth, height.

    var minX: Float = .infinity, maxX: Float = -.infinity
    var minZ: Float = .infinity, maxZ: Float = -.infinity
    var maxY: Float = 0

    for wall in room.walls {
      let pos = wall.transform.columns.3
      let halfW = wall.dimensions.x / 2
      let halfD = wall.dimensions.z / 2

      minX = min(minX, pos.x - halfW)
      maxX = max(maxX, pos.x + halfW)
      minZ = min(minZ, pos.z - halfD)
      maxZ = max(maxZ, pos.z + halfD)
      maxY = max(maxY, wall.dimensions.y)
    }

    // Fallback to defaults if no walls were detected
    let width  = (minX == .infinity) ? 4.9 : max(1.0, maxX - minX)
    let depth  = (minZ == .infinity) ? 4.3 : max(1.0, maxZ - minZ)
    let height = maxY > 0 ? maxY : 2.7

    // ── Door positions ─────────────────────────────────────────────────────
    var doors: [[String: Any]] = []
    for door in room.doors {
      let pos = door.transform.columns.3
      let wallSide = classifyWallSide(x: pos.x, z: pos.z,
                                      minX: minX, maxX: maxX,
                                      minZ: minZ, maxZ: maxZ)
      doors.append([
        "x": pos.x,
        "z": pos.z,
        "width": door.dimensions.x,
        "wallSide": wallSide,
      ])
    }

    // ── Window positions ────────────────────────────────────────────────────
    var windows: [[String: Any]] = []
    for window in room.windows {
      let pos = window.transform.columns.3
      let wallSide = classifyWallSide(x: pos.x, z: pos.z,
                                      minX: minX, maxX: maxX,
                                      minZ: minZ, maxZ: maxZ)
      windows.append([
        "x": pos.x,
        "z": pos.z,
        "width": window.dimensions.x,
        "height": window.dimensions.y,
        "wallSide": wallSide,
      ])
    }

    let payload: [String: Any] = [
      "width":  width,
      "depth":  depth,
      "height": height,
      "unit":   "m",
      "doors":  doors,
      "windows": windows,
    ]

    sendEvent(withName: "RoomPlanComplete", body: payload)
  }

  /// Classify which wall side a door/window belongs to based on its position
  /// relative to the room bounding box.
  private func classifyWallSide(x: Float, z: Float,
                                 minX: Float, maxX: Float,
                                 minZ: Float, maxZ: Float) -> String {
    let centerX = (minX + maxX) / 2
    let centerZ = (minZ + maxZ) / 2
    let dx = x - centerX
    let dz = z - centerZ

    if abs(dx) > abs(dz) {
      return dx > 0 ? "right" : "left"
    } else {
      return dz > 0 ? "front" : "back"
    }
  }

  private func handleSessionError(_ error: Error) {
    isScanning = false
    captureView?.removeFromSuperview()

    // Map known RoomPlan error codes to actionable messages
    let nsError = error as NSError
    let message: String
    switch nsError.code {
    case 100: // exceedSceneSizeLimit
      // ⚠️ KNOWN ERROR: previous session was not released before starting a new one.
      // Fix: captureSession = nil before calling startScan again.
      message = "Room is too large. Please try a smaller area."
    case 200: // worldTrackingFailed
      message = "Tracking lost. Move to a well-lit area with visible wall texture."
    default:
      message = error.localizedDescription
    }

    sendEvent(withName: "RoomPlanError", body: ["error": message])
  }
}
