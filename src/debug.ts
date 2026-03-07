import { appendFileSync, writeFileSync } from "fs";

const LOG_PATH = "/tmp/spire-debug.log";
let enabled = false;

export function enableDebug() {
  enabled = true;
  writeFileSync(LOG_PATH, `=== spire-agent debug log started ${new Date().toISOString()} ===\n`);
}

export function isDebug() {
  return enabled;
}

export function debug(component: string, msg: string) {
  if (!enabled) return;
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] [${component}] ${msg}\n`;
  appendFileSync(LOG_PATH, line);
}
