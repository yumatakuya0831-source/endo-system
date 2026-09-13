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
import { getSupabaseBrowserClient } from "./supabase";

type MaterialTemplateRow = {
  id: string;
  place_template_id: string;
  name: string;
  unit: string;
  quantity: number;
  material_cost: number;
  sort_order: number;
};

type EstimatePlaceRow = {
  id: string;
  estimate_id: string;
  name: string;
  sort_order: number;
};

type EstimateItemRow = {
  id: string;
  estimate_place_id: string;
  source_id: string | null;
  type: EstimateItem["type"];
  name: string;
  specification: string;
  quantity: number;
  unit: string;
  material_cost: number;
  labor_cost: number;
  sort_order: number;
  required: boolean;
};

type InvoiceItemRow = {
  invoice_id: string;
  sort_order: number;
  name: string;
  quantity: number;
  unit: string;
  amount: number;
};

const bySortOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

function requireData<T>(data: T[] | null, error: { message: string } | null): T[] {
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadAppStateFromSupabase(): Promise<AppState> {
  const supabase = getSupabaseBrowserClient();

  const [
    companiesResult,
    customersResult,
    workItemsResult,
    placeTemplatesResult,
    materialTemplatesResult,
    estimatesResult,
    estimatePlacesResult,
    estimateItemsResult,
    invoicesResult,
    invoiceItemsResult,
    settingsResult,
  ] = await Promise.all([
    supabase.from("companies").select("id,name,postal_code,address,phone").order("id"),
    supabase.from("customers").select("id,name,address,contact").order("id"),
    supabase.from("work_items").select("id,category,name,unit,material_cost,labor_cost").order("id"),
    supabase.from("place_templates").select("id,name").order("id"),
    supabase.from("material_templates").select("id,place_template_id,name,unit,quantity,material_cost,sort_order").order("sort_order"),
    supabase.from("estimates").select("id,estimate_no,customer_id,customer_name,customer_address,project_name,site_address,status,created_at,updated_at").order("updated_at", { ascending: false }),
    supabase.from("estimate_places").select("id,estimate_id,name,sort_order").order("sort_order"),
    supabase.from("estimate_items").select("id,estimate_place_id,source_id,type,name,specification,quantity,unit,material_cost,labor_cost,sort_order,required").order("sort_order"),
    supabase.from("invoices").select("id,invoice_no,estimate_id,estimate_no,show_estimate_no,customer_id,company_name,project_name,issue_date,due_date,amount,status").order("issue_date", { ascending: false }),
    supabase.from("invoice_items").select("invoice_id,sort_order,name,quantity,unit,amount").order("sort_order"),
    supabase.from("app_settings").select("id,payment_due_days,profit_rate").eq("id", "default").maybeSingle(),
  ]);

  const companies = requireData(companiesResult.data, companiesResult.error).map((company): Company => ({
    id: company.id,
    name: company.name,
    postalCode: company.postal_code,
    address: company.address,
    phone: company.phone,
  }));
  const customers = requireData(customersResult.data, customersResult.error) as Customer[];
  const workItems = requireData(workItemsResult.data, workItemsResult.error).map((item): WorkItem => ({
    id: item.id,
    category: item.category,
    name: item.name,
    unit: item.unit,
    materialCost: Number(item.material_cost),
    laborCost: Number(item.labor_cost),
  }));
  const materialRows = requireData(materialTemplatesResult.data, materialTemplatesResult.error) as MaterialTemplateRow[];
  const placeTemplates = requireData(placeTemplatesResult.data, placeTemplatesResult.error).map((template): PlaceTemplate => ({
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
  const estimatePlaceRows = requireData(estimatePlacesResult.data, estimatePlacesResult.error) as EstimatePlaceRow[];
  const estimateItemRows = requireData(estimateItemsResult.data, estimateItemsResult.error) as EstimateItemRow[];
  const estimates = requireData(estimatesResult.data, estimatesResult.error).map((estimate): Estimate => ({
    id: estimate.id,
    estimateNo: estimate.estimate_no,
    customerId: estimate.customer_id ?? "",
    customerName: estimate.customer_name,
    customerAddress: estimate.customer_address,
    projectName: estimate.project_name,
    siteAddress: estimate.site_address,
    status: estimate.status as Estimate["status"],
    createdAt: estimate.created_at,
    updatedAt: estimate.updated_at,
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
  let invoiceItemRows = invoiceItemsResult.data as InvoiceItemRow[] | null;
  if (invoiceItemsResult.error) {
    const fallback = await supabase.from("invoice_items").select("invoice_id,sort_order,name,quantity,unit,amount").order("sort_order");
    invoiceItemRows = requireData(fallback.data, fallback.error) as InvoiceItemRow[];
  }
  invoiceItemRows ??= [];
  let settingsRow: { payment_due_days?: number; profit_rate?: number } | null = settingsResult.data;
  if (settingsResult.error) {
    const fallback = await supabase.from("app_settings").select("id,payment_due_days").eq("id", "default").maybeSingle();
    settingsRow = fallback.error ? null : fallback.data;
  }
  const settings = {
    paymentDueDays: Number(settingsRow?.payment_due_days ?? initialState.settings.paymentDueDays),
    profitRate: Number(settingsRow?.profit_rate ?? initialState.settings.profitRate),
  };
  let invoiceRows: Array<{
    id: string;
    invoice_no: string;
    estimate_id: string | null;
    estimate_no: string;
    show_estimate_no?: boolean;
    customer_id: string | null;
    company_name: string;
    project_name: string;
    issue_date: string;
    due_date: string;
    amount: number;
    status: string;
  }> | null = invoicesResult.data;
  if (invoicesResult.error) {
    const fallback = await supabase.from("invoices").select("id,invoice_no,estimate_id,estimate_no,customer_id,company_name,project_name,issue_date,due_date,amount,status").order("issue_date", { ascending: false });
    invoiceRows = requireData(fallback.data, fallback.error);
  }
  const invoices = (invoiceRows ?? []).map((invoice): Invoice => ({
    id: invoice.id,
    invoiceNo: invoice.invoice_no,
    estimateId: invoice.estimate_id ?? "",
    estimateNo: invoice.estimate_no,
    showEstimateNo: invoice.show_estimate_no ?? true,
    customerId: invoice.customer_id ?? "",
    companyName: invoice.company_name,
    projectName: invoice.project_name,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    amount: Number(invoice.amount),
    status: invoice.status as Invoice["status"],
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

  return { companies, customers, workItems, placeTemplates, estimates, invoices, settings };
}

export async function saveAppStateToSupabase(state: AppState): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  const companies = state.companies.map((company) => ({
    id: company.id,
    name: company.name,
    postal_code: company.postalCode,
    address: company.address,
    phone: company.phone,
  }));
  const workItems = state.workItems.map((item) => ({
    id: item.id,
    category: item.category,
    name: item.name,
    unit: item.unit,
    material_cost: item.materialCost,
    labor_cost: item.laborCost,
  }));
  const placeTemplates = state.placeTemplates.map((template) => ({ id: template.id, name: template.name }));
  const materialTemplates = state.placeTemplates.flatMap((template) =>
    template.materials.map((material, index) => ({
      id: material.id,
      place_template_id: template.id,
      name: material.name,
      unit: material.unit,
      quantity: material.quantity,
      material_cost: material.materialCost,
      sort_order: index,
    })),
  );
  const estimates = state.estimates.map((estimate) => ({
    id: estimate.id,
    estimate_no: estimate.estimateNo,
    customer_id: estimate.customerId || null,
    customer_name: estimate.customerName,
    customer_address: estimate.customerAddress,
    project_name: estimate.projectName,
    site_address: estimate.siteAddress,
    status: estimate.status,
    created_at: estimate.createdAt,
    updated_at: estimate.updatedAt,
  }));
  const estimatePlaces = state.estimates.flatMap((estimate) =>
    estimate.places.map((place, index) => ({
      id: place.id,
      estimate_id: estimate.id,
      name: place.name,
      sort_order: index,
    })),
  );
  const estimateItems = state.estimates.flatMap((estimate) =>
    estimate.places.flatMap((place) =>
      place.items.map((item, index) => ({
        id: item.id,
        estimate_place_id: place.id,
        source_id: item.sourceId ?? null,
        type: item.type,
        name: item.name,
        specification: item.specification,
        quantity: item.quantity,
        unit: item.unit,
        material_cost: item.materialCost,
        labor_cost: item.laborCost,
        sort_order: index,
        required: item.required ?? false,
      })),
    ),
  );
  const invoices = state.invoices.map((invoice) => ({
    id: invoice.id,
    invoice_no: invoice.invoiceNo,
    estimate_id: invoice.estimateId || null,
    estimate_no: invoice.estimateNo,
    show_estimate_no: invoice.showEstimateNo ?? true,
    customer_id: invoice.customerId || null,
    company_name: invoice.companyName,
    project_name: invoice.projectName,
    issue_date: invoice.issueDate,
    due_date: invoice.dueDate,
    amount: invoice.amount,
    status: invoice.status,
  }));
  const invoiceItems = state.invoices.flatMap((invoice) =>
    invoice.items.map((item, index) => ({
      invoice_id: invoice.id,
      sort_order: index,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      amount: item.amount,
    })),
  );

  const upsertResults = [];

  if (companies.length > 0) {
    upsertResults.push(await supabase.from("companies").upsert(companies));
  }
  if (state.customers.length > 0) {
    upsertResults.push(await supabase.from("customers").upsert(state.customers));
  }
  if (workItems.length > 0) {
    upsertResults.push(await supabase.from("work_items").upsert(workItems));
  }
  if (placeTemplates.length > 0) {
    upsertResults.push(await supabase.from("place_templates").upsert(placeTemplates));
  }
  if (materialTemplates.length > 0) {
    upsertResults.push(await supabase.from("material_templates").upsert(materialTemplates));
  }
  if (estimates.length > 0) {
    upsertResults.push(await supabase.from("estimates").upsert(estimates));
  }

  for (const { error } of upsertResults) {
    if (error) throw new Error(error.message);
  }

  if (state.estimates.length > 0) {
    const estimateIds = state.estimates.map((estimate) => estimate.id);
    const { error: deletePlacesError } = await supabase.from("estimate_places").delete().in("estimate_id", estimateIds);
    if (deletePlacesError) throw new Error(deletePlacesError.message);
  }
  if (estimatePlaces.length > 0) {
    const { error } = await supabase.from("estimate_places").insert(estimatePlaces);
    if (error) throw new Error(error.message);
  }
  if (estimateItems.length > 0) {
    const { error } = await supabase.from("estimate_items").insert(estimateItems);
    if (error) throw new Error(error.message);
  }

  if (invoices.length > 0) {
    const { error: upsertInvoicesError } = await supabase.from("invoices").upsert(invoices);
    if (upsertInvoicesError) throw new Error(upsertInvoicesError.message);

    const invoiceIds = invoices.map((invoice) => invoice.id);
    const { error: deleteItemsError } = await supabase.from("invoice_items").delete().in("invoice_id", invoiceIds);
    if (deleteItemsError) throw new Error(deleteItemsError.message);

    if (invoiceItems.length > 0) {
      const { error } = await supabase.from("invoice_items").insert(invoiceItems);
      if (error) throw new Error(error.message);
    }
  }

  const settingsResult = await supabase.from("app_settings").upsert({
    id: "default",
    payment_due_days: state.settings.paymentDueDays,
    profit_rate: state.settings.profitRate,
    updated_at: new Date().toISOString(),
  });
  if (settingsResult.error) {
    const { error } = await supabase.from("app_settings").upsert({
      id: "default",
      payment_due_days: state.settings.paymentDueDays,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }
}

export async function deleteEstimateFromSupabase(estimateId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error: updateInvoicesError } = await supabase.from("invoices").update({ estimate_id: null }).eq("estimate_id", estimateId);
  if (updateInvoicesError) throw new Error(updateInvoicesError.message);

  const { error } = await supabase.from("estimates").delete().eq("id", estimateId);
  if (error) throw new Error(error.message);
}

export async function deleteInvoiceFromSupabase(invoiceId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) throw new Error(error.message);
}

export async function deleteCompanyFromSupabase(companyId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("companies").delete().eq("id", companyId);
  if (error) throw new Error(error.message);
}

export async function deleteCustomerFromSupabase(customerId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("customers").delete().eq("id", customerId);
  if (error) throw new Error(error.message);
}

export async function deleteWorkItemFromSupabase(workItemId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("work_items").delete().eq("id", workItemId);
  if (error) throw new Error(error.message);
}

export async function deletePlaceTemplateFromSupabase(placeTemplateId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("place_templates").delete().eq("id", placeTemplateId);
  if (error) throw new Error(error.message);
}

export async function deleteMaterialTemplateFromSupabase(materialTemplateId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("material_templates").delete().eq("id", materialTemplateId);
  if (error) throw new Error(error.message);
}

export function hasRemoteSeedData(state: AppState) {
  return state.companies.length > 0
    && state.customers.length > 0
    && state.workItems.length > 0
    && state.placeTemplates.length > 0
    && state.estimates.length > 0;
}
