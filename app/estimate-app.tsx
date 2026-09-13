"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  type AppState, type Estimate, type EstimateItem, type EstimatePlace, type Invoice,
  createId, estimateTotals, initialState, invoiceTotal, itemLabor, itemMaterial, itemTotal, money,
} from "./lib/domain";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./lib/supabase";
import { deleteCompanyFromSupabase, deleteCustomerFromSupabase, deleteEstimateFromSupabase, deleteInvoiceFromSupabase, deleteMaterialTemplateFromSupabase, deletePlaceTemplateFromSupabase, deleteWorkItemFromSupabase, hasRemoteSeedData, loadAppStateFromSupabase, saveAppStateToSupabase } from "./lib/supabase-data";

type View = "dashboard" | "estimates" | "editor" | "invoices" | "invoicePreview" | "masters";
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const normalizeState = (value: AppState): AppState => ({
  ...initialState,
  ...value,
  settings: { ...initialState.settings, ...value.settings },
  invoices: (value.invoices ?? []).map((invoice) => {
    const items = invoice.items.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit, amount: item.amount }));
    return { ...invoice, showEstimateNo: invoice.showEstimateNo ?? true, items, amount: items.reduce((sum, item) => sum + item.amount, 0) };
  }),
});
const storageKey = "endo-estimate-demo-state-v1";
const passwordRecoveryKey = "endo-password-recovery-pending";
const isPasswordRecoveryUrl = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("password_recovery") === "1"
    || params.has("code")
    || params.get("type") === "recovery"
    || hashParams.get("type") === "recovery"
    || hashParams.has("access_token");
};

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
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [notice, setNotice] = useState("");
  const [masterTab, setMasterTab] = useState("顧客マスタ");
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = getSupabaseBrowserClient();
    if (!isPasswordRecoveryUrl()) {
      window.localStorage.removeItem(passwordRecoveryKey);
    }
    const shouldOpenRecovery = () => isPasswordRecoveryUrl();
    const markRecoveryIfNeeded = (nextSession: Session | null) => {
      if (nextSession && shouldOpenRecovery()) {
        setPasswordRecovery(true);
        window.localStorage.setItem(passwordRecoveryKey, "1");
        if (window.location.search || window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      } else if (!shouldOpenRecovery()) {
        window.localStorage.removeItem(passwordRecoveryKey);
      }
    };
    void supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { error } = await supabase.auth.getUser(data.session.access_token);
        if (error) {
          await supabase.auth.signOut();
          setSession(null);
          setAuthReady(true);
          setLoading(false);
          return;
        }
      }
      setSession(data.session);
      markRecoveryIfNeeded(data.session);
      setAuthReady(true);
      if (!data.session) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY" || shouldOpenRecovery()) {
        setPasswordRecovery(Boolean(nextSession));
        window.localStorage.setItem(passwordRecoveryKey, "1");
      } else if (event === "SIGNED_IN") {
        setPasswordRecovery(false);
        window.localStorage.removeItem(passwordRecoveryKey);
      }
      if (!nextSession) setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured && !session) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        if (isSupabaseConfigured) {
          const remoteState = await loadAppStateFromSupabase();
          if (active && hasRemoteSeedData(remoteState)) {
            const normalized = normalizeState(remoteState);
            setState(normalized);
            window.localStorage.setItem(storageKey, JSON.stringify(normalized));
            return;
          }
        }

        const saved = window.localStorage.getItem(storageKey);
        if (active && saved) setState(normalizeState(JSON.parse(saved) as AppState));
      } catch {
        if (active) setNotice("Supabaseから読み込めなかったため、ローカルデータで開始しました");
      } finally {
        if (active) setLoading(false);
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [session]);

  const persist = (next: AppState, message: string) => {
    setState(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setNotice(message);
    } catch { setNotice("保存できませんでした。もう一度お試しください"); }
    if (isSupabaseConfigured) {
      void saveAppStateToSupabase(next).catch(() => {
        setNotice("Supabaseへ保存できませんでした。ローカルには保存済みです");
      });
    }
    window.setTimeout(() => setNotice(""), 2600);
  };

  const signOut = async () => {
    if (!isSupabaseConfigured) return;
    await getSupabaseBrowserClient().auth.signOut();
    setState(initialState);
    setView("dashboard");
    setNotice("");
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
    const current = state.estimates.find((e) => e.id === editing.id);
    const saved = { ...editing, status: current?.status === "completed" ? "draft" as const : editing.status, updatedAt: today() };
    const exists = Boolean(current);
    const next = { ...state, estimates: exists ? state.estimates.map((e) => e.id === saved.id ? saved : e) : [saved, ...state.estimates] };
    setEditing(saved); persist(next, "見積書を保存しました");
  };

  const completeEstimate = (estimate: Estimate) => {
    const total = estimateTotals(estimate).total;
    const issueDate = today();
    const items = estimate.places.flatMap((place) => place.items.map((item) => ({ name: `${place.name} / ${item.name}`, quantity: item.quantity, unit: item.unit, amount: itemTotal(item) })));
    const completedEstimate = { ...estimate, status: "completed" as const, updatedAt: today() };
    const existsInvoice = state.invoices.some((invoice) => invoice.estimateId === estimate.id);
    const invoice = existsInvoice ? undefined : {
      id: createId("in"), invoiceNo: `INV-2026-${String(state.invoices.length + 1).padStart(3, "0")}`,
      estimateId: estimate.id, estimateNo: estimate.estimateNo, showEstimateNo: true, customerId: estimate.customerId,
      companyName: estimate.customerName, projectName: estimate.projectName, issueDate, dueDate: addDays(issueDate, state.settings.paymentDueDays),
      amount: total, status: "draft" as const,
      items,
    };
    persist({
      ...state,
      estimates: state.estimates.map((item) => item.id === estimate.id ? completedEstimate : item),
      invoices: invoice ? [invoice, ...state.invoices] : state.invoices,
    }, invoice ? "見積書を作成済みにし、請求書へ追加しました" : "見積書を作成済みにしました");
    setView("invoices");
  };

  const deleteEstimate = (estimate: Estimate) => {
    if (!window.confirm(`${estimate.estimateNo} を削除しますか？`)) return;
    const nextInvoices = state.invoices.map((invoice) => invoice.estimateId === estimate.id ? { ...invoice, estimateId: "" } : invoice);
    persist({ ...state, estimates: state.estimates.filter((item) => item.id !== estimate.id), invoices: nextInvoices }, "見積書を削除しました");
    if (isSupabaseConfigured) {
      void deleteEstimateFromSupabase(estimate.id).catch(() => setNotice("Supabaseから見積書を削除できませんでした"));
    }
  };

  const openInvoicePreview = (invoice: Invoice) => {
    setPreviewInvoice(invoice);
    setView("invoicePreview");
  };

  const totalInvoiceValue = state.invoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  const navigation: { id: View; label: string; icon: string }[] = [
    { id: "dashboard", label: "ダッシュボード", icon: "home" }, { id: "estimates", label: "見積書", icon: "estimate" },
    { id: "invoices", label: "請求書", icon: "invoice" }, { id: "masters", label: "マスタ管理", icon: "master" },
  ];

  if (!authReady || loading && !session && isSupabaseConfigured) {
    return <div className="loading">認証状態を確認しています…</div>;
  }

  if (isSupabaseConfigured && !session) {
    return <LoginScreen />;
  }

  if (isSupabaseConfigured && session && passwordRecovery) {
    return <PasswordResetScreen onDone={async () => {
      setPasswordRecovery(false);
      window.localStorage.removeItem(passwordRecoveryKey);
      await getSupabaseBrowserClient().auth.signOut();
      setSession(null);
      setLoading(false);
    }} />;
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">積</div><div><strong>積算ノート</strong><small>ESTIMATE STUDIO</small></div></div>
      <nav>{navigation.map((item) => <button key={item.id} className={view === item.id || (view === "editor" && item.id === "estimates") || (view === "invoicePreview" && item.id === "invoices") ? "active" : ""} onClick={() => setView(item.id)}><Icon name={item.icon} />{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><span className="avatar">遠</span><div><strong>遠藤 太郎</strong><small>{session?.user.email ?? "管理者"}</small></div><button aria-label="ログアウト" onClick={signOut}>退出</button></div>
    </aside>

    <main>
      <header className="topbar"><div><span className="crumb">積算ノート</span><span className="slash">/</span><strong>{view === "editor" ? editing?.estimateNo : view === "invoicePreview" ? previewInvoice?.invoiceNo : navigation.find((n) => n.id === view)?.label}</strong></div><span className="demo-pill">● デモ環境</span></header>
      {loading ? <div className="loading">データを準備しています…</div> : <div className="content">
        {view === "dashboard" && <Dashboard state={state} total={totalInvoiceValue} openEditor={openEditor} setView={setView} />}
        {view === "estimates" && <EstimateList estimates={state.estimates} query={query} setQuery={setQuery} openEditor={openEditor} completeEstimate={completeEstimate} deleteEstimate={deleteEstimate} />}
        {view === "editor" && editing && <EstimateEditor state={state} estimate={editing} setEstimate={setEditing} save={saveEstimate} back={() => setView("estimates")} />}
        {view === "invoices" && <InvoiceList state={state} persist={persist} onPreview={openInvoicePreview} />}
        {view === "invoicePreview" && previewInvoice && <InvoicePreview invoice={state.invoices.find((invoice) => invoice.id === previewInvoice.id) ?? previewInvoice} company={state.companies[0]} back={() => setView("invoices")} />}
        {view === "masters" && <MasterPanel state={state} persist={persist} tab={masterTab} setTab={setMasterTab} session={session} />}
      </div>}
    </main>
    {notice && <div className="toast">{notice}</div>}
  </div>;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [message, setMessage] = useState("");

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    if (error) {
      const text = error.message.toLowerCase();
      if (text.includes("email not confirmed")) {
        setMessage("このユーザーはメール確認が完了していません。SupabaseのUsers画面でConfirmしてください。");
      } else if (text.includes("invalid login credentials")) {
        setMessage("メールアドレスまたはパスワードが違います。Supabaseに登録した内容を確認してください。");
      } else {
        setMessage(`ログインできませんでした: ${error.message}`);
      }
    }
    setLoading(false);
  };

  const sendResetEmail = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    window.localStorage.setItem(passwordRecoveryKey, "1");
    const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?password_recovery=1`,
    });
    if (error) {
      window.localStorage.removeItem(passwordRecoveryKey);
      setMessage(`再設定メールを送信できませんでした: ${error.message}`);
    } else {
      setMessage("パスワード再設定メールを送信しました。メール内のリンクから新しいパスワードを設定してください。");
    }
    setLoading(false);
  };

  return <main className="auth-page">
    <section className="auth-panel">
      <div className="brand auth-brand"><div className="brand-mark">積</div><div><strong>積算ノート</strong><small>ESTIMATE STUDIO</small></div></div>
      <div className="auth-copy"><p className="eyebrow">SECURE LOGIN</p><h1>{resetMode ? "パスワード再設定" : "ログイン"}</h1><p>{resetMode ? "登録済みメールアドレスへ再設定リンクを送信します。" : "登録済みユーザーのみ利用できます。"}</p></div>
      <form className="auth-form" onSubmit={resetMode ? sendResetEmail : login}>
        <label>メールアドレス<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
        {!resetMode && <label>パスワード<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>}
        {message && <p className="auth-error">{message}</p>}
        <button className="primary" disabled={loading}>{loading ? "確認中…" : resetMode ? "再設定メールを送信" : "ログイン"}</button>
        <button type="button" className="text-button auth-switch" onClick={() => { setResetMode((current) => !current); setMessage(""); }}>{resetMode ? "ログインに戻る" : "パスワードを忘れた方"}</button>
      </form>
    </section>
  </main>;
}

function PasswordResetScreen({ onDone }: { onDone: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const updatePassword = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("パスワードは8文字以上で入力してください。");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("確認用パスワードが一致しません。");
      return;
    }

    setLoading(true);
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
    if (error) {
      setMessage(`パスワードを更新できませんでした: ${error.message}`);
      setLoading(false);
      return;
    }

    setMessage("パスワードを更新しました。新しいパスワードでログインしてください。");
    window.setTimeout(() => { void onDone(); }, 1200);
  };

  return <main className="auth-page">
    <section className="auth-panel">
      <div className="brand auth-brand"><div className="brand-mark">積</div><div><strong>積算ノート</strong><small>ESTIMATE STUDIO</small></div></div>
      <div className="auth-copy"><p className="eyebrow">PASSWORD RESET</p><h1>新しいパスワード</h1><p>今後ログインに使うパスワードを設定してください。</p></div>
      <form className="auth-form" onSubmit={updatePassword}>
        <label>新しいパスワード<span className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /><button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? "非表示" : "表示"}</button></span></label>
        <label>新しいパスワード（確認）<span className="password-field"><input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required /><button type="button" onClick={() => setShowConfirmPassword((current) => !current)}>{showConfirmPassword ? "非表示" : "表示"}</button></span></label>
        {message && <p className="auth-error">{message}</p>}
        <button className="primary" disabled={loading}>{loading ? "更新中…" : "パスワードを更新"}</button>
      </form>
    </section>
  </main>;
}

function CalculatorInput({ value, onChange, className, label }: { value: number; onChange: (value: number) => void; className?: string; label?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(String(value));
  }, [value]);

  const update = (next: string) => {
    if (!/^\d*\.?\d*$/.test(next)) return;
    setDraft(next);
    if (next !== "") onChange(Math.max(0, Number(next) || 0));
  };

  return <div className="calculator-field">
    <input
      ref={inputRef}
      className={className}
      aria-label={label}
      inputMode="decimal"
      value={draft}
      onChange={(event) => update(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => {
        if (draft === "") {
          setDraft("0");
          onChange(0);
        }
      }}
    />
  </div>;
}

function Dashboard({ state, total, openEditor, setView }: { state: AppState; total: number; openEditor: (e?: Estimate) => void; setView: (v: View) => void }) {
  const profit = total * (state.settings.profitRate / 100);
  return <>
    <div className="page-heading"><div><p className="eyebrow">OVERVIEW</p><h1>おはようございます、遠藤さん</h1><p>今日も正確な見積づくりを始めましょう。</p></div><button className="primary" onClick={() => openEditor()}><Icon name="plus" />新しい見積書</button></div>
    <section className="stats-grid">
      <button type="button" onClick={() => setView("estimates")}><span className="stat-icon blue">▤</span><div><small>見積書</small><strong>{state.estimates.length}<em>件</em></strong><p>うち下書き {state.estimates.filter((e) => e.status === "draft").length}件</p></div></button>
      <button type="button" onClick={() => setView("invoices")}><span className="stat-icon amber">▧</span><div><small>請求書</small><strong>{state.invoices.length}<em>件</em></strong><p>会社別に作成</p></div></button>
      <article><span className="stat-icon green">¥</span><div><small>請求総額</small><strong className="money-stat">{money(total)}</strong><p>登録済み請求書の合計</p></div></article>
      <article><span className="stat-icon green">%</span><div><small>利益</small><strong className="money-stat">{money(profit)}</strong><p>利益率 {state.settings.profitRate}% で計算</p></div></article>
    </section>
    <section className="panel recent"><div className="panel-head"><div><h2>最近の見積書</h2><p>更新日の新しい順</p></div><button className="text-button" onClick={() => setView("estimates")}>すべて見る <Icon name="arrow" /></button></div>
      <div className="estimate-cards">{state.estimates.slice(0, 3).map((e) => <button className="estimate-card" key={e.id} onClick={() => openEditor(e)}><div className="doc-icon">▤</div><div className="card-main"><div><strong>{e.projectName}</strong><span className={`status ${e.status}`}>{e.status === "completed" ? "作成済み" : "下書き"}</span></div><p>{e.customerName}</p><small>⌖ {e.siteAddress}</small></div><div className="card-price"><strong>{money(estimateTotals(e).total)}</strong><small>{e.updatedAt} 更新</small></div></button>)}</div>
    </section>
  </>;
}

function EstimateList({ estimates, query, setQuery, openEditor, completeEstimate, deleteEstimate }: { estimates: Estimate[]; query: string; setQuery: (q: string) => void; openEditor: (e?: Estimate) => void; completeEstimate: (e: Estimate) => void; deleteEstimate: (e: Estimate) => void }) {
  const filtered = estimates.filter((e) => `${e.siteAddress} ${e.customerAddress}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="page-heading"><div><p className="eyebrow">ESTIMATES</p><h1>見積書</h1><p>住所からすばやく見積書を探せます。</p></div><button className="primary" onClick={() => openEditor()}><Icon name="plus" />新しい見積書</button></div>
    <section className="panel"><div className="toolbar"><label className="search"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="工事場所・顧客住所で検索" /></label><span>{filtered.length}件</span></div>
      <div className="table-wrap"><table><thead><tr><th>見積番号</th><th>工事件名 / 住所</th><th>顧客</th><th>更新日</th><th>金額</th><th>状態</th><th></th></tr></thead><tbody>{filtered.map((e) => <tr key={e.id}><td><button className="link" onClick={() => openEditor(e)}>{e.estimateNo}</button></td><td><strong>{e.projectName}</strong><small>{e.siteAddress}</small></td><td>{e.customerName}</td><td>{e.updatedAt}</td><td className="right"><strong>{money(estimateTotals(e).total)}</strong></td><td><span className={`status ${e.status}`}>{e.status === "completed" ? "作成済み" : "下書き"}</span></td><td><div className="action-group">{e.status === "draft" && <button className="outline small" onClick={() => completeEstimate(e)}>作成完了</button>}<button className="outline small danger-button" onClick={() => deleteEstimate(e)}>削除</button></div></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty">該当する見積書はありません</div>}</div>
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
  return <><div className="editor-head"><button className="back" onClick={back}><Icon name="back" /></button><div><p className="eyebrow">{estimate.estimateNo}</p><h1>見積書を編集</h1></div><div className="editor-actions"><span className={`status ${estimate.status}`}>{estimate.status === "completed" ? "作成済み" : "下書き"}</span><button className="primary" onClick={save}><Icon name="save" />保存する</button></div></div>
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
  return <div className="item-row" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); move(placeId, Number(e.dataTransfer.getData("text/plain")), index); }}>
    <span className="grip" title="ドラッグして並べ替え"><Icon name="grip" /></span><span className="item-name"><input value={item.name} onChange={(e) => updateItem({ name: e.target.value })} /><input className="sub-input" value={item.specification} onChange={(e) => updateItem({ specification: e.target.value })} /><small className={`type ${item.type}`}>{item.required ? "必須材料" : item.type === "work" ? "工事マスタ" : "手入力"}</small></span>
    <span className="quantity"><CalculatorInput value={item.quantity} onChange={(quantity) => updateItem({ quantity })} label="数量" /><input value={item.unit} onChange={(e) => updateItem({ unit: e.target.value })} /></span>
    <span><CalculatorInput className="cost" value={item.materialCost} onChange={(materialCost) => updateItem({ materialCost })} label="材料費" /><small>{money(itemMaterial(item))}</small></span>
    <span><CalculatorInput className="cost" value={item.laborCost} onChange={(laborCost) => updateItem({ laborCost })} label="労務費" /><small>{money(itemLabor(item))}</small></span>
    <strong>{money(itemTotal(item))}</strong><span className="row-actions"><button onClick={() => move(placeId, index, index - 1)} aria-label="上へ">↑</button><button onClick={() => move(placeId, index, index + 1)} aria-label="下へ">↓</button>{!item.required && <button className="danger" onClick={remove} aria-label="削除">×</button>}</span>
  </div>;
}

function InvoiceList({ state, persist, onPreview }: { state: AppState; persist: (s: AppState, m: string) => void; onPreview: (invoice: Invoice) => void }) {
  const groups = Object.entries(state.invoices.reduce<Record<string, typeof state.invoices>>((acc, invoice) => { (acc[invoice.companyName] ??= []).push(invoice); return acc; }, {}));
  const toggleEstimateNo = (invoice: Invoice, showEstimateNo: boolean) => {
    persist({ ...state, invoices: state.invoices.map((item) => item.id === invoice.id ? { ...item, showEstimateNo } : item) }, "元見積の表示設定を保存しました");
  };
  const deleteInvoice = (invoice: Invoice) => {
    if (!window.confirm(`${invoice.invoiceNo} を削除しますか？`)) return;
    persist({ ...state, invoices: state.invoices.filter((item) => item.id !== invoice.id) }, "請求書を削除しました");
    if (isSupabaseConfigured) {
      void deleteInvoiceFromSupabase(invoice.id).catch(() => {});
    }
  };
  const toggleInvoiceStatus = (invoice: Invoice) => {
    persist({
      ...state,
      invoices: state.invoices.map((item) => item.id === invoice.id ? { ...item, status: item.status === "draft" ? "issued" : "draft" } : item),
    }, "請求書の状態を更新しました");
  };
  return <><div className="page-heading"><div><p className="eyebrow">INVOICES</p><h1>請求書</h1><p>見積書から作成した請求書を会社別に確認できます。</p></div></div>
    {groups.length === 0 ? <section className="panel empty-state"><div className="big-icon">▧</div><h2>請求書はまだありません</h2><p>見積書一覧の「作成完了」から作成できます。</p></section> : groups.map(([company, invoices]) => <section className="panel invoice-group" key={company}><div className="panel-head"><div><h2>{company}</h2><p>{invoices.length}件の請求書</p></div><strong>{money(invoices.reduce((s, i) => s + invoiceTotal(i), 0))}</strong></div><div className="table-wrap"><table><thead><tr><th>請求番号</th><th>工事件名</th><th>元見積</th><th>請求日</th><th>支払期限</th><th>金額</th><th>状態</th><th></th></tr></thead><tbody>{invoices.map((i) => <tr key={i.id}><td><button className="link" onClick={() => onPreview(i)}>{i.invoiceNo}</button></td><td><strong>{i.projectName}</strong></td><td><label className="estimate-toggle"><input type="checkbox" checked={i.showEstimateNo !== false} onChange={(e) => toggleEstimateNo(i, e.target.checked)} aria-label={`${i.invoiceNo}の元見積を表示`} /><span>{i.showEstimateNo === false ? "非表示" : i.estimateNo}</span></label></td><td><input type="date" value={i.issueDate} onChange={(e) => {
        const issueDate = e.target.value;
        persist({ ...state, invoices: state.invoices.map((x) => x.id === i.id ? { ...x, issueDate, dueDate: addDays(issueDate, state.settings.paymentDueDays) } : x) }, "請求日と支払期限を保存しました");
      }} /></td><td><input type="date" value={i.dueDate} onChange={(e) => persist({ ...state, invoices: state.invoices.map((x) => x.id === i.id ? { ...x, dueDate: e.target.value } : x) }, "支払期限を保存しました")} /></td><td className="right"><strong>{money(invoiceTotal(i))}</strong></td><td><span className={`status ${i.status}`}>{i.status === "issued" ? "発行済み" : "下書き"}</span></td><td><div className="action-group"><button className="outline small" onClick={() => toggleInvoiceStatus(i)}>{i.status === "draft" ? "発行済みにする" : "下書きに戻す"}</button><button className="outline small" onClick={() => onPreview(i)}>プレビュー</button><button className="outline small danger-button" onClick={() => deleteInvoice(i)}>削除</button></div></td></tr>)}</tbody></table></div></section>)}</>;
}

function InvoicePreview({ invoice, company, back }: { invoice: Invoice; company?: AppState["companies"][number]; back: () => void }) {
  const total = invoiceTotal(invoice);
  return <><div className="preview-toolbar"><button className="outline" onClick={back}><Icon name="back" />請求書一覧へ</button><div><span className={`status ${invoice.status}`}>{invoice.status === "issued" ? "発行済み" : "下書き"}</span><button className="primary" onClick={() => window.print()}>印刷する</button></div></div>
    <article className="invoice-preview" aria-label="請求書プレビュー">
      <div className="invoice-top"><div><p className="invoice-label">INVOICE</p><h1>請 求 書</h1></div><div className="issuer"><strong>{company?.name ?? "会社名未設定"}</strong><p>〒{company?.postalCode}<br />{company?.address}</p><p>TEL {company?.phone}</p></div></div>
      <div className="invoice-meta"><div className="recipient"><h2>{invoice.companyName} 御中</h2><p>下記の通りご請求申し上げます。</p></div><dl><div><dt>請求書番号</dt><dd>{invoice.invoiceNo}</dd></div><div><dt>請求日</dt><dd>{invoice.issueDate}</dd></div><div><dt>支払期限</dt><dd>{invoice.dueDate}</dd></div>{invoice.showEstimateNo !== false && <div><dt>元見積番号</dt><dd>{invoice.estimateNo}</dd></div>}</dl></div>
      <div className="invoice-project"><span>件名</span><strong>{invoice.projectName}</strong></div>
      <div className="invoice-total"><span>ご請求金額（税別）</span><strong>{money(total)}</strong></div>
      <table className="invoice-lines"><thead><tr><th>No.</th><th>品名・工事内容</th><th>数量</th><th>単位</th><th>金額</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={`${item.name}-${index}`}><td>{index + 1}</td><td>{item.name}</td><td className="right">{item.quantity}</td><td>{item.unit}</td><td className="right">{money(item.amount)}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>合計</td><td className="right">{money(total)}</td></tr></tfoot></table>
      <div className="invoice-notes"><strong>備考</strong><p>お振込手数料は貴社にてご負担くださいますようお願いいたします。</p><p className="demo-note">※ デモ表示：税・振込先・登録番号は本番仕様確定後に反映します。</p></div>
    </article></>;
}

type CsvRow = Record<string, string>;

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[\s_\-ー・（）()]/g, "");
const pickValue = (row: CsvRow, keys: string[]) => {
  const normalizedKeys = keys.map(normalizeHeader);
  const match = Object.entries(row).find(([key]) => normalizedKeys.includes(normalizeHeader(key)));
  return match?.[1]?.trim() ?? "";
};
const parseCsvNumber = (value: string) => Number(value.replace(/[^\d.-]/g, "")) || 0;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      field += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0];
  const hasHeader = headers.some((header) => /会社|顧客|住所|担当|工事|項目|単位|材料|労務|name|address|contact|category|unit|cost/i.test(header));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const fallbackHeaders = headers.map((_, index) => `col${index + 1}`);
  const activeHeaders = hasHeader ? headers : fallbackHeaders;

  return dataRows.map((values) => activeHeaders.reduce<CsvRow>((record, header, index) => {
    record[header] = values[index] ?? "";
    return record;
  }, {}));
}

function MasterPanel({ state, persist, tab, setTab, session }: { state: AppState; persist: (s: AppState, m: string) => void; tab: string; setTab: (t: string) => void; session: Session | null }) {
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const currentEmail = session?.user.email?.toLowerCase() ?? "";
  const canManageUsers = session?.user.app_metadata?.role === "admin" || adminEmails.includes(currentEmail);
  const tabs = ["会社マスタ", "顧客マスタ", "工事マスタ", "汎用マスタ", "データ取込", "設定", ...(canManageUsers ? ["ユーザー管理"] : [])];
  const addCompany = () => { const company = { id: createId("co"), name: "新規会社", postalCode: "000-0000", address: "東京都", phone: "00-0000-0000" }; persist({ ...state, companies: [...state.companies, company] }, "会社を追加しました"); setEditingCompanyId(company.id); };
  const addCustomer = () => { const customer = { id: createId("cu"), name: "新規顧客株式会社", address: "東京都", contact: "ご担当者様" }; persist({ ...state, customers: [...state.customers, customer] }, "顧客を追加しました"); setEditingCustomerId(customer.id); };
  const addWork = () => { const work = { id: createId("wo"), category: "トイレ工事", name: "新規工事項目", unit: "式", materialCost: 0, laborCost: 0 }; persist({ ...state, workItems: [...state.workItems, work] }, "工事項目を追加しました"); setEditingWorkId(work.id); };
  const updateCompany = (companyId: string, updates: Partial<AppState["companies"][number]>) => persist({ ...state, companies: state.companies.map((company) => company.id === companyId ? { ...company, ...updates } : company) }, "会社マスタを更新しました");
  const updateCustomer = (customerId: string, updates: Partial<AppState["customers"][number]>) => persist({ ...state, customers: state.customers.map((customer) => customer.id === customerId ? { ...customer, ...updates } : customer) }, "顧客マスタを更新しました");
  const updateWork = (workId: string, updates: Partial<AppState["workItems"][number]>) => persist({ ...state, workItems: state.workItems.map((work) => work.id === workId ? { ...work, ...updates } : work) }, "工事マスタを更新しました");
  const deleteCompany = (companyId: string, companyName: string) => { if (!window.confirm(`${companyName} を削除しますか？`)) return; persist({ ...state, companies: state.companies.filter((company) => company.id !== companyId) }, "会社を削除しました"); if (isSupabaseConfigured) void deleteCompanyFromSupabase(companyId).catch(() => {}); if (editingCompanyId === companyId) setEditingCompanyId(null); };
  const deleteCustomer = (customerId: string, customerName: string) => { if (!window.confirm(`${customerName} を削除しますか？`)) return; persist({ ...state, customers: state.customers.filter((customer) => customer.id !== customerId) }, "顧客を削除しました"); if (isSupabaseConfigured) void deleteCustomerFromSupabase(customerId).catch(() => {}); if (editingCustomerId === customerId) setEditingCustomerId(null); };
  const deleteWork = (workId: string, workName: string) => { if (!window.confirm(`${workName} を削除しますか？`)) return; persist({ ...state, workItems: state.workItems.filter((work) => work.id !== workId) }, "工事項目を削除しました"); if (isSupabaseConfigured) void deleteWorkItemFromSupabase(workId).catch(() => {}); if (editingWorkId === workId) setEditingWorkId(null); };
  useEffect(() => {
    if (tab === "ユーザー管理" && !canManageUsers) setTab("会社マスタ");
  }, [canManageUsers, setTab, tab]);
  return <><div className="page-heading"><div><p className="eyebrow">MASTER DATA</p><h1>マスタ管理</h1><p>見積・請求で使う基本データを管理します。</p></div></div><div className="master-tabs">{tabs.map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}</div>
    <section className="panel"><div className="panel-head"><div><h2>{tab}</h2><p>{tab === "汎用マスタ" ? "場所と必須材料" : tab === "ユーザー管理" ? "ログインできるユーザー" : tab === "設定" ? "請求書の既定値" : tab === "データ取込" ? "CSV / PDFからマスタへ追加" : "登録済みデータ"}</p></div>{tab === "会社マスタ" && <button className="primary small" onClick={addCompany}>＋ 会社を追加</button>}{tab === "顧客マスタ" && <button className="primary small" onClick={addCustomer}>＋ 顧客を追加</button>}{tab === "工事マスタ" && <button className="primary small" onClick={addWork}>＋ 工事を追加</button>}</div>
      {tab === "会社マスタ" && <div className="table-wrap"><table><thead><tr><th>会社名</th><th>郵便番号</th><th>住所</th><th>電話番号</th><th></th></tr></thead><tbody>{state.companies.map((company) => { const isEditing = editingCompanyId === company.id; return <tr className={isEditing ? "editing-row" : ""} key={company.id}><td>{isEditing ? <input className="master-input" value={company.name} onChange={(event) => updateCompany(company.id, { name: event.target.value })} /> : <strong>{company.name}</strong>}</td><td>{isEditing ? <input className="master-input compact" value={company.postalCode} onChange={(event) => updateCompany(company.id, { postalCode: event.target.value })} /> : company.postalCode}</td><td>{isEditing ? <input className="master-input" value={company.address} onChange={(event) => updateCompany(company.id, { address: event.target.value })} /> : company.address}</td><td>{isEditing ? <input className="master-input compact" value={company.phone} onChange={(event) => updateCompany(company.id, { phone: event.target.value })} /> : company.phone}</td><td><div className="action-group">{isEditing ? <button className="primary small" onClick={() => setEditingCompanyId(null)}>編集中・完了</button> : <button className="outline small" onClick={() => setEditingCompanyId(company.id)}>編集</button>}<button className="outline small danger-button" onClick={() => deleteCompany(company.id, company.name)}>削除</button></div></td></tr>; })}</tbody></table>{state.companies.length === 0 && <div className="empty">会社はまだありません</div>}</div>}
      {tab === "顧客マスタ" && <div className="table-wrap"><table><thead><tr><th>会社名</th><th>住所</th><th>担当</th><th></th></tr></thead><tbody>{state.customers.map((customer) => { const isEditing = editingCustomerId === customer.id; return <tr className={isEditing ? "editing-row" : ""} key={customer.id}><td>{isEditing ? <input className="master-input" value={customer.name} onChange={(event) => updateCustomer(customer.id, { name: event.target.value })} /> : <strong>{customer.name}</strong>}</td><td>{isEditing ? <input className="master-input" value={customer.address} onChange={(event) => updateCustomer(customer.id, { address: event.target.value })} /> : customer.address}</td><td>{isEditing ? <input className="master-input" value={customer.contact} onChange={(event) => updateCustomer(customer.id, { contact: event.target.value })} /> : customer.contact}</td><td><div className="action-group">{isEditing ? <button className="primary small" onClick={() => setEditingCustomerId(null)}>編集中・完了</button> : <button className="outline small" onClick={() => setEditingCustomerId(customer.id)}>編集</button>}<button className="outline small danger-button" onClick={() => deleteCustomer(customer.id, customer.name)}>削除</button></div></td></tr>; })}</tbody></table>{state.customers.length === 0 && <div className="empty">顧客はまだありません</div>}</div>}
      {tab === "工事マスタ" && <div className="table-wrap"><table><thead><tr><th>工事区分</th><th>工事項目</th><th>単位</th><th>材料費</th><th>労務費</th><th></th></tr></thead><tbody>{state.workItems.map((work) => { const isEditing = editingWorkId === work.id; return <tr className={isEditing ? "editing-row" : ""} key={work.id}><td>{isEditing ? <input className="master-input compact" value={work.category} onChange={(event) => updateWork(work.id, { category: event.target.value })} /> : <span className="category">{work.category}</span>}</td><td>{isEditing ? <input className="master-input" value={work.name} onChange={(event) => updateWork(work.id, { name: event.target.value })} /> : <strong>{work.name}</strong>}</td><td>{isEditing ? <input className="master-input compact" value={work.unit} onChange={(event) => updateWork(work.id, { unit: event.target.value })} /> : work.unit}</td><td>{isEditing ? <CalculatorInput className="master-input compact" value={work.materialCost} onChange={(materialCost) => updateWork(work.id, { materialCost })} label="材料費" /> : money(work.materialCost)}</td><td>{isEditing ? <CalculatorInput className="master-input compact" value={work.laborCost} onChange={(laborCost) => updateWork(work.id, { laborCost })} label="労務費" /> : money(work.laborCost)}</td><td><div className="action-group">{isEditing ? <button className="primary small" onClick={() => setEditingWorkId(null)}>編集中・完了</button> : <button className="outline small" onClick={() => setEditingWorkId(work.id)}>編集</button>}<button className="outline small danger-button" onClick={() => deleteWork(work.id, work.name)}>削除</button></div></td></tr>; })}</tbody></table>{state.workItems.length === 0 && <div className="empty">工事項目はまだありません</div>}</div>}
      {tab === "汎用マスタ" && <PlaceTemplateManager state={state} persist={persist} />}
      {tab === "データ取込" && <DataImportPanel state={state} persist={persist} />}
      {tab === "設定" && <SettingsPanel state={state} persist={persist} />}
      {tab === "ユーザー管理" && <UserRegistrationPanel />}
    </section></>;
}

function DataImportPanel({ state, persist }: { state: AppState; persist: (s: AppState, m: string) => void }) {
  const [target, setTarget] = useState<"customers" | "workItems">("customers");
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [customers, setCustomers] = useState<AppState["customers"]>([]);
  const [workItems, setWorkItems] = useState<AppState["workItems"]>([]);

  const parseRows = (rows: CsvRow[]) => {
    if (target === "customers") {
      const nextCustomers = rows.map((row) => ({
        id: createId("cu"),
        name: pickValue(row, ["会社名", "顧客名", "顧客会社名", "取引先名", "name", "customer", "col1"]),
        address: pickValue(row, ["住所", "所在地", "address", "col2"]),
        contact: pickValue(row, ["担当", "担当者", "担当者名", "contact", "person", "col3"]),
      })).filter((customer) => customer.name).map((customer, index) => ({
        ...customer,
        contact: customer.contact || `取込データ ${index + 1}`,
      }));
      setCustomers(nextCustomers);
      setWorkItems([]);
      setMessage(nextCustomers.length > 0 ? `${nextCustomers.length}件の顧客データを読み込みました。内容を確認して保存してください。` : "顧客名として使える列が見つかりませんでした。");
      return;
    }

    const nextWorkItems = rows.map((row) => ({
      id: createId("wo"),
      category: pickValue(row, ["工事区分", "分類", "カテゴリ", "category", "col1"]) || "未分類",
      name: pickValue(row, ["工事項目", "工事名", "項目名", "名称", "name", "item", "col2"]),
      unit: pickValue(row, ["単位", "unit", "col3"]) || "式",
      materialCost: parseCsvNumber(pickValue(row, ["材料費", "材料単価", "材料", "materialCost", "material", "col4"])),
      laborCost: parseCsvNumber(pickValue(row, ["労務費", "労務単価", "工賃", "laborCost", "labor", "col5"])),
    })).filter((work) => work.name);
    setCustomers([]);
    setWorkItems(nextWorkItems);
    setMessage(nextWorkItems.length > 0 ? `${nextWorkItems.length}件の工事データを読み込みました。内容を確認して保存してください。` : "工事項目として使える列が見つかりませんでした。");
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setCustomers([]);
    setWorkItems([]);

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("PDFはファイル形式ごとに文字抽出方法が変わるため、現時点では自動取込の入口だけ用意しています。PDFの中身が分かり次第、列の読み取りルールを追加します。");
      return;
    }

    const text = await file.text();
    const rows = parseCsv(text);
    parseRows(rows);
  };

  const saveImported = () => {
    if (target === "customers") {
      if (customers.length === 0) {
        setMessage("保存できる顧客データがありません。");
        return;
      }
      const merged = [...state.customers];
      customers.forEach((customer) => {
        const existingIndex = merged.findIndex((item) => item.name === customer.name);
        if (existingIndex >= 0) {
          merged[existingIndex] = { ...merged[existingIndex], address: customer.address, contact: customer.contact };
        } else {
          merged.push(customer);
        }
      });
      persist({ ...state, customers: merged }, `${customers.length}件の顧客データを保存しました`);
      setMessage(`${customers.length}件の顧客データを保存しました。同じ会社名は上書きしています。`);
      return;
    }

    if (workItems.length === 0) {
      setMessage("保存できる工事データがありません。");
      return;
    }
    const merged = [...state.workItems];
    workItems.forEach((work) => {
      const existingIndex = merged.findIndex((item) => item.category === work.category && item.name === work.name);
      if (existingIndex >= 0) {
        merged[existingIndex] = { ...merged[existingIndex], unit: work.unit, materialCost: work.materialCost, laborCost: work.laborCost };
      } else {
        merged.push(work);
      }
    });
    persist({ ...state, workItems: merged }, `${workItems.length}件の工事データを保存しました`);
    setMessage(`${workItems.length}件の工事データを保存しました。同じ工事区分・項目名は上書きしています。`);
  };

  const activeRows = target === "customers" ? customers : workItems;

  return <div className="import-panel">
    <div className="import-controls">
      <label>取り込み先<select value={target} onChange={(event) => {
        setTarget(event.target.value as "customers" | "workItems");
        setCustomers([]);
        setWorkItems([]);
        setMessage("");
      }}><option value="customers">顧客マスタ</option><option value="workItems">工事マスタ</option></select></label>
      <label>CSV / PDFファイル<input type="file" accept=".csv,text/csv,.pdf,application/pdf" onChange={(event) => { void loadFile(event.target.files?.[0]); }} /></label>
      <button className="primary" onClick={saveImported} disabled={activeRows.length === 0}>データベースへ保存</button>
    </div>
    <p className="import-note">CSVは列名から自動判定します。顧客は「会社名・住所・担当」、工事は「工事区分・工事項目・単位・材料費・労務費」を優先して読み込みます。</p>
    {fileName && <p className="import-file">選択中: {fileName}</p>}
    {message && <p className="user-admin-message">{message}</p>}
    {target === "customers" && customers.length > 0 && <div className="table-wrap"><table><thead><tr><th>会社名</th><th>住所</th><th>担当</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td>{customer.address || "-"}</td><td>{customer.contact}</td></tr>)}</tbody></table></div>}
    {target === "workItems" && workItems.length > 0 && <div className="table-wrap"><table><thead><tr><th>工事区分</th><th>工事項目</th><th>単位</th><th>材料費</th><th>労務費</th></tr></thead><tbody>{workItems.map((work) => <tr key={work.id}><td><span className="category">{work.category}</span></td><td><strong>{work.name}</strong></td><td>{work.unit}</td><td>{money(work.materialCost)}</td><td>{money(work.laborCost)}</td></tr>)}</tbody></table></div>}
  </div>;
}

function PlaceTemplateManager({ state, persist }: { state: AppState; persist: (s: AppState, m: string) => void }) {
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const updateTemplate = (templateId: string, updates: Partial<AppState["placeTemplates"][number]>) => {
    persist({
      ...state,
      placeTemplates: state.placeTemplates.map((template) => template.id === templateId ? { ...template, ...updates } : template),
    }, "汎用マスタを更新しました");
  };

  const updateMaterial = (templateId: string, materialId: string, updates: Partial<AppState["placeTemplates"][number]["materials"][number]>) => {
    persist({
      ...state,
      placeTemplates: state.placeTemplates.map((template) => template.id === templateId ? {
        ...template,
        materials: template.materials.map((material) => material.id === materialId ? { ...material, ...updates } : material),
      } : template),
    }, "必須材料を更新しました");
  };

  const addTemplate = () => {
    const template = { id: createId("pl"), name: "新規場所", materials: [] };
    persist({
      ...state,
      placeTemplates: [...state.placeTemplates, template],
    }, "場所を追加しました");
    setEditingTemplateId(template.id);
  };

  const addMaterial = (templateId: string) => {
    persist({
      ...state,
      placeTemplates: state.placeTemplates.map((template) => template.id === templateId ? {
        ...template,
        materials: [...template.materials, { id: createId("ma"), name: "新規材料", unit: "式", quantity: 1, materialCost: 0 }],
      } : template),
    }, "必須材料を追加しました");
  };

  const deleteTemplate = (templateId: string, templateName: string) => {
    if (!window.confirm(`${templateName} を削除しますか？`)) return;
    persist({
      ...state,
      placeTemplates: state.placeTemplates.filter((template) => template.id !== templateId),
    }, "場所を削除しました");
    if (isSupabaseConfigured) {
      void deletePlaceTemplateFromSupabase(templateId).catch(() => {});
    }
    if (editingTemplateId === templateId) setEditingTemplateId(null);
  };

  const deleteMaterial = (templateId: string, materialId: string) => {
    persist({
      ...state,
      placeTemplates: state.placeTemplates.map((template) => template.id === templateId ? {
        ...template,
        materials: template.materials.filter((material) => material.id !== materialId),
      } : template),
    }, "必須材料を削除しました");
    if (isSupabaseConfigured) {
      void deleteMaterialTemplateFromSupabase(materialId).catch(() => {});
    }
  };

  return <div className="template-editor">
    <div className="template-toolbar"><p>見積作成時の「場所を追加」で呼び出す場所と必須材料です。</p><button className="primary small" onClick={addTemplate}>＋ 場所を追加</button></div>
    <div className="template-grid">{state.placeTemplates.map((template) => {
      const isEditing = editingTemplateId === template.id;
      return <article className={isEditing ? "editing-card" : ""} key={template.id}>
        <div className="template-head"><span className="place-dot">⌖</span>{isEditing ? <label>場所名<input value={template.name} onChange={(event) => updateTemplate(template.id, { name: event.target.value })} /></label> : <div><h3>{template.name}</h3><small>必須材料 {template.materials.length}件</small></div>}<div className="template-actions">{isEditing ? <button className="primary small" onClick={() => setEditingTemplateId(null)}>編集中・完了</button> : <button className="outline small" onClick={() => setEditingTemplateId(template.id)}>編集</button>}<button className="outline small danger-button" onClick={() => deleteTemplate(template.id, template.name)}>削除</button></div></div>
        {isEditing ? <><div className="material-editor-list">
          {template.materials.map((material) => <div className="material-editor" key={material.id}>
            <label>材料名<input value={material.name} onChange={(event) => updateMaterial(template.id, material.id, { name: event.target.value })} /></label>
            <div className="field-label"><span>数量</span><CalculatorInput value={material.quantity} onChange={(quantity) => updateMaterial(template.id, material.id, { quantity })} label="数量" /></div>
            <label>単位<input value={material.unit} onChange={(event) => updateMaterial(template.id, material.id, { unit: event.target.value })} /></label>
            <div className="field-label"><span>材料費</span><CalculatorInput value={material.materialCost} onChange={(materialCost) => updateMaterial(template.id, material.id, { materialCost })} label="材料費" /></div>
            <button className="outline small danger-button" onClick={() => deleteMaterial(template.id, material.id)}>削除</button>
          </div>)}
        </div><button className="outline small add-material" onClick={() => addMaterial(template.id)}>＋ 材料を追加</button></> : <ul>{template.materials.map((material) => <li key={material.id}><span>{material.name}</span><strong>{material.quantity}{material.unit} · {money(material.materialCost)}</strong></li>)}</ul>}
      </article>;
    })}</div>
  </div>;
}

function SettingsPanel({ state, persist }: { state: AppState; persist: (s: AppState, m: string) => void }) {
  const updateDueDays = (value: number) => {
    const paymentDueDays = Math.max(0, Math.round(value) || 0);
    persist({
      ...state,
      settings: { ...state.settings, paymentDueDays },
      invoices: state.invoices.map((invoice) => invoice.status === "draft" ? { ...invoice, dueDate: addDays(invoice.issueDate, paymentDueDays) } : invoice),
    }, "支払期限の既定値を保存しました");
  };
  const updateProfitRate = (value: number) => {
    const profitRate = Math.max(0, Math.min(100, Number(value) || 0));
    persist({
      ...state,
      settings: { ...state.settings, profitRate },
    }, "利益率を保存しました");
  };

  return <div className="settings-panel">
    <div className="field-label"><span>支払期限</span><CalculatorInput value={state.settings.paymentDueDays} onChange={updateDueDays} label="支払期限" /></div>
    <p>請求書を作成した日から何日後を支払期限にするかを設定します。</p>
    <div className="field-label"><span>利益率（%）</span><CalculatorInput value={state.settings.profitRate} onChange={updateProfitRate} label="利益率" /></div>
    <p>請求総額に対して何%を利益として表示するかを設定します。</p>
  </div>;
}

function UserRegistrationPanel() {
  type AuthUser = { id: string; email?: string; isAdmin: boolean; isBootstrapAdmin: boolean; confirmedAt?: string; createdAt: string; lastSignInAt?: string };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [users, setUsers] = useState<AuthUser[]>([]);

  const formatDateTime = (value?: string) => value ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";

  const getAccessToken = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const currentToken = sessionData.session?.access_token;
    if (currentToken) {
      const { error } = await supabase.auth.getUser(currentToken);
      if (!error) return currentToken;
    }

    const { data: refreshed } = await supabase.auth.refreshSession();
    const refreshedToken = refreshed.session?.access_token;
    if (refreshedToken) {
      const { error } = await supabase.auth.getUser(refreshedToken);
      if (!error) return refreshedToken;
    }

    await supabase.auth.signOut();
    setMessage("セッションが無効です。再ログインしてください。");
    return undefined;
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersLoaded(false);
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage("ログイン状態を確認できませんでした。再ログインしてください。");
      setLoadingUsers(false);
      return;
    }

    try {
      let response = await fetch("/api/users", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 401) {
        const retryToken = await getAccessToken();
        if (retryToken) {
          response = await fetch("/api/users", {
            cache: "no-store",
            headers: { Authorization: `Bearer ${retryToken}` },
          });
        }
      }

      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "ユーザー一覧を取得できませんでした。");
        return;
      }

      setUsers(result.users ?? []);
      setUsersLoaded(true);
    } catch {
      setMessage("ユーザー一覧を取得できませんでした。サーバー設定を確認してください。");
    } finally {
      setLoadingUsers(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage("ログイン状態を確認できませんでした。再ログインしてください。");
      setSubmitting(false);
      return;
    }

    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email, password }),
    });
    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error ?? "ユーザーを登録できませんでした。");
      setSubmitting(false);
      return;
    }

    setEmail("");
    setPassword("");
    setMessage(`${result.email} を登録しました。`);
    setSubmitting(false);
    await loadUsers();
  };

  const setAdmin = async (user: AuthUser, isAdmin: boolean) => {
    setMessage("");
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage("ログイン状態を確認できませんでした。再ログインしてください。");
      return;
    }

    const response = await fetch("/api/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ userId: user.id, isAdmin }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "管理者権限を更新できませんでした。");
      return;
    }

    setMessage(`${result.email} の権限を更新しました。`);
    await loadUsers();
  };

  const deleteUser = async (user: AuthUser) => {
    if (!user.email || !window.confirm(`${user.email} を削除しますか？`)) return;
    setMessage("");
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage("ログイン状態を確認できませんでした。再ログインしてください。");
      return;
    }

    const response = await fetch("/api/users", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ userId: user.id }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "ユーザーを削除できませんでした。");
      return;
    }

    setMessage(`${result.email} を削除しました。`);
    await loadUsers();
  };

  return <div className="user-admin">
    <form className="user-form" onSubmit={createUser}>
      <label>メールアドレス<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" required /></label>
      <label>初期パスワード<span className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /><button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? "非表示" : "表示"}</button></span></label>
      <button className="primary" disabled={submitting}>{submitting ? "登録中…" : "ユーザーを登録"}</button>
    </form>
    {message && <p className="user-admin-message">{message}</p>}
    <p className="user-admin-note">登録したユーザーは、このメールアドレスと初期パスワードでログインできます。パスワードは8文字以上です。登録できるのは管理者だけです。</p>
    <div className="user-list-head"><h3>登録ユーザー一覧</h3><button className="outline small" onClick={loadUsers} disabled={loadingUsers}>{loadingUsers ? "読込中…" : "更新"}</button></div>
    <div className="table-wrap"><table><thead><tr><th>メールアドレス</th><th>権限</th><th>確認状態</th><th>作成日</th><th>最終ログイン</th><th></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.email ?? "-"}</strong>{user.isBootstrapAdmin && <small>初期管理者</small>}</td><td><span className={`status ${user.isAdmin ? "issued" : "draft"}`}>{user.isAdmin ? "管理者" : "一般"}</span></td><td><span className={`status ${user.confirmedAt ? "completed" : "draft"}`}>{user.confirmedAt ? "確認済み" : "未確認"}</span></td><td>{formatDateTime(user.createdAt)}</td><td>{formatDateTime(user.lastSignInAt)}</td><td><div className="action-group"><button className="outline small" disabled={user.isBootstrapAdmin} onClick={() => setAdmin(user, !user.isAdmin)}>{user.isAdmin ? "一般にする" : "管理者にする"}</button><button className="outline small danger-button" disabled={user.isBootstrapAdmin} onClick={() => deleteUser(user)}>削除</button></div></td></tr>)}</tbody></table>{users.length === 0 && <div className="empty">{loadingUsers ? "ユーザー一覧を読み込んでいます" : usersLoaded ? "登録ユーザーはまだありません" : "ユーザー一覧を取得できませんでした。更新を押してください。"}</div>}</div>
  </div>;
}
