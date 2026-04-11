export interface DeviceCapabilities {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  hasLiDAR: boolean;
  hasRearCamera: boolean;
  os: "ios" | "android" | "windows" | "mac" | "unknown";
  browser: "safari" | "chrome" | "firefox" | "unknown";
}

export function getDeviceCapabilities(): DeviceCapabilities {
  if (typeof window === "undefined") {
    return {
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      hasLiDAR: false,
      hasRearCamera: false,
      os: "unknown",
      browser: "unknown",
    };
  }

  const ua = navigator.userAgent.toLowerCase();

  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isMobile = isIOS || isAndroid || /mobile/.test(ua);
  const isTablet = /ipad/.test(ua) || (isAndroid && !/mobile/.test(ua));
  const isDesktop = !isMobile && !isTablet;

  // LiDAR: iPhone 12 Pro and above (iOS 14+, screen width >= 390)
  const iPhoneMatch = ua.match(/iphone os (\d+)_/);
  const iosVersion = iPhoneMatch ? parseInt(iPhoneMatch[1]) : 0;
  const screenWidth = window.screen.width;
  const hasLiDAR = isIOS && !isTablet && iosVersion >= 14 && screenWidth >= 390;

  const os: DeviceCapabilities["os"] = isIOS
    ? "ios"
    : isAndroid
      ? "android"
      : /windows/.test(ua)
        ? "windows"
        : /mac/.test(ua)
          ? "mac"
          : "unknown";

  const browser: DeviceCapabilities["browser"] =
    /safari/.test(ua) && !/chrome/.test(ua)
      ? "safari"
      : /chrome/.test(ua)
        ? "chrome"
        : /firefox/.test(ua)
          ? "firefox"
          : "unknown";

  return {
    isMobile,
    isTablet,
    isDesktop,
    hasLiDAR,
    hasRearCamera: isMobile || isTablet,
    os,
    browser,
  };
}

export function useDeviceCapabilities(): DeviceCapabilities {
  return getDeviceCapabilities();
}
