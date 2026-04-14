import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const estado = searchParams.get("estado")
    const desde = searchParams.get("desde")
    const hasta = searchParams.get("hasta")

    let query = supabase
        .from("reservas")
        .select(`
            id, fecha, estado, created_at,
            clientes:cliente_id(nombres_completos, celular),
            propiedades:propiedad_id(nombre),
            proyectos:proyecto_id(nombre)
        `)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("fecha", { ascending: true })

    if (estado) query = query.eq("estado", estado)
    if (desde) query = query.gte("fecha", desde)
    if (hasta) query = query.lte("fecha", hasta)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ reservas: data || [] })
}

export async function PATCH(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { id, estado } = await request.json()

    if (!["pendiente", "confirmada", "cancelada"].includes(estado)) {
        return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
    }

    const { data, error } = await supabase
        .from("reservas")
        .update({ estado })
        .eq("id", id)
        .eq("tenant_id", session.tenantId)
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Si se cancela — liberar el horario
    if (estado === "cancelada" && data.horario_id) {
        await supabase
            .from("horarios_disponibles")
            .update({ disponible: true })
            .eq("id", data.horario_id)
    }

    return NextResponse.json({ reserva: data })
}