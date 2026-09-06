export type Company = { id: string; name: string; postalCode: string; address: string; phone: string };
export type Customer = { id: string; name: string; address: string; contact: string };
export type WorkItem = { id: string; category: string; name: string; unit: string; materialCost: number; laborCost: number };
export type MaterialTemplate = { id: string; name: string; unit: string; quantity: number; materialCost: number };
export type PlaceTemplate = { id: string; name: string; materials: MaterialTemplate[] };
export type EstimateItem = { id: string; sourceId?: string; type: "material" | "work" | "manual"; name: string; specification: string; quantity: number; unit: string; materialCost: number; laborCost: number; sortOrder: number; required?: boolean };
export type EstimatePlace = { id: string; name: string; items: EstimateItem[] };
export type Estimate = { id: string; estimateNo: string; customerId: string; customerName: string; customerAddress: string; projectName: string; siteAddress: string; status: "draft" | "completed"; createdAt: string; updatedAt: string; places: EstimatePlace[] };
export type Invoice = { id: string; invoiceNo: string; estimateId: string; estimateNo: string; customerId: string; companyName: string; projectName: string; issueDate: string; dueDate: string; amount: number; status: "draft" | "issued"; items: { name: string; quantity: number; unit: string; amount: number }[] };
export type AppState = { companies: Company[]; customers: Customer[]; workItems: WorkItem[]; placeTemplates: PlaceTemplate[]; estimates: Estimate[]; invoices: Invoice[] };

export const money = (value: number) => new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(Math.round(value));
export const itemMaterial = (item: EstimateItem) => item.quantity * item.materialCost;
export const itemLabor = (item: EstimateItem) => item.quantity * item.laborCost;
export const itemTotal = (item: EstimateItem) => itemMaterial(item) + itemLabor(item);
export const estimateTotals = (estimate: Estimate) => {
  const items = estimate.places.flatMap((place) => place.items);
  const material = items.reduce((sum, item) => sum + itemMaterial(item), 0);
  const labor = items.reduce((sum, item) => sum + itemLabor(item), 0);
  return { material, labor, total: material + labor };
};
export const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export const initialState: AppState = {
  companies: [{ id: "co-1", name: "遠藤設備株式会社", postalCode: "100-0005", address: "東京都千代田区丸の内1-1-1", phone: "03-1234-5678" }],
  customers: [
    { id: "cu-1", name: "青葉不動産株式会社", address: "東京都世田谷区桜丘2-8-12", contact: "施設管理部 佐藤様" },
    { id: "cu-2", name: "株式会社みなと商事", address: "神奈川県横浜市中区海岸通3-5", contact: "総務部 高橋様" },
    { id: "cu-3", name: "西東京メディカル", address: "東京都練馬区石神井町4-10-2", contact: "事務長 鈴木様" },
  ],
  workItems: [
    { id: "wo-1", category: "トイレ工事", name: "便器取付工事", unit: "台", materialCost: 48000, laborCost: 18000 },
    { id: "wo-2", category: "トイレ工事", name: "給排水接続工事", unit: "式", materialCost: 8500, laborCost: 24000 },
    { id: "wo-3", category: "トイレ工事", name: "既設便器撤去・処分", unit: "台", materialCost: 3000, laborCost: 12000 },
    { id: "wo-4", category: "洗面所工事", name: "洗面化粧台取付", unit: "台", materialCost: 62000, laborCost: 22000 },
    { id: "wo-5", category: "キッチン工事", name: "水栓交換工事", unit: "台", materialCost: 28000, laborCost: 15000 },
  ],
  placeTemplates: [
    { id: "pl-1", name: "トイレ", materials: [
      { id: "ma-1", name: "止水栓", unit: "個", quantity: 1, materialCost: 3200 },
      { id: "ma-2", name: "給水フレキ管", unit: "本", quantity: 1, materialCost: 1800 },
      { id: "ma-3", name: "シール材・雑材", unit: "式", quantity: 1, materialCost: 2500 },
    ] },
    { id: "pl-2", name: "洗面所", materials: [
      { id: "ma-4", name: "排水トラップ", unit: "個", quantity: 1, materialCost: 4800 },
      { id: "ma-5", name: "接続管・雑材", unit: "式", quantity: 1, materialCost: 3200 },
    ] },
    { id: "pl-3", name: "キッチン", materials: [
      { id: "ma-6", name: "給水接続部材", unit: "式", quantity: 1, materialCost: 4500 },
      { id: "ma-7", name: "シール材・雑材", unit: "式", quantity: 1, materialCost: 2800 },
    ] },
  ],
  estimates: [
    { id: "es-1", estimateNo: "EST-2026-001", customerId: "cu-1", customerName: "青葉不動産株式会社", customerAddress: "東京都世田谷区桜丘2-8-12", projectName: "桜丘レジデンス 2階トイレ改修", siteAddress: "東京都世田谷区桜丘2-10-4", status: "completed", createdAt: "2026-09-02", updatedAt: "2026-09-04", places: [{ id: "ep-1", name: "2階 共用トイレ", items: [
      { id: "ei-1", sourceId: "ma-1", type: "material", name: "止水栓", specification: "標準品", quantity: 2, unit: "個", materialCost: 3200, laborCost: 0, sortOrder: 0, required: true },
      { id: "ei-2", sourceId: "wo-1", type: "work", name: "便器取付工事", specification: "洋式便器", quantity: 2, unit: "台", materialCost: 48000, laborCost: 18000, sortOrder: 1 },
      { id: "ei-3", sourceId: "wo-3", type: "work", name: "既設便器撤去・処分", specification: "搬出含む", quantity: 2, unit: "台", materialCost: 3000, laborCost: 12000, sortOrder: 2 },
    ] }] },
    { id: "es-2", estimateNo: "EST-2026-002", customerId: "cu-2", customerName: "株式会社みなと商事", customerAddress: "神奈川県横浜市中区海岸通3-5", projectName: "本社給湯室 水栓更新", siteAddress: "神奈川県横浜市西区みなとみらい2-2-1", status: "draft", createdAt: "2026-09-05", updatedAt: "2026-09-05", places: [{ id: "ep-2", name: "3階 給湯室", items: [
      { id: "ei-4", sourceId: "wo-5", type: "work", name: "水栓交換工事", specification: "混合水栓", quantity: 1, unit: "台", materialCost: 28000, laborCost: 15000, sortOrder: 0 },
    ] }] },
  ],
  invoices: [],
};
