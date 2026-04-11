import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { supabase } from "@/lib/supabase"
import { createToken, setSessionCookie } from "@/lib/auth"

export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json()

        if (!email || !password) {
            return NextResponse.json(
                { error: "Email y contraseña son requeridos" },
                { status: 400 }
            )
        }

        // Buscar usuario activo
        const { data: user, error } = await supabase
            .from("users")
            .select("*")
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

        // Verificar suscripción vigente
        const hoy = new Date()
        const suscripcionActiva =
            user.suscription_status === "active" &&
            user.paid_until &&
            new Date(user.paid_until) > hoy

        if (!suscripcionActiva) {
            return NextResponse.json(
                {
                    error: "Tu suscripción ha vencido. Contacta al administrador.",
                    code: "SUBSCRIPTION_EXPIRED"
                },
                { status: 403 }
            )
        }

        // Verificar contraseña
        const passwordValida = await bcrypt.compare(password, user.password_hash)

        if (!passwordValida) {
            return NextResponse.json(
                { error: "Credenciales inválidas" },
                { status: 401 }
            )
        }

        // Crear token JWT
        const token = await createToken({
            userId: user.id,
            tenantId: user.tenant_id,
            rol: user.rol,
            username: user.username,
            nombres_completos: user.nombres_completos,
        })

        // Setear cookie
        await setSessionCookie(token)

        return NextResponse.json({
            ok: true,
            user: {
                id: user.id,
                nombres_completos: user.nombres_completos,
                email: user.email,
                rol: user.rol,
                suscription_plan: user.suscription_plan,
                paid_until: user.paid_until,
            }
        })

    } catch (error) {
        console.error("[Auth] Error login:", error)
        return NextResponse.json(
            { error: "Error interno del servidor" },
            { status: 500 }
        )
    }
}