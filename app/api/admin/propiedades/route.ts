import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get("tipo")
    const operacion = searchParams.get("operacion")
    const estado = searchParams.get("estado")
    const busqueda = searchParams.get("busqueda") || ""
    const proyecto_id = searchParams.get("proyecto_id")

    let query = supabase
        .from("propiedades")
        .select(`
            id, nombre, precio, precio_negociable,
            tipo_propiedad, tipo_operacion, tipo_pago,
            estado, fotos, descripcion,
            dimensiones, ambientes, exteriores, estacionamiento, extras,
            total_consultas, created_at,
            ciudad:ciudad_id(nombre),
            sector:sector_id(nombre),
            proyecto:proyecto_id(nombre)
        `)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })

    if (tipo) query = query.eq("tipo_propiedad", tipo)
    if (operacion) query = query.eq("tipo_operacion", operacion)
    if (estado) query = query.eq("estado", estado)
    if (proyecto_id) query = query.eq("proyecto_id", parseInt(proyecto_id))
    else if (searchParams.get("independientes") === "true") {
        query = query.is("proyecto_id", null)
    }

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Filtro de búsqueda en memoria
    const filtrado = busqueda
        ? data?.filter((p: any) =>
            p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
            p.ciudad?.nombre?.toLowerCase().includes(busqueda.toLowerCase())
        )
        : data

    return NextResponse.json({ propiedades: filtrado || [] })
}

export async function POST(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const body = await request.json()

    const { data, error } = await supabase
        .from("propiedades")
        .insert({
            tenant_id: session.tenantId,
            ...body,
        })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Generar link automático
    await supabase.rpc("obtener_o_crear_link", {
        p_tipo: "propiedad",
        p_tenant_id: session.tenantId,
        p_propiedad_id: data.id
    })

    return NextResponse.json({ propiedad: data })
}