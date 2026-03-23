import Foundation
import RoomPlan
import ARKit
import React

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

  func processResults(_ data: CapturedRoomData) {
    let builder = RoomBuilder(options: [.beautifyObjects])
    Task {
      do {
        let room = try await builder.capturedRoom(from: data)
        let walls = room.walls
        let xs = walls.map { abs($0.dimensions.x) }
        let zs = walls.map { abs($0.dimensions.z) }
        let width = xs.max() ?? 5.0
        let depth = zs.max() ?? 4.5
        let height = Double(room.walls.first?.dimensions.y ?? 2.7)
        sendEvent(withName: "RoomPlanComplete", body: [
          "width": width,
          "depth": depth,
          "height": height
        ])
      } catch {
        handleSessionError(error)
      }
    }
  }

  func handleSessionError(_ error: Error) {
    sendEvent(withName: "RoomPlanError", body: [
      "message": error.localizedDescription
    ])
    isScanning = false
  }
}
