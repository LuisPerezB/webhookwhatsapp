import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "inmobilia_secret_key_change_in_prod"
)

const COOKIE_NAME = "inmobilia_session"
const EXPIRES_IN = "8h"

export interface SessionPayload {
    userId: number
    tenantId: number
    rol: "admin" | "agente"
    username: string
    nombres_completos: string
}

// Crear token JWT
export async function createToken(payload: SessionPayload): Promise<string> {
    return await new SignJWT({ ...payload })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(EXPIRES_IN)
        .sign(SECRET)
}

// Verificar token JWT
export async function verifyToken(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, SECRET)
        return payload as unknown as SessionPayload
    } catch {
        return null
    }
}

// Obtener sesión desde cookies
export async function getSession(): Promise<SessionPayload | null> {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return null
    return await verifyToken(token)
}

// Setear cookie de sesión
export async function setSessionCookie(token: string) {
    const cookieStore = await cookies()
    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 8, // 8 horas
        path: "/",
    })
}

// Eliminar cookie de sesión
export async function clearSessionCookie() {
    const cookieStore = await cookies()
    cookieStore.delete(COOKIE_NAME)
}