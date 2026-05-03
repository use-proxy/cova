import * as Sentry from "@sentry/nextjs";

const SAMPLE_TRACES = process.env.NODE_ENV === "production" ? 0.1 : 1.0;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: SAMPLE_TRACES,
  profilesSampleRate: 0.05,
  replaysOnErrorSampleRate: 0.5,
  replaysSessionSampleRate: 0.0,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  beforeSend(event) {
    if (event.user?.email) event.user.email = "[redacted]";
    if (event.user?.ip_address) event.user.ip_address = "[redacted]";
    return event;
  },
});
