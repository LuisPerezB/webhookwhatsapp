import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "inmobilia-secret-dev"
)

const COOKIE_NAME = "inmobilia_session"
const COOKIE_MAX_AGE = 60 * 60 * 8 // 8 horas

export interface SessionPayload {
    userId: number
    tenantId: number
    email: string
    rol: string
    nombres: string
}

export async function signSession(payload: SessionPayload): Promise<string> {
    return await new SignJWT({ ...payload })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("8h")
        .sign(JWT_SECRET)
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET)
        return payload as unknown as SessionPayload
    } catch {
        return null
    }
}

export async function getSession(): Promise<SessionPayload | null> {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return null
    return await verifySession(token)
}

export async function setSessionCookie(token: string) {
    const cookieStore = await cookies()
    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: COOKIE_MAX_AGE,
        path: "/",
    })
}

export async function clearSessionCookie() {
    const cookieStore = await cookies()
    cookieStore.delete(COOKIE_NAME)
}