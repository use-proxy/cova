import { fal } from "@fal-ai/client";

fal.config({
  credentials: process.env.FAL_KEY,
  proxyUrl: "/api/fal/proxy",
});

export { fal };
