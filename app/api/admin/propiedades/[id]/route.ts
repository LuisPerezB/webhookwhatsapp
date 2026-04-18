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
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    delete body.tenant_id

    // Extraer id si viene como objeto {id, nombre}
    const extraerId = (v: any): number | null => {
        if (!v && v !== 0) return null
        if (typeof v === "object" && v?.id) return parseInt(v.id)
        const n = parseInt(v)
        return isNaN(n) ? null : n
    }

    const extraerFloat = (v: any): number | null => {
        if (!v && v !== 0) return null
        const n = parseFloat(v)
        return isNaN(n) ? null : n
    }

    const ciudad_id = extraerId(body.ciudad_id)
    const precio = extraerFloat(body.precio)

    if (!ciudad_id) {
        return NextResponse.json({ error: "La ciudad es requerida" }, { status: 400 })
    }

    if (!precio) {
        return NextResponse.json({ error: "El precio es requerido" }, { status: 400 })
    }

    // Limpiar todos los campos antes de enviar a Supabase
    const datosLimpios: any = {
        ...body,
        ciudad_id,
        precio,
        sector_id: extraerId(body.sector_id),
        proyecto_id: extraerId(body.proyecto_id),
    }

    // Quitar campos que son objetos join — Supabase no los acepta
    delete datosLimpios.ciudad
    delete datosLimpios.sector
    delete datosLimpios.proyecto

    console.log("[PATCH] datosLimpios:", JSON.stringify({
        ciudad_id: datosLimpios.ciudad_id,
        sector_id: datosLimpios.sector_id,
        proyecto_id: datosLimpios.proyecto_id,
        precio: datosLimpios.precio,
    }))

    const { data, error } = await supabase
        .from("propiedades")
        .update(datosLimpios)
        .eq("id", parseInt(id))
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .select()
        .single()

    if (error) {
        console.error("[PATCH] Supabase error:", error.message)
        return NextResponse.json({ error: error.message }, { status: 400 })
    }

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