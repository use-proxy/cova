export const FLOW = {
  auth: "/",
  capture: "/capture/[roomId]",
  quiz: "/quiz",
  budget: "/budget",
  processing: "/processing",
  viewer: "/viewer/[sessionId]",
  dashboard: "/dashboard",
};

export function getNextRoute(current: string, sessionId: string): string {
  const map: Record<string, string> = {
    "/": `/capture/new`,
    "/capture": `/quiz?session=${sessionId}`,
    "/quiz": `/budget?session=${sessionId}`,
    "/budget": `/processing?session=${sessionId}`,
    "/processing": `/viewer/${sessionId}`,
    "/viewer": `/dashboard`,
  };
  const key = Object.keys(map).find((k) => current.startsWith(k));
  return key ? map[key] : "/dashboard";
}
