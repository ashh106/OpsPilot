import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE = (process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("opspilot_token")?.value;

  const targetPath = `/api/${path.join("/")}`;
  const url = new URL(req.url);
  const targetUrl = `${BACKEND_BASE}${targetPath}${url.search}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  let body: BodyInit | null = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text();
  }

  try {
    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const data = await backendRes.json().catch(() => null);

    if (data === null) {
      return new NextResponse(null, { status: backendRes.status });
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch {
    return NextResponse.json(
      { error: { code: "NETWORK_ERROR", message: "Failed to connect to backend service" } },
      { status: 502 },
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PATCH = handleProxy;
export const PUT = handleProxy;
export const DELETE = handleProxy;
