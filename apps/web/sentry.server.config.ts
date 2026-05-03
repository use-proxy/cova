import * as Sentry from "@sentry/nextjs";

const SAMPLE_TRACES = process.env.NODE_ENV === "production" ? 0.1 : 1.0;
const SAMPLE_PROFILES = 0.05;

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: SAMPLE_TRACES,
  profilesSampleRate: SAMPLE_PROFILES,
  beforeSend(event) {
    if (event.user?.email) event.user.email = "[redacted]";
    if (event.user?.ip_address) event.user.ip_address = "[redacted]";
    return event;
  },
});
