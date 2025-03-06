/* eslint-disable no-undef */
/* eslint-disable no-console */

if (process.env.NODE_ENV === "production" || process.env.CI === "true") {
  process.exit(0);
}

const huskyImport = await import("husky");
const husky = huskyImport.default;
console.log(husky());
