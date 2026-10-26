function timestamp() {
  return new Date().toISOString();
}

function format(level, service, message, meta) {
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp()}] [${level}] [${service}] ${message}${metaStr}`;
}

function createLogger(service) {
  return {
    info: (message, meta) => console.log(format('INFO', service, message, meta)),
    warn: (message, meta) => console.warn(format('WARN', service, message, meta)),
    error: (message, meta) => console.error(format('ERROR', service, message, meta)),
  };
}

module.exports = { createLogger };
