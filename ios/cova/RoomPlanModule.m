// RoomPlanModule.m
// Cova — Objective-C bridge exposing RoomPlanModule to React Native
// ⚠️ ASSERTION: Exactly ONE .m bridge file per Swift module.
//   If a duplicate bridge file exists, build will fail with:
//   "Duplicate symbol _OBJC_CLASS_$_RoomPlanModule"
//   Remove the duplicate — keep only this file.

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

RCT_EXTERN_MODULE(RoomPlanModule, RCTEventEmitter)

RCT_EXTERN_METHOD(
  isLiDARAvailable:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  startScan:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  stopScan:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
