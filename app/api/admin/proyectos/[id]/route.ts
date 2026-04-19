import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data, error } = await supabase
        .from("proyectos")
        .select(`*, ciudad:ciudad_id(id, nombre), sector:sector_id(id, nombre)`)
        .eq("id", parseInt(params.id))
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .single()

    if (error || !data) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

    const { data: link } = await supabase
        .from("links")
        .select("slug")
        .eq("tenant_id", session.tenantId)
        .eq("proyecto_id", data.id)
        .single()

    // Propiedades del proyecto
    const { data: unidades } = await supabase
        .from("propiedades")
        .select("id, nombre, precio, estado, ambientes, dimensiones")
        .eq("proyecto_id", data.id)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })

    return NextResponse.json({
        proyecto: { ...data, slug: link?.slug },
        unidades: unidades || []
    })
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    delete body.tenant_id

    const extraerId = (v: any): number | null => {
        if (!v && v !== 0) return null
        if (typeof v === "object" && v?.id) return parseInt(v.id)
        const n = parseInt(v)
        return isNaN(n) ? null : n
    }

    const datosLimpios = {
        ...body,
        ciudad_id: extraerId(body.ciudad_id),
        sector_id: extraerId(body.sector_id),
        // Quitar objetos join que Supabase rechaza
        ciudad: undefined,
        sector: undefined,
    }

    const { data, error } = await supabase
        .from("proyectos")
        .update(datosLimpios)
        .eq("id", parseInt(id))
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ proyecto: data })
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    await supabase
        .from("proyectos")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", parseInt(params.id))
        .eq("tenant_id", session.tenantId)

    return NextResponse.json({ ok: true })
}