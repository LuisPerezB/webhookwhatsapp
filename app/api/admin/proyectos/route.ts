import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data, error } = await supabase
        .from("proyectos")
        .select(`
            id, nombre, descripcion, slogan,
            precio_desde, precio_hasta, tipo_pago,
            estado, fecha_entrega_estimada,
            amenidades, sitio_web, fotos,
            total_consultas, created_at,
            ciudad:ciudad_id(id, nombre),
            sector:sector_id(id, nombre)
        `)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ proyectos: data || [] })
}

export async function POST(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const body = await request.json()

    const { data, error } = await supabase
        .from("proyectos")
        .insert({ tenant_id: session.tenantId, ...body })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Generar link automático
    await supabase.rpc("obtener_o_crear_link", {
        p_tipo: "proyecto",
        p_tenant_id: session.tenantId,
        p_propiedad_id: null,
        p_proyecto_id: data.id
    })

    return NextResponse.json({ proyecto: data })
}