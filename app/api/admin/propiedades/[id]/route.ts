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
        .from("propiedades")
        .select(`*, ciudad:ciudad_id(id, nombre), sector:sector_id(id, nombre)`)
        .eq("id", parseInt(params.id))
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .single()

    if (error || !data) return NextResponse.json({ error: "No encontrada" }, { status: 404 })

    const { data: link } = await supabase
        .from("links")
        .select("slug")
        .eq("tenant_id", session.tenantId)
        .eq("propiedad_id", data.id)
        .single()

    return NextResponse.json({ propiedad: { ...data, slug: link?.slug } })
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const body = await request.json()
    delete body.tenant_id // No permitir cambiar tenant

    const { data, error } = await supabase
        .from("propiedades")
        .update(body)
        .eq("id", parseInt(params.id))
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ propiedad: data })
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    await supabase
        .from("propiedades")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", parseInt(params.id))
        .eq("tenant_id", session.tenantId)

    return NextResponse.json({ ok: true })
}