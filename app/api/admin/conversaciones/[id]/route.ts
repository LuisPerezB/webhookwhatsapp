import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const sesionId = parseInt(params.id)

    // Verificar que pertenece al tenant
    const { data: sesion } = await supabase
        .from("chat_sesiones")
        .select(`
            id, modo, updated_at, contenido, agente_id,
            clientes:cliente_id(id, nombres_completos, celular, ruc_ci, verificado)
        `)
        .eq("id", sesionId)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .single()

    if (!sesion) {
        return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })
    }

    // Mensajes
    const { data: mensajes } = await supabase
        .from("mensajes")
        .select("id, origen, contenido, created_at, whatsapp_message_id")
        .eq("sesion_id", sesionId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(100)

    // Marcar notificaciones como leídas
    await supabase
        .from("notificaciones")
        .update({ leida: true })
        .eq("sesion_id", sesionId)
        .eq("tenant_id", session.tenantId)

    const cliente = Array.isArray(sesion.clientes) ? sesion.clientes[0] : sesion.clientes

    return NextResponse.json({
        sesion: {
            id: sesion.id,
            modo: sesion.modo,
            step: sesion.contenido?.step,
            updated_at: sesion.updated_at,
        },
        cliente,
        mensajes: mensajes || []
    })
}