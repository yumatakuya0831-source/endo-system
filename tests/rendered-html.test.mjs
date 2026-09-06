import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the estimate demo", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>積算ノート \| 見積・請求デモ<\/title>/i);
  assert.match(html, /積算ノート/);
  assert.match(html, /見積書/);
  assert.match(html, /請求書/);
  assert.match(html, /データを準備しています/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("includes the required demo workflows", async () => {
  const [app, domain, api, packageJson] = await Promise.all([
    readFile(new URL("../app/estimate-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/domain.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
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
  assert.match(api, /ON CONFLICT\(key\) DO UPDATE/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
