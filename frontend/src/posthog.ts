import posthog from 'posthog-js';

const posthogKey = process.env.REACT_APP_POSTHOG_KEY;
const posthogHost = process.env.REACT_APP_POSTHOG_HOST;
const posthogConfigured = Boolean(posthogKey && posthogHost);

type LogAttributes = Record<string, string | number | boolean>;

export const posthogLog = {
  info(message: string, attributes?: LogAttributes) {
    if (posthogConfigured) {
      posthog.logger.info(message, attributes);
    }
  },
};

if (!posthogKey || !posthogHost) {
  if (process.env.NODE_ENV !== 'production') {
    const missingVariable = !posthogKey
      ? 'REACT_APP_POSTHOG_KEY'
      : 'REACT_APP_POSTHOG_HOST';

    throw new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`
    );
  }
} else {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: '2026-08-30',
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    logs: {
      serviceName: 'lsf-record-yourself-web',
      environment: process.env.NODE_ENV,
    },
  });
}

export default posthogConfigured ? posthog : undefined;
