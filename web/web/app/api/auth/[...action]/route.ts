import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE = (process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string[] }> },
) {
  const { action } = await params;
  const subAction = action[0];
  const cookieStore = await cookies();

  if (subAction === "logout") {
    cookieStore.delete("opspilot_token");
    return NextResponse.json({ success: true });
  }

  if (subAction !== "login" && subAction !== "register") {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown auth endpoint" } }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const backendUrl = `${BACKEND_BASE}/api/auth/${subAction}`;

  try {
    const backendRes = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(data, { status: backendRes.status });
    }

    // Set secure HttpOnly cookie with the JWT token
    if (data.token) {
      cookieStore.set("opspilot_token", data.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 7 * 24 * 60 * 60, // 7 days matching JWT_EXPIRES_IN
      });
    }

    return NextResponse.json({ user: data.user });
  } catch {
    return NextResponse.json(
      { error: { code: "NETWORK_ERROR", message: "Could not connect to backend server" } },
      { status: 502 },
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ action: string[] }> },
) {
  const { action } = await params;
  const subAction = action[0];
  const cookieStore = await cookies();

  if (subAction !== "me") {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown auth endpoint" } }, { status: 404 });
  }

  const token = cookieStore.get("opspilot_token")?.value;
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "No active session" } }, { status: 401 });
  }

  try {
    const backendRes = await fetch(`${BACKEND_BASE}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch {
    return NextResponse.json(
      { error: { code: "NETWORK_ERROR", message: "Could not connect to backend server" } },
      { status: 502 },
    );
  }
}
