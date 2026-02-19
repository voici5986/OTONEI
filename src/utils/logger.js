const isProd = process.env.NODE_ENV === 'production';

const noop = () => {};

const logger = {
  debug: isProd ? noop : (...args) => console.debug(...args),
  log: isProd ? noop : (...args) => console.log(...args),
  info: isProd ? noop : (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args)
};

export default logger;
