"use client";

/**
 * GlobalErrorCapture — attaches global unhandledrejection and uncaughterror
 * listeners, and wraps children in a React Error Boundary that logs before
 * rendering the fallback UI. Development-only observability; zero overhead in
 * production because the logger is a no-op outside NODE_ENV=development.
 */

import React, { Component, useEffect } from "react";
import { logger } from "@/lib/logger";
import { LogEvents } from "@/lib/logEvents";

// ─── Global error listeners ──────────────────────────────────────────────────

function GlobalListeners() {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      logger.fatal("ERROR", LogEvents.UNHANDLED_REJECTION,
        `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
        {
          error: {
            message: reason instanceof Error ? reason.message : String(reason),
            name: reason instanceof Error ? reason.name : "UnhandledRejection",
            stack: reason instanceof Error ? reason.stack ?? null : null,
            code: "UNHANDLED_REJECTION",
            httpStatus: null,
            retryCount: null,
          },
        },
      );
    };

    const handleUncaughtError = (event: ErrorEvent) => {
      logger.fatal("ERROR", LogEvents.UNCAUGHT_ERROR,
        `Uncaught error: ${event.message}`,
        {
          error: {
            message: event.message,
            name: "UncaughtError",
            stack: event.error instanceof Error ? event.error.stack ?? null : null,
            code: "UNCAUGHT_ERROR",
            httpStatus: null,
            retryCount: null,
          },
          data: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          },
        },
      );
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleUncaughtError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleUncaughtError);
    };
  }, []);

  return null;
}

// ─── React Error Boundary ────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error("ERROR", LogEvents.ERROR_BOUNDARY_TRIGGERED,
      `React Error Boundary caught: ${error.message}`,
      {
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack ?? null,
          code: "REACT_ERROR_BOUNDARY",
          httpStatus: null,
          retryCount: null,
        },
        data: {
          componentStack: info.componentStack ?? null,
        },
      },
    );
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            background: "#0A1628",
            color: "#F8F6F1",
            fontFamily: "Inter, sans-serif",
            gap: 16,
            padding: 32,
          }}
        >
          <p style={{ color: "#C9A84C", fontSize: 13, letterSpacing: "0.1em" }}>
            COVA
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#8BA3C0", fontSize: 14, margin: 0 }}>
            Reload the page or return to the home screen.
          </p>
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              marginTop: 8,
              padding: "10px 24px",
              background: "#C9A84C",
              color: "#0A1628",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Go Home
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ─── Combined export ──────────────────────────────────────────────────────────

export function GlobalErrorCapture({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <GlobalListeners />
      {children}
    </ErrorBoundary>
  );
}
