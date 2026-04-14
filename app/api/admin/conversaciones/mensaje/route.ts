import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { sendWhatsAppMessage } from "@/lib/whatsapp"

export async function POST(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { sesion_id, mensaje, celular_cliente } = await request.json()

    if (!mensaje?.trim()) {
        return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 })
    }

    // Verificar sesión
    const { data: sesion } = await supabase
        .from("chat_sesiones")
        .select("id, tenant_id, cliente_id, modo")
        .eq("id", sesion_id)
        .eq("tenant_id", session.tenantId)
        .single()

    if (!sesion) {
        return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })
    }

    if (sesion.modo !== "manual") {
        return NextResponse.json(
            { error: "La sesión no está en modo manual" },
            { status: 400 }
        )
    }

    // Obtener phone_number_id del tenant
    const { data: wn } = await supabase
        .from("whatsapp_numbers")
        .select("phone_number_id")
        .eq("tenant_id", session.tenantId)
        .eq("activo", true)
        .is("deleted_at", null)
        .single()

    if (!wn) {
        return NextResponse.json(
            { error: "Número WhatsApp no configurado" },
            { status: 400 }
        )
    }

    // Enviar por WhatsApp
    const messageId = await sendWhatsAppMessage(
        wn.phone_number_id,
        celular_cliente,
        mensaje
    )

    // Guardar en mensajes
    const { data: msg } = await supabase
        .from("mensajes")
        .insert({
            sesion_id,
            tenant_id: session.tenantId,
            cliente_id: sesion.cliente_id,
            origen: "agente",
            contenido: mensaje,
            whatsapp_message_id: messageId,
        })
        .select()
        .single()

    // Actualizar sesión
    await supabase
        .from("chat_sesiones")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", sesion_id)

    return NextResponse.json({ ok: true, mensaje: msg })
}