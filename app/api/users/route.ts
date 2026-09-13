import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

function isConfigured() {
  if (!supabaseUrl || !supabasePublishableKey || !supabaseServiceRoleKey) {
    return false;
  }
  return true;
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: NextResponse.json({ error: "Login is required." }, { status: 401 }) };
  }

  const supabase = createClient(supabaseUrl!, supabasePublishableKey!);
  const { data: sessionUser, error: sessionError } = await supabase.auth.getUser(token);
  const requesterEmail = sessionUser.user?.email?.toLowerCase();
  const requesterRole = sessionUser.user?.app_metadata?.role;
  if (sessionError || !requesterEmail) {
    return { error: NextResponse.json({ error: sessionError?.message ?? "Invalid login session." }, { status: 401 }) };
  }
  if (!adminEmails.includes(requesterEmail) && requesterRole !== "admin") {
    return { error: NextResponse.json({ error: "Only administrators can manage users." }, { status: 403 }) };
  }

  return { requesterEmail, requesterId: sessionUser.user.id };
}

function getAdminClient() {
  return createClient(supabaseUrl!, supabaseServiceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Supabase server environment variables are not configured." },
      { status: 500 },
    );
  }

  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;

  const { data, error } = await getAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    users: data.users.map((user) => ({
      id: user.id,
      email: user.email,
      isAdmin: adminEmails.includes(user.email?.toLowerCase() ?? "") || user.app_metadata?.role === "admin",
      isBootstrapAdmin: adminEmails.includes(user.email?.toLowerCase() ?? ""),
      confirmedAt: user.email_confirmed_at,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Supabase server environment variables are not configured." },
      { status: 500 },
    );
  }

  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;

  const { email, password } = await request.json();
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || password.length < 8) {
    return NextResponse.json(
      { error: "Email is required and password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const { data, error } = await getAdminClient().auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    app_metadata: { role: "user" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    id: data.user.id,
    email: data.user.email,
  });
}

export async function PATCH(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Supabase server environment variables are not configured." },
      { status: 500 },
    );
  }

  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;

  const { userId, isAdmin } = await request.json();
  if (typeof userId !== "string" || typeof isAdmin !== "boolean") {
    return NextResponse.json({ error: "User id and admin flag are required." }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: target, error: getError } = await admin.auth.admin.getUserById(userId);
  if (getError || !target.user) {
    return NextResponse.json({ error: getError?.message ?? "User was not found." }, { status: 404 });
  }

  const targetEmail = target.user.email?.toLowerCase() ?? "";
  if (!isAdmin && adminEmails.includes(targetEmail)) {
    return NextResponse.json({ error: "Bootstrap administrators cannot be demoted from the app." }, { status: 400 });
  }

  const nextMetadata = {
    ...target.user.app_metadata,
    role: isAdmin ? "admin" : "user",
  };
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: nextMetadata,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    id: data.user.id,
    email: data.user.email,
    isAdmin: adminEmails.includes(data.user.email?.toLowerCase() ?? "") || data.user.app_metadata?.role === "admin",
  });
}

export async function DELETE(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Supabase server environment variables are not configured." },
      { status: 500 },
    );
  }

  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;

  const { userId } = await request.json();
  if (typeof userId !== "string") {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }
  if (userId === adminCheck.requesterId) {
    return NextResponse.json({ error: "You cannot delete your own user from the app." }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: target, error: getError } = await admin.auth.admin.getUserById(userId);
  if (getError || !target.user) {
    return NextResponse.json({ error: getError?.message ?? "User was not found." }, { status: 404 });
  }

  const targetEmail = target.user.email?.toLowerCase() ?? "";
  if (adminEmails.includes(targetEmail)) {
    return NextResponse.json({ error: "Bootstrap administrators cannot be deleted from the app." }, { status: 400 });
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    id: target.user.id,
    email: target.user.email,
  });
}
