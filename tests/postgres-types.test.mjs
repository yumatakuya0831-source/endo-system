import assert from "node:assert/strict";
import test from "node:test";
import { postgresTypes } from "../app/lib/postgres-types.ts";

test("SQL DATE stays usable by date inputs without timezone conversion", () => {
  const parse = postgresTypes.getTypeParser(1082, "text");
  assert.equal(parse("2026-09-12"), "2026-09-12");
  assert.equal(parse("2024-02-29"), "2024-02-29");
});

test("other PostgreSQL types retain the driver's parsers", () => {
  assert.equal(postgresTypes.getTypeParser(23, "text")("3"), 3);
  assert.equal(postgresTypes.getTypeParser(1700, "text")("43000.00"), "43000.00");
  assert.ok(postgresTypes.getTypeParser(1184, "text")("2026-09-12 00:00:00+00") instanceof Date);
});
