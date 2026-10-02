import { NextResponse } from "next/server";
import {
  createUser,
  deleteUserById,
  isBootstrapAdmin,
  listUsers,
  requireAdmin,
  updateUserRole,
} from "../../lib/auth-server";
import { isPostgresConfigured } from "../../lib/postgres";

export const dynamic = "force-dynamic";

function requirePostgres() {
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 500 });
  }
  return undefined;
}

export async function GET(request: Request) {
  const configError = requirePostgres();
  if (configError) return configError;

  const adminCheck = await requireAdmin(request);
  if ("error" in adminCheck) return adminCheck.error;

  const users = await listUsers();
  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      isAdmin: user.role === "admin",
      isBootstrapAdmin: isBootstrapAdmin(user.email),
      confirmedAt: user.confirmedAt,
      createdAt: user.createdAt,
      lastSignInAt: user.lastSignInAt,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const configError = requirePostgres();
  if (configError) return configError;

  const adminCheck = await requireAdmin(request);
  if ("error" in adminCheck) return adminCheck.error;

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

  try {
    const user = await createUser(normalizedEmail, password);
    return NextResponse.json(user);
  } catch (error) {
    const message = error instanceof Error && error.message.includes("duplicate")
      ? "This email is already registered."
      : error instanceof Error ? error.message : "User could not be created.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const configError = requirePostgres();
  if (configError) return configError;

  const adminCheck = await requireAdmin(request);
  if ("error" in adminCheck) return adminCheck.error;

  const { userId, isAdmin } = await request.json();
  if (typeof userId !== "string" || typeof isAdmin !== "boolean") {
    return NextResponse.json({ error: "User id and admin flag are required." }, { status: 400 });
  }

  const users = await listUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) {
    return NextResponse.json({ error: "User was not found." }, { status: 404 });
  }
  if (!isAdmin && isBootstrapAdmin(target.email)) {
    return NextResponse.json({ error: "Bootstrap administrators cannot be demoted from the app." }, { status: 400 });
  }

  const user = await updateUserRole(userId, isAdmin ? "admin" : "user");
  if (!user) {
    return NextResponse.json({ error: "User was not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    isAdmin: user.role === "admin",
  });
}

export async function DELETE(request: Request) {
  const configError = requirePostgres();
  if (configError) return configError;

  const adminCheck = await requireAdmin(request);
  if ("error" in adminCheck) return adminCheck.error;

  const { userId } = await request.json();
  if (typeof userId !== "string") {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }
  if (userId === adminCheck.user.id) {
    return NextResponse.json({ error: "You cannot delete your own user from the app." }, { status: 400 });
  }

  const users = await listUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) {
    return NextResponse.json({ error: "User was not found." }, { status: 404 });
  }
  if (isBootstrapAdmin(target.email)) {
    return NextResponse.json({ error: "Bootstrap administrators cannot be deleted from the app." }, { status: 400 });
  }

  const deleted = await deleteUserById(userId);
  if (!deleted) {
    return NextResponse.json({ error: "User was not found." }, { status: 404 });
  }

  return NextResponse.json(deleted);
}
