import { NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"

const PUBLIC_ROUTES = ["/auth/login", "/api/webhook", "/api/auth/login"]

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Permitir rutas públicas
    const isPublic = PUBLIC_ROUTES.some(route => pathname.startsWith(route))
    if (isPublic) return NextResponse.next()

    // Permitir assets y archivos estáticos
    if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
        return NextResponse.next()
    }

    // Verificar sesión para rutas admin
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/api/admin")) {
        const token = request.cookies.get("inmobilia_session")?.value

        if (!token) {
            return NextResponse.redirect(new URL("/auth/login", request.url))
        }

        const session = await verifyToken(token)

        if (!session) {
            return NextResponse.redirect(new URL("/auth/login", request.url))
        }

        // Pasar datos de sesión al header para las API routes
        const headers = new Headers(request.headers)
        headers.set("x-user-id", String(session.userId))
        headers.set("x-tenant-id", String(session.tenantId))
        headers.set("x-user-rol", session.rol)

        return NextResponse.next({ request: { headers } })
    }

    return NextResponse.next()
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}