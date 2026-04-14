import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const desde = searchParams.get("desde")
    const hasta = searchParams.get("hasta")

    let query = supabase
        .from("horarios_disponibles")
        .select(`
            id, fecha, hora_inicio, hora_fin, disponible,
            propiedad:propiedad_id(id, nombre),
            proyecto:proyecto_id(id, nombre)
        `)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("fecha", { ascending: true })
        .order("hora_inicio", { ascending: true })

    if (desde) query = query.gte("fecha", desde)
    if (hasta) query = query.lte("fecha", hasta)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ horarios: data || [] })
}

export async function POST(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const body = await request.json()
    // body: { fecha, hora_inicio, hora_fin, propiedad_id?, proyecto_id? }

    if (!body.fecha || !body.hora_inicio || !body.hora_fin) {
        return NextResponse.json(
            { error: "Fecha y horas son requeridas" },
            { status: 400 }
        )
    }

    if (!body.propiedad_id && !body.proyecto_id) {
        return NextResponse.json(
            { error: "Debe indicar propiedad o proyecto" },
            { status: 400 }
        )
    }

    const { data, error } = await supabase
        .from("horarios_disponibles")
        .insert({
            tenant_id: session.tenantId,
            fecha: body.fecha,
            hora_inicio: body.hora_inicio,
            hora_fin: body.hora_fin,
            disponible: true,
            propiedad_id: body.propiedad_id || null,
            proyecto_id: body.proyecto_id || null,
        })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ horario: data })
}

export async function DELETE(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { id } = await request.json()

    await supabase
        .from("horarios_disponibles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", session.tenantId)

    return NextResponse.json({ ok: true })
}