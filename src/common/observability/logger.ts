import pino from 'pino';

/**
 * Structured (JSON) logging, not console.log -- every log line is a
 * machine-parseable object, which is what actually makes logs useful at
 * SaaS scale: you can filter/aggregate by requestId, organizationId, level,
 * etc. in a real log pipeline (Datadog, CloudWatch Logs Insights, etc.)
 * instead of grepping text.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
