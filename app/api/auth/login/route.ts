import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { signSession, setSessionCookie } from "@/lib/auth"
import bcrypt from "bcryptjs"

export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json()

        if (!email || !password) {
            return NextResponse.json(
                { error: "Email y contraseña requeridos" },
                { status: 400 }
            )
        }

        // Buscar usuario activo
        const { data: user, error } = await supabase
            .from("users")
            .select("id, tenant_id, email, password_hash, rol, nombres_completos, active, suscription_status, paid_until")
            .eq("email", email.toLowerCase().trim())
            .eq("active", true)
            .is("deleted_at", null)
            .single()

        if (error || !user) {
            return NextResponse.json(
                { error: "Credenciales inválidas" },
                { status: 401 }
            )
        }

        // Verificar contraseña
        const valid = await bcrypt.compare(password, user.password_hash)
        if (!valid) {
            return NextResponse.json(
                { error: "Credenciales inválidas" },
                { status: 401 }
            )
        }

        // Verificar suscripción
        if (user.suscription_status !== "active" ||
            new Date(user.paid_until) < new Date()) {
            return NextResponse.json(
                { error: "Suscripción vencida. Contacta a soporte." },
                { status: 403 }
            )
        }

        // Crear token
        const token = await signSession({
            userId: user.id,
            tenantId: user.tenant_id,
            email: user.email,
            rol: user.rol,
            nombres: user.nombres_completos,
        })

        await setSessionCookie(token)

        return NextResponse.json({
            ok: true,
            user: {
                id: user.id,
                email: user.email,
                rol: user.rol,
                nombres: user.nombres_completos,
            }
        })

    } catch (error: any) {
        console.error("[Login] Error:", error.message)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

export async function DELETE() {
    const { clearSessionCookie } = await import("@/lib/auth")
    await clearSessionCookie()
    return NextResponse.json({ ok: true })
}