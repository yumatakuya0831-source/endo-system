import assert from "node:assert/strict";
import test from "node:test";
import { canLoginAsDemo, demoAdminEmail, isDemoIdentity } from "../app/lib/demo-auth.ts";

test("T-010: demo admin accepts the username only during development", () => {
  assert.equal(canLoginAsDemo("admin", "admin", "development"), true);
  assert.equal(canLoginAsDemo(" Admin ", "admin", "development"), true);
  assert.equal(canLoginAsDemo(demoAdminEmail, "admin", "development"), true);
  assert.equal(canLoginAsDemo("admin", "incorrect", "development"), false);
  assert.equal(canLoginAsDemo("someone@example.com", "admin", "development"), false);
});

test("T-010: demo credentials are rejected outside development", () => {
  for (const environment of ["production", "test", undefined]) {
    assert.equal(canLoginAsDemo("admin", "admin", environment), false);
    assert.equal(canLoginAsDemo(demoAdminEmail, "admin", environment), false);
  }
  assert.equal(isDemoIdentity("someone@example.com"), false);
});
