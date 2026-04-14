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
    { params }: { params: { id: string } }
) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const body = await request.json()
    delete body.tenant_id

    const { data, error } = await supabase
        .from("proyectos")
        .update(body)
        .eq("id", parseInt(params.id))
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