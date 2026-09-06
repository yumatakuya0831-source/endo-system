"use client";

import { useEffect, useState } from "react";
import {
  type AppState, type Estimate, type EstimateItem, type EstimatePlace, type Invoice,
  createId, estimateTotals, initialState, itemLabor, itemMaterial, itemTotal, money,
} from "./lib/domain";

type View = "dashboard" | "estimates" | "editor" | "invoices" | "invoicePreview" | "masters";
const today = () => new Date().toISOString().slice(0, 10);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const storageKey = "endo-estimate-demo-state-v1";

function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = { home: "⌂", estimate: "▤", invoice: "▧", master: "◇", plus: "+", search: "⌕", grip: "⠿", save: "✓", back: "‹", arrow: "→" };
  return <span className="icon" aria-hidden="true">{icons[name]}</span>;
}

export default function EstimateApp() {
  const [state, setState] = useState<AppState>(initialState);
  const [view, setView] = useState<View>("dashboard");
  const [editing, setEditing] = useState<Estimate | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [masterTab, setMasterTab] = useState("顧客マスタ");
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) setState(JSON.parse(saved) as AppState);
      } catch {
        setNotice("保存データを読み込めなかったため、初期データで開始しました");
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const persist = (next: AppState, message: string) => {
    setState(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setNotice(message);
    } catch { setNotice("保存できませんでした。もう一度お試しください"); }
    window.setTimeout(() => setNotice(""), 2600);
  };

  const openEditor = (estimate?: Estimate) => {
    const customer = state.customers[0];
    setEditing(estimate ? clone(estimate) : {
      id: createId("es"), estimateNo: `EST-2026-${String(state.estimates.length + 1).padStart(3, "0")}`,
      customerId: customer?.id ?? "", customerName: customer?.name ?? "", customerAddress: customer?.address ?? "",
      projectName: "", siteAddress: "", status: "draft", createdAt: today(), updatedAt: today(), places: [],
    });
    setView("editor");
  };

  const saveEstimate = () => {
    if (!editing || !editing.projectName.trim() || !editing.siteAddress.trim()) {
      setNotice("工事件名と工事場所住所を入力してください"); return;
    }
    const saved = { ...editing, updatedAt: today() };
    const exists = state.estimates.some((e) => e.id === saved.id);
    const next = { ...state, estimates: exists ? state.estimates.map((e) => e.id === saved.id ? saved : e) : [saved, ...state.estimates] };
    setEditing(saved); persist(next, "見積書を保存しました");
  };

  const createInvoice = (estimate: Estimate) => {
    const total = estimateTotals(estimate).total;
    const invoice = {
      id: createId("in"), invoiceNo: `INV-2026-${String(state.invoices.length + 1).padStart(3, "0")}`,
      estimateId: estimate.id, estimateNo: estimate.estimateNo, customerId: estimate.customerId,
      companyName: estimate.customerName, projectName: estimate.projectName, issueDate: today(), dueDate: "2026-10-31",
      amount: total, status: "draft" as const,
      items: estimate.places.flatMap((place) => place.items.map((item) => ({ name: `${place.name} / ${item.name}`, quantity: item.quantity, unit: item.unit, amount: itemTotal(item) }))),
    };
    persist({ ...state, invoices: [invoice, ...state.invoices] }, `${estimate.customerName} の請求書を作成しました`);
    setView("invoices");
  };

  const openInvoicePreview = (invoice: Invoice) => {
    setPreviewInvoice(invoice);
    setView("invoicePreview");
  };

  const totalEstimateValue = state.estimates.reduce((sum, e) => sum + estimateTotals(e).total, 0);
  const navigation: { id: View; label: string; icon: string }[] = [
    { id: "dashboard", label: "ダッシュボード", icon: "home" }, { id: "estimates", label: "見積書", icon: "estimate" },
    { id: "invoices", label: "請求書", icon: "invoice" }, { id: "masters", label: "マスタ管理", icon: "master" },
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">積</div><div><strong>積算ノート</strong><small>ESTIMATE STUDIO</small></div></div>
      <nav>{navigation.map((item) => <button key={item.id} className={view === item.id || (view === "editor" && item.id === "estimates") || (view === "invoicePreview" && item.id === "invoices") ? "active" : ""} onClick={() => setView(item.id)}><Icon name={item.icon} />{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><span className="avatar">遠</span><div><strong>遠藤 太郎</strong><small>管理者</small></div><button aria-label="設定">•••</button></div>
    </aside>

    <main>
      <header className="topbar"><div><span className="crumb">積算ノート</span><span className="slash">/</span><strong>{view === "editor" ? editing?.estimateNo : view === "invoicePreview" ? previewInvoice?.invoiceNo : navigation.find((n) => n.id === view)?.label}</strong></div><span className="demo-pill">● デモ環境</span></header>
      {loading ? <div className="loading">データを準備しています…</div> : <div className="content">
        {view === "dashboard" && <Dashboard state={state} total={totalEstimateValue} openEditor={openEditor} setView={setView} />}
        {view === "estimates" && <EstimateList estimates={state.estimates} query={query} setQuery={setQuery} openEditor={openEditor} createInvoice={createInvoice} />}
        {view === "editor" && editing && <EstimateEditor state={state} estimate={editing} setEstimate={setEditing} save={saveEstimate} back={() => setView("estimates")} />}
        {view === "invoices" && <InvoiceList state={state} persist={persist} onPreview={openInvoicePreview} />}
        {view === "invoicePreview" && previewInvoice && <InvoicePreview invoice={previewInvoice} company={state.companies[0]} back={() => setView("invoices")} />}
        {view === "masters" && <MasterPanel state={state} persist={persist} tab={masterTab} setTab={setMasterTab} />}
      </div>}
    </main>
    {notice && <div className="toast">{notice}</div>}
  </div>;
}

function Dashboard({ state, total, openEditor, setView }: { state: AppState; total: number; openEditor: (e?: Estimate) => void; setView: (v: View) => void }) {
  return <>
    <div className="page-heading"><div><p className="eyebrow">OVERVIEW</p><h1>おはようございます、遠藤さん</h1><p>今日も正確な見積づくりを始めましょう。</p></div><button className="primary" onClick={() => openEditor()}><Icon name="plus" />新しい見積書</button></div>
    <section className="stats-grid">
      <article><span className="stat-icon blue">▤</span><div><small>見積書</small><strong>{state.estimates.length}<em>件</em></strong><p>うち下書き {state.estimates.filter((e) => e.status === "draft").length}件</p></div></article>
      <article><span className="stat-icon amber">▧</span><div><small>請求書</small><strong>{state.invoices.length}<em>件</em></strong><p>会社別に作成</p></div></article>
      <article><span className="stat-icon green">¥</span><div><small>見積総額</small><strong className="money-stat">{money(total)}</strong><p>登録済み見積の合計</p></div></article>
    </section>
    <section className="panel recent"><div className="panel-head"><div><h2>最近の見積書</h2><p>更新日の新しい順</p></div><button className="text-button" onClick={() => setView("estimates")}>すべて見る <Icon name="arrow" /></button></div>
      <div className="estimate-cards">{state.estimates.slice(0, 3).map((e) => <button className="estimate-card" key={e.id} onClick={() => openEditor(e)}><div className="doc-icon">▤</div><div className="card-main"><div><strong>{e.projectName}</strong><span className={`status ${e.status}`}>{e.status === "completed" ? "作成済み" : "下書き"}</span></div><p>{e.customerName}</p><small>⌖ {e.siteAddress}</small></div><div className="card-price"><strong>{money(estimateTotals(e).total)}</strong><small>{e.updatedAt} 更新</small></div></button>)}</div>
    </section>
    <section className="quick-grid"><button onClick={() => openEditor()}><span>＋</span><div><strong>見積書を作成</strong><small>場所と工事を選んで作成</small></div></button><button onClick={() => setView("invoices")}><span>▧</span><div><strong>請求書を確認</strong><small>会社別の請求書一覧</small></div></button><button onClick={() => setView("masters")}><span>◇</span><div><strong>マスタを管理</strong><small>顧客・工事・必須材料</small></div></button></section>
  </>;
}

function EstimateList({ estimates, query, setQuery, openEditor, createInvoice }: { estimates: Estimate[]; query: string; setQuery: (q: string) => void; openEditor: (e?: Estimate) => void; createInvoice: (e: Estimate) => void }) {
  const filtered = estimates.filter((e) => `${e.siteAddress} ${e.customerAddress}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="page-heading"><div><p className="eyebrow">ESTIMATES</p><h1>見積書</h1><p>住所からすばやく見積書を探せます。</p></div><button className="primary" onClick={() => openEditor()}><Icon name="plus" />新しい見積書</button></div>
    <section className="panel"><div className="toolbar"><label className="search"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="工事場所・顧客住所で検索" /></label><span>{filtered.length}件</span></div>
      <div className="table-wrap"><table><thead><tr><th>見積番号</th><th>工事件名 / 住所</th><th>顧客</th><th>更新日</th><th>金額</th><th>状態</th><th></th></tr></thead><tbody>{filtered.map((e) => <tr key={e.id}><td><button className="link" onClick={() => openEditor(e)}>{e.estimateNo}</button></td><td><strong>{e.projectName}</strong><small>{e.siteAddress}</small></td><td>{e.customerName}</td><td>{e.updatedAt}</td><td className="right"><strong>{money(estimateTotals(e).total)}</strong></td><td><span className={`status ${e.status}`}>{e.status === "completed" ? "作成済み" : "下書き"}</span></td><td><button className="outline small" onClick={() => createInvoice(e)}>請求書作成</button></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty">該当する見積書はありません</div>}</div>
    </section></>;
}

function EstimateEditor({ state, estimate, setEstimate, save, back }: { state: AppState; estimate: Estimate; setEstimate: (e: Estimate) => void; save: () => void; back: () => void }) {
  const totals = estimateTotals(estimate);
  const [placeType, setPlaceType] = useState(state.placeTemplates[0]?.id ?? "");
  const [workCategory, setWorkCategory] = useState("トイレ工事");
  const update = (patch: Partial<Estimate>) => setEstimate({ ...estimate, ...patch });
  const updatePlace = (placeId: string, fn: (place: EstimatePlace) => EstimatePlace) => update({ places: estimate.places.map((p) => p.id === placeId ? fn(p) : p) });
  const addPlace = () => {
    const template = state.placeTemplates.find((p) => p.id === placeType); if (!template) return;
    const place: EstimatePlace = { id: createId("ep"), name: template.name, items: template.materials.map((m, i) => ({ id: createId("ei"), sourceId: m.id, type: "material", name: m.name, specification: "必須材料", quantity: m.quantity, unit: m.unit, materialCost: m.materialCost, laborCost: 0, sortOrder: i, required: true })) };
    update({ places: [...estimate.places, place] });
  };
  const addWork = (placeId: string, workId: string) => {
    const work = state.workItems.find((w) => w.id === workId); if (!work) return;
    updatePlace(placeId, (p) => p.items.some((i) => i.sourceId === work.id) ? p : ({ ...p, items: [...p.items, { id: createId("ei"), sourceId: work.id, type: "work", name: work.name, specification: work.category, quantity: 1, unit: work.unit, materialCost: work.materialCost, laborCost: work.laborCost, sortOrder: p.items.length }] }));
  };
  const addManual = (placeId: string) => updatePlace(placeId, (p) => ({ ...p, items: [...p.items, { id: createId("ei"), type: "manual", name: "手入力項目", specification: "", quantity: 1, unit: "式", materialCost: 0, laborCost: 0, sortOrder: p.items.length }] }));
  const move = (placeId: string, from: number, to: number) => {
    if (to < 0) return; updatePlace(placeId, (p) => { if (to >= p.items.length) return p; const items = [...p.items]; const [picked] = items.splice(from, 1); items.splice(to, 0, picked); return { ...p, items: items.map((i, index) => ({ ...i, sortOrder: index })) }; });
  };
  return <><div className="editor-head"><button className="back" onClick={back}><Icon name="back" /></button><div><p className="eyebrow">{estimate.estimateNo}</p><h1>見積書を編集</h1></div><div className="editor-actions"><select value={estimate.status} onChange={(e) => update({ status: e.target.value as Estimate["status"] })}><option value="draft">下書き</option><option value="completed">作成済み</option></select><button className="primary" onClick={save}><Icon name="save" />保存する</button></div></div>
    <section className="panel form-panel"><div className="section-title"><span>01</span><div><h2>基本情報</h2><p>顧客と工事場所を入力します</p></div></div><div className="form-grid">
      <label>顧客<select value={estimate.customerId} onChange={(e) => { const c = state.customers.find((x) => x.id === e.target.value); if (c) update({ customerId: c.id, customerName: c.name, customerAddress: c.address }); }}>{state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>工事件名<input value={estimate.projectName} onChange={(e) => update({ projectName: e.target.value })} placeholder="例：2階トイレ改修工事" /></label>
      <label className="wide">工事場所住所<input value={estimate.siteAddress} onChange={(e) => update({ siteAddress: e.target.value })} placeholder="東京都…" /></label>
    </div></section>
    <section className="panel form-panel"><div className="section-title"><span>02</span><div><h2>場所と見積明細</h2><p>場所を選ぶと必須材料がすべて自動で追加されます</p></div></div>
      <div className="add-place"><select value={placeType} onChange={(e) => setPlaceType(e.target.value)}>{state.placeTemplates.map((p) => <option key={p.id} value={p.id}>{p.name}（必須材料 {p.materials.length}件）</option>)}</select><button className="outline" onClick={addPlace}><Icon name="plus" />場所を追加</button></div>
      {estimate.places.length === 0 && <div className="empty dashed">まず見積対象の場所を追加してください</div>}
      {estimate.places.map((place) => <div className="place-block" key={place.id}><div className="place-head"><div><span className="place-dot">⌖</span><input value={place.name} aria-label="場所名" onChange={(e) => updatePlace(place.id, (p) => ({ ...p, name: e.target.value }))} /><small>{place.items.length}項目</small></div><strong>{money(place.items.reduce((s, i) => s + itemTotal(i), 0))}</strong></div>
        <div className="work-picker"><label>工事内容<select value={workCategory} onChange={(e) => setWorkCategory(e.target.value)}>{[...new Set(state.workItems.map((w) => w.category))].map((c) => <option key={c}>{c}</option>)}</select></label><div>{state.workItems.filter((w) => w.category === workCategory).map((w) => <button key={w.id} className={place.items.some((i) => i.sourceId === w.id) ? "selected" : ""} onClick={() => addWork(place.id, w.id)}>{place.items.some((i) => i.sourceId === w.id) ? "✓ " : "+ "}{w.name}</button>)}</div><button className="outline small" onClick={() => addManual(place.id)}>＋ 手入力項目</button></div>
        <div className="item-table"><div className="item-row item-header"><span></span><span>項目 / 仕様</span><span>数量</span><span>材料費</span><span>労務費</span><span>金額</span><span></span></div>{place.items.map((item, index) => <EstimateRow key={item.id} item={item} index={index} placeId={place.id} move={move} updateItem={(patch) => updatePlace(place.id, (p) => ({ ...p, items: p.items.map((i) => i.id === item.id ? { ...i, ...patch } : i) }))} remove={() => updatePlace(place.id, (p) => ({ ...p, items: p.items.filter((i) => i.id !== item.id) }))} />)}</div>
      </div>)}
    </section>
    <div className="totals-bar"><div><span>材料費</span><strong>{money(totals.material)}</strong></div><div><span>労務費</span><strong>{money(totals.labor)}</strong></div><div className="grand"><span>見積合計 <small>（税別）</small></span><strong>{money(totals.total)}</strong></div><button className="primary" onClick={save}>保存する</button></div>
  </>;
}

function EstimateRow({ item, index, placeId, move, updateItem, remove }: { item: EstimateItem; index: number; placeId: string; move: (p: string, f: number, t: number) => void; updateItem: (p: Partial<EstimateItem>) => void; remove: () => void }) {
  const number = (value: string) => Math.max(0, Number(value) || 0);
  return <div className="item-row" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); move(placeId, Number(e.dataTransfer.getData("text/plain")), index); }}>
    <span className="grip" title="ドラッグして並べ替え"><Icon name="grip" /></span><span className="item-name"><input value={item.name} onChange={(e) => updateItem({ name: e.target.value })} /><input className="sub-input" value={item.specification} onChange={(e) => updateItem({ specification: e.target.value })} /><small className={`type ${item.type}`}>{item.required ? "必須材料" : item.type === "work" ? "工事マスタ" : "手入力"}</small></span>
    <span className="quantity"><input type="number" min="0" value={item.quantity} onChange={(e) => updateItem({ quantity: number(e.target.value) })} /><input value={item.unit} onChange={(e) => updateItem({ unit: e.target.value })} /></span>
    <span><input className="cost" type="number" min="0" value={item.materialCost} onChange={(e) => updateItem({ materialCost: number(e.target.value) })} /><small>{money(itemMaterial(item))}</small></span>
    <span><input className="cost" type="number" min="0" value={item.laborCost} onChange={(e) => updateItem({ laborCost: number(e.target.value) })} /><small>{money(itemLabor(item))}</small></span>
    <strong>{money(itemTotal(item))}</strong><span className="row-actions"><button onClick={() => move(placeId, index, index - 1)} aria-label="上へ">↑</button><button onClick={() => move(placeId, index, index + 1)} aria-label="下へ">↓</button>{!item.required && <button className="danger" onClick={remove} aria-label="削除">×</button>}</span>
  </div>;
}

function InvoiceList({ state, persist, onPreview }: { state: AppState; persist: (s: AppState, m: string) => void; onPreview: (invoice: Invoice) => void }) {
  const groups = Object.entries(state.invoices.reduce<Record<string, typeof state.invoices>>((acc, invoice) => { (acc[invoice.companyName] ??= []).push(invoice); return acc; }, {}));
  return <><div className="page-heading"><div><p className="eyebrow">INVOICES</p><h1>請求書</h1><p>見積書から作成した請求書を会社別に確認できます。</p></div></div>
    {groups.length === 0 ? <section className="panel empty-state"><div className="big-icon">▧</div><h2>請求書はまだありません</h2><p>見積書一覧の「請求書作成」から作成できます。</p></section> : groups.map(([company, invoices]) => <section className="panel invoice-group" key={company}><div className="panel-head"><div><h2>{company}</h2><p>{invoices.length}件の請求書</p></div><strong>{money(invoices.reduce((s, i) => s + i.amount, 0))}</strong></div><div className="table-wrap"><table><thead><tr><th>請求番号</th><th>工事件名</th><th>元見積</th><th>請求日</th><th>支払期限</th><th>金額</th><th>状態</th><th></th></tr></thead><tbody>{invoices.map((i) => <tr key={i.id}><td><button className="link" onClick={() => onPreview(i)}>{i.invoiceNo}</button></td><td><strong>{i.projectName}</strong></td><td>{i.estimateNo}</td><td><input type="date" value={i.issueDate} onChange={(e) => persist({ ...state, invoices: state.invoices.map((x) => x.id === i.id ? { ...x, issueDate: e.target.value } : x) }, "請求日を保存しました")} /></td><td>{i.dueDate}</td><td className="right"><strong>{money(i.amount)}</strong></td><td><button className={`status ${i.status}`} onClick={() => persist({ ...state, invoices: state.invoices.map((x) => x.id === i.id ? { ...x, status: x.status === "draft" ? "issued" : "draft" } : x) }, "請求書の状態を更新しました")}>{i.status === "issued" ? "発行済み" : "下書き"}</button></td><td><button className="outline small" onClick={() => onPreview(i)}>プレビュー</button></td></tr>)}</tbody></table></div></section>)}</>;
}

function InvoicePreview({ invoice, company, back }: { invoice: Invoice; company?: AppState["companies"][number]; back: () => void }) {
  return <><div className="preview-toolbar"><button className="outline" onClick={back}><Icon name="back" />請求書一覧へ</button><div><span className={`status ${invoice.status}`}>{invoice.status === "issued" ? "発行済み" : "下書き"}</span><button className="primary" onClick={() => window.print()}>印刷する</button></div></div>
    <article className="invoice-preview" aria-label="請求書プレビュー">
      <div className="invoice-top"><div><p className="invoice-label">INVOICE</p><h1>請 求 書</h1></div><div className="issuer"><strong>{company?.name ?? "会社名未設定"}</strong><p>〒{company?.postalCode}<br />{company?.address}</p><p>TEL {company?.phone}</p></div></div>
      <div className="invoice-meta"><div className="recipient"><h2>{invoice.companyName} 御中</h2><p>下記の通りご請求申し上げます。</p></div><dl><div><dt>請求書番号</dt><dd>{invoice.invoiceNo}</dd></div><div><dt>請求日</dt><dd>{invoice.issueDate}</dd></div><div><dt>支払期限</dt><dd>{invoice.dueDate}</dd></div><div><dt>元見積番号</dt><dd>{invoice.estimateNo}</dd></div></dl></div>
      <div className="invoice-project"><span>件名</span><strong>{invoice.projectName}</strong></div>
      <div className="invoice-total"><span>ご請求金額（税別）</span><strong>{money(invoice.amount)}</strong></div>
      <table className="invoice-lines"><thead><tr><th>No.</th><th>品名・工事内容</th><th>数量</th><th>単位</th><th>金額</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={`${item.name}-${index}`}><td>{index + 1}</td><td>{item.name}</td><td className="right">{item.quantity}</td><td>{item.unit}</td><td className="right">{money(item.amount)}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>合計</td><td className="right">{money(invoice.amount)}</td></tr></tfoot></table>
      <div className="invoice-notes"><strong>備考</strong><p>お振込手数料は貴社にてご負担くださいますようお願いいたします。</p><p className="demo-note">※ デモ表示：税・振込先・登録番号は本番仕様確定後に反映します。</p></div>
    </article></>;
}

function MasterPanel({ state, persist, tab, setTab }: { state: AppState; persist: (s: AppState, m: string) => void; tab: string; setTab: (t: string) => void }) {
  const tabs = ["会社マスタ", "顧客マスタ", "工事マスタ", "汎用マスタ"];
  const addCustomer = () => persist({ ...state, customers: [...state.customers, { id: createId("cu"), name: "新規顧客株式会社", address: "東京都", contact: "ご担当者様" }] }, "顧客を追加しました");
  const addWork = () => persist({ ...state, workItems: [...state.workItems, { id: createId("wo"), category: "トイレ工事", name: "新規工事項目", unit: "式", materialCost: 0, laborCost: 0 }] }, "工事項目を追加しました");
  return <><div className="page-heading"><div><p className="eyebrow">MASTER DATA</p><h1>マスタ管理</h1><p>見積・請求で使う基本データを管理します。</p></div></div><div className="master-tabs">{tabs.map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}</div>
    <section className="panel"><div className="panel-head"><div><h2>{tab}</h2><p>{tab === "汎用マスタ" ? "場所と必須材料" : "登録済みデータ"}</p></div>{tab === "顧客マスタ" && <button className="primary small" onClick={addCustomer}>＋ 顧客を追加</button>}{tab === "工事マスタ" && <button className="primary small" onClick={addWork}>＋ 工事を追加</button>}</div>
      {tab === "会社マスタ" && state.companies.map((c) => <div className="master-card" key={c.id}><span className="master-avatar">会</span><div><strong>{c.name}</strong><p>〒{c.postalCode} {c.address}</p><small>{c.phone}</small></div></div>)}
      {tab === "顧客マスタ" && <div className="table-wrap"><table><thead><tr><th>会社名</th><th>住所</th><th>担当</th></tr></thead><tbody>{state.customers.map((c) => <tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.address}</td><td>{c.contact}</td></tr>)}</tbody></table></div>}
      {tab === "工事マスタ" && <div className="table-wrap"><table><thead><tr><th>工事区分</th><th>工事項目</th><th>単位</th><th>材料費</th><th>労務費</th></tr></thead><tbody>{state.workItems.map((w) => <tr key={w.id}><td><span className="category">{w.category}</span></td><td><strong>{w.name}</strong></td><td>{w.unit}</td><td>{money(w.materialCost)}</td><td>{money(w.laborCost)}</td></tr>)}</tbody></table></div>}
      {tab === "汎用マスタ" && <div className="template-grid">{state.placeTemplates.map((p) => <article key={p.id}><div><span className="place-dot">⌖</span><h3>{p.name}</h3><small>必須材料 {p.materials.length}件</small></div><ul>{p.materials.map((m) => <li key={m.id}><span>{m.name}</span><strong>{m.quantity}{m.unit} · {money(m.materialCost)}</strong></li>)}</ul></article>)}</div>}
    </section></>;
}
