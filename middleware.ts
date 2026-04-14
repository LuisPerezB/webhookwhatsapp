import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

const PUBLIC_ROUTES = ["/auth/login", "/api/auth/login", "/api/webhook"]

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Rutas públicas — sin autenticación
    if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
        return NextResponse.next()
    }

    // Solo proteger rutas admin
    if (!pathname.startsWith("/dashboard") &&
        !pathname.startsWith("/api/admin")) {
        return NextResponse.next()
    }

    const token = request.cookies.get("inmobilia_session")?.value

    if (!token) {
        return NextResponse.redirect(new URL("/auth/login", request.url))
    }

    const session = await verifySession(token)

    if (!session) {
        const response = NextResponse.redirect(new URL("/auth/login", request.url))
        response.cookies.delete("inmobilia_session")
        return response
    }

    // Pasar datos de sesión a headers para server components
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set("x-user-id", String(session.userId))
    requestHeaders.set("x-tenant-id", String(session.tenantId))
    requestHeaders.set("x-user-rol", session.rol)
    requestHeaders.set("x-user-nombres", session.nombres)

    return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
    matcher: ["/dashboard/:path*", "/api/admin/:path*", "/auth/:path*"],
}