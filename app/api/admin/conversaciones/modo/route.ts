import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function PATCH(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { sesion_id, modo } = await request.json()

    if (!["automatico", "manual", "pausado"].includes(modo)) {
        return NextResponse.json({ error: "Modo inválido" }, { status: 400 })
    }

    // Verificar que pertenece al tenant
    const { data: sesion } = await supabase
        .from("chat_sesiones")
        .select("id, cliente_id, tenant_id")
        .eq("id", sesion_id)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .single()

    if (!sesion) {
        return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })
    }

    const updateData: any = { modo }

    if (modo === "manual") {
        updateData.agente_id = session.userId
    } else if (modo === "automatico") {
        updateData.agente_id = null
        updateData.contenido = { step: "inicio" }
    }

    await supabase
        .from("chat_sesiones")
        .update(updateData)
        .eq("id", sesion_id)

    // Notificación
    if (modo === "manual") {
        await supabase.from("notificaciones").insert({
            tenant_id: session.tenantId,
            cliente_id: sesion.cliente_id,
            sesion_id,
            tipo: "modo_manual",
            mensaje: `Asesor ${session.nombres} tomó control de la conversación`,
        })
    }

    return NextResponse.json({ ok: true, modo })
}