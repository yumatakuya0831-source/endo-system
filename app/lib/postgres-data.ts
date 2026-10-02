import "server-only";
import type { PoolClient, QueryResultRow } from "pg";
import {
  type AppState,
  type Company,
  type Customer,
  type Estimate,
  type EstimateItem,
  type EstimatePlace,
  type Invoice,
  type MaterialTemplate,
  type PlaceTemplate,
  type WorkItem,
  initialState,
} from "./domain";
import { getPostgresPool } from "./postgres";

type MaterialTemplateRow = {
  id: string;
  place_template_id: string;
  name: string;
  unit: string;
  quantity: string | number;
  material_cost: string | number;
  sort_order: number;
};

type EstimatePlaceRow = { id: string; estimate_id: string; name: string; sort_order: number };
type EstimateItemRow = {
  id: string;
  estimate_place_id: string;
  source_id: string | null;
  type: EstimateItem["type"];
  name: string;
  specification: string;
  quantity: string | number;
  unit: string;
  material_cost: string | number;
  labor_cost: string | number;
  sort_order: number;
  required: boolean;
};
type InvoiceItemRow = {
  invoice_id: string;
  sort_order: number;
  name: string;
  quantity: string | number;
  unit: string;
  amount: string | number;
};

const bySortOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

async function queryRows<T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[] = []) {
  const result = await client.query<T>(sql, params);
  return result.rows;
}

export async function loadAppStateFromPostgres(): Promise<AppState> {
  const client = await getPostgresPool().connect();
  try {
    const [
      companiesRows,
      customerRows,
      workItemRows,
      placeTemplateRows,
      materialRows,
      estimateRows,
      estimatePlaceRows,
      estimateItemRows,
      invoiceRows,
      invoiceItemRows,
      settingsRows,
    ] = await Promise.all([
      queryRows<{ id: string; name: string; postal_code: string; address: string; phone: string }>(client, "select id, name, postal_code, address, phone from companies order by id"),
      queryRows<Customer>(client, "select id, name, address, contact from customers order by id"),
      queryRows<{ id: string; category: string; name: string; unit: string; material_cost: string | number; labor_cost: string | number }>(client, "select id, category, name, unit, material_cost, labor_cost from work_items order by id"),
      queryRows<{ id: string; name: string }>(client, "select id, name from place_templates order by id"),
      queryRows<MaterialTemplateRow>(client, "select id, place_template_id, name, unit, quantity, material_cost, sort_order from material_templates order by sort_order"),
      queryRows<{ id: string; estimate_no: string; customer_id: string | null; customer_name: string; customer_address: string; project_name: string; site_address: string; status: Estimate["status"]; created_at: string; updated_at: string }>(client, "select id, estimate_no, customer_id, customer_name, customer_address, project_name, site_address, status, created_at, updated_at from estimates order by updated_at desc"),
      queryRows<EstimatePlaceRow>(client, "select id, estimate_id, name, sort_order from estimate_places order by sort_order"),
      queryRows<EstimateItemRow>(client, "select id, estimate_place_id, source_id, type, name, specification, quantity, unit, material_cost, labor_cost, sort_order, required from estimate_items order by sort_order"),
      queryRows<{ id: string; invoice_no: string; estimate_id: string | null; estimate_no: string; show_estimate_no?: boolean; customer_id: string | null; company_name: string; project_name: string; issue_date: string; due_date: string; amount: string | number; status: Invoice["status"] }>(client, "select id, invoice_no, estimate_id, estimate_no, coalesce(show_estimate_no, true) as show_estimate_no, customer_id, company_name, project_name, issue_date, due_date, amount, status from invoices order by issue_date desc"),
      queryRows<InvoiceItemRow>(client, "select invoice_id, sort_order, name, quantity, unit, amount from invoice_items order by sort_order"),
      queryRows<{ payment_due_days: number; profit_rate: string | number }>(client, "select payment_due_days, profit_rate from app_settings where id = 'default' limit 1"),
    ]);

    const companies = companiesRows.map((company): Company => ({
      id: company.id,
      name: company.name,
      postalCode: company.postal_code,
      address: company.address,
      phone: company.phone,
    }));
    const workItems = workItemRows.map((item): WorkItem => ({
      id: item.id,
      category: item.category,
      name: item.name,
      unit: item.unit,
      materialCost: Number(item.material_cost),
      laborCost: Number(item.labor_cost),
    }));
    const placeTemplates = placeTemplateRows.map((template): PlaceTemplate => ({
      id: template.id,
      name: template.name,
      materials: materialRows
        .filter((material) => material.place_template_id === template.id)
        .sort(bySortOrder)
        .map((material): MaterialTemplate => ({
          id: material.id,
          name: material.name,
          unit: material.unit,
          quantity: Number(material.quantity),
          materialCost: Number(material.material_cost),
        })),
    }));
    const estimates = estimateRows.map((estimate): Estimate => ({
      id: estimate.id,
      estimateNo: estimate.estimate_no,
      customerId: estimate.customer_id ?? "",
      customerName: estimate.customer_name,
      customerAddress: estimate.customer_address,
      projectName: estimate.project_name,
      siteAddress: estimate.site_address,
      status: estimate.status,
      createdAt: String(estimate.created_at).slice(0, 10),
      updatedAt: String(estimate.updated_at).slice(0, 10),
      places: estimatePlaceRows
        .filter((place) => place.estimate_id === estimate.id)
        .sort(bySortOrder)
        .map((place): EstimatePlace => ({
          id: place.id,
          name: place.name,
          items: estimateItemRows
            .filter((item) => item.estimate_place_id === place.id)
            .sort(bySortOrder)
            .map((item): EstimateItem => ({
              id: item.id,
              sourceId: item.source_id ?? undefined,
              type: item.type,
              name: item.name,
              specification: item.specification,
              quantity: Number(item.quantity),
              unit: item.unit,
              materialCost: Number(item.material_cost),
              laborCost: Number(item.labor_cost),
              sortOrder: item.sort_order,
              required: item.required || undefined,
            })),
        })),
    }));
    const invoices = invoiceRows.map((invoice): Invoice => ({
      id: invoice.id,
      invoiceNo: invoice.invoice_no,
      estimateId: invoice.estimate_id ?? "",
      estimateNo: invoice.estimate_no,
      showEstimateNo: invoice.show_estimate_no ?? true,
      customerId: invoice.customer_id ?? "",
      companyName: invoice.company_name,
      projectName: invoice.project_name,
      issueDate: String(invoice.issue_date).slice(0, 10),
      dueDate: String(invoice.due_date).slice(0, 10),
      amount: Number(invoice.amount),
      status: invoice.status,
      items: invoiceItemRows
        .filter((item) => item.invoice_id === invoice.id)
        .sort(bySortOrder)
        .map((item) => ({
          name: item.name,
          quantity: Number(item.quantity),
          unit: item.unit,
          amount: Number(item.amount),
        })),
    }));
    const settings = settingsRows[0]
      ? { paymentDueDays: Number(settingsRows[0].payment_due_days), profitRate: Number(settingsRows[0].profit_rate) }
      : initialState.settings;

    return { companies, customers: customerRows, workItems, placeTemplates, estimates, invoices, settings };
  } finally {
    client.release();
  }
}

const upsert = (client: PoolClient, sql: string, values: unknown[]) => client.query(sql, values);

export async function saveAppStateToPostgres(state: AppState): Promise<void> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("begin");

    for (const company of state.companies) {
      await upsert(client, "insert into companies (id, name, postal_code, address, phone, updated_at) values ($1, $2, $3, $4, $5, now()) on conflict (id) do update set name = excluded.name, postal_code = excluded.postal_code, address = excluded.address, phone = excluded.phone, updated_at = now()", [company.id, company.name, company.postalCode, company.address, company.phone]);
    }
    for (const customer of state.customers) {
      await upsert(client, "insert into customers (id, name, address, contact, updated_at) values ($1, $2, $3, $4, now()) on conflict (id) do update set name = excluded.name, address = excluded.address, contact = excluded.contact, updated_at = now()", [customer.id, customer.name, customer.address, customer.contact]);
    }
    for (const work of state.workItems) {
      await upsert(client, "insert into work_items (id, category, name, unit, material_cost, labor_cost, updated_at) values ($1, $2, $3, $4, $5, $6, now()) on conflict (id) do update set category = excluded.category, name = excluded.name, unit = excluded.unit, material_cost = excluded.material_cost, labor_cost = excluded.labor_cost, updated_at = now()", [work.id, work.category, work.name, work.unit, work.materialCost, work.laborCost]);
    }
    for (const template of state.placeTemplates) {
      await upsert(client, "insert into place_templates (id, name, updated_at) values ($1, $2, now()) on conflict (id) do update set name = excluded.name, updated_at = now()", [template.id, template.name]);
      await client.query("delete from material_templates where place_template_id = $1", [template.id]);
      for (const [index, material] of template.materials.entries()) {
        await upsert(client, "insert into material_templates (id, place_template_id, name, unit, quantity, material_cost, sort_order, updated_at) values ($1, $2, $3, $4, $5, $6, $7, now()) on conflict (id) do update set place_template_id = excluded.place_template_id, name = excluded.name, unit = excluded.unit, quantity = excluded.quantity, material_cost = excluded.material_cost, sort_order = excluded.sort_order, updated_at = now()", [material.id, template.id, material.name, material.unit, material.quantity, material.materialCost, index]);
      }
    }
    for (const estimate of state.estimates) {
      await upsert(client, "insert into estimates (id, estimate_no, customer_id, customer_name, customer_address, project_name, site_address, status, created_at, updated_at) values ($1, $2, nullif($3, ''), $4, $5, $6, $7, $8, $9, $10) on conflict (id) do update set estimate_no = excluded.estimate_no, customer_id = excluded.customer_id, customer_name = excluded.customer_name, customer_address = excluded.customer_address, project_name = excluded.project_name, site_address = excluded.site_address, status = excluded.status, created_at = excluded.created_at, updated_at = excluded.updated_at", [estimate.id, estimate.estimateNo, estimate.customerId, estimate.customerName, estimate.customerAddress, estimate.projectName, estimate.siteAddress, estimate.status, estimate.createdAt, estimate.updatedAt]);
      await client.query("delete from estimate_places where estimate_id = $1", [estimate.id]);
      for (const [placeIndex, place] of estimate.places.entries()) {
        await upsert(client, "insert into estimate_places (id, estimate_id, name, sort_order) values ($1, $2, $3, $4)", [place.id, estimate.id, place.name, placeIndex]);
        for (const [itemIndex, item] of place.items.entries()) {
          await upsert(client, "insert into estimate_items (id, estimate_place_id, source_id, type, name, specification, quantity, unit, material_cost, labor_cost, sort_order, required) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)", [item.id, place.id, item.sourceId ?? null, item.type, item.name, item.specification, item.quantity, item.unit, item.materialCost, item.laborCost, itemIndex, item.required ?? false]);
        }
      }
    }
    for (const invoice of state.invoices) {
      await upsert(client, "insert into invoices (id, invoice_no, estimate_id, estimate_no, show_estimate_no, customer_id, company_name, project_name, issue_date, due_date, amount, status) values ($1, $2, nullif($3, ''), $4, $5, nullif($6, ''), $7, $8, $9, $10, $11, $12) on conflict (id) do update set invoice_no = excluded.invoice_no, estimate_id = excluded.estimate_id, estimate_no = excluded.estimate_no, show_estimate_no = excluded.show_estimate_no, customer_id = excluded.customer_id, company_name = excluded.company_name, project_name = excluded.project_name, issue_date = excluded.issue_date, due_date = excluded.due_date, amount = excluded.amount, status = excluded.status", [invoice.id, invoice.invoiceNo, invoice.estimateId, invoice.estimateNo, invoice.showEstimateNo ?? true, invoice.customerId, invoice.companyName, invoice.projectName, invoice.issueDate, invoice.dueDate, invoice.amount, invoice.status]);
      await client.query("delete from invoice_items where invoice_id = $1", [invoice.id]);
      for (const [index, item] of invoice.items.entries()) {
        await upsert(client, "insert into invoice_items (invoice_id, sort_order, name, quantity, unit, amount) values ($1, $2, $3, $4, $5, $6)", [invoice.id, index, item.name, item.quantity, item.unit, item.amount]);
      }
    }
    await upsert(client, "insert into app_settings (id, payment_due_days, profit_rate, updated_at) values ('default', $1, $2, now()) on conflict (id) do update set payment_due_days = excluded.payment_due_days, profit_rate = excluded.profit_rate, updated_at = now()", [state.settings.paymentDueDays, state.settings.profitRate]);

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
