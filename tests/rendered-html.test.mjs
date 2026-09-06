import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("includes the required demo workflows", async () => {
  const [app, domain, packageJson] = await Promise.all([
    readFile(new URL("../app/estimate-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/domain.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(app, /siteAddress.*customerAddress/);
  assert.match(app, /template\.materials\.map/);
  assert.match(app, /draggable/);
  assert.match(app, /dataTransfer\.setData/);
  assert.match(app, /createInvoice/);
  assert.match(app, /請求書を作成しました/);
  assert.match(app, /aria-label="請求書プレビュー"/);
  assert.match(app, /ご請求金額（税別）/);
  assert.match(domain, /itemMaterial.*item\.quantity \* item\.materialCost/);
  assert.match(domain, /itemLabor.*item\.quantity \* item\.laborCost/);
  assert.match(app, /window\.localStorage\.setItem/);
  assert.match(packageJson, /"build": "next build"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
