import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  const env = readFileSync(path, "utf8");
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

loadEnvFile(resolve(".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, supabasePublishableKey);

if (process.env.SUPABASE_TEST_EMAIL && process.env.SUPABASE_TEST_PASSWORD) {
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.SUPABASE_TEST_EMAIL,
    password: process.env.SUPABASE_TEST_PASSWORD,
  });

  if (error) throw new Error(`Failed to sign in test user: ${error.message}`);
} else {
  console.warn("SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are not set. Authenticated RLS checks may fail.");
}

const expectedCounts = {
  companies: 1,
  customers: 3,
  work_items: 5,
  place_templates: 3,
  material_templates: 7,
  estimates: 2,
  estimate_places: 2,
  estimate_items: 4,
  invoices: 0,
  invoice_items: 0,
};

let hasFailure = false;

for (const [table, expected] of Object.entries(expectedCounts)) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact" }).limit(0);
  if (error) {
    hasFailure = true;
    console.error(`${table}: ${error.code} ${error.message}`);
    continue;
  }

  const status = count === expected ? "ok" : "mismatch";
  if (status === "mismatch") hasFailure = true;
  console.log(`${table}: ${status} count=${count} expected=${expected}`);
}

if (hasFailure) process.exit(1);
