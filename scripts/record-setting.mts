import { setSetting } from "../lib/db.ts";

/** Tiny helper so shell scripts can report status back into the settings table. */
const [key, ...rest] = process.argv.slice(2);
if (!key) {
  console.error("用法：record-setting <key> [value]");
  process.exit(1);
}
setSetting(key, rest.join(" "));
