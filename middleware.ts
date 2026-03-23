import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isProtectedPath(pathname: string): boolean {
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/payroll") ||
    pathname.startsWith("/employees") ||
    pathname.startsWith("/workdays") ||
    pathname.startsWith("/insurance-request") ||
    pathname.startsWith("/store-staff") ||
    pathname.startsWith("/me") ||
    pathname.startsWith("/payroll-verify")
  ) {
    return true;
  }
  if (pathname === "/insurance" || pathname.startsWith("/insurance/")) {
    return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/payroll/:path*",
    "/employees/:path*",
    "/workdays/:path*",
    "/insurance-request/:path*",
    "/store-staff/:path*",
    "/me/:path*",
    "/payroll-verify/:path*",
    "/insurance/:path*",
  ],
};
