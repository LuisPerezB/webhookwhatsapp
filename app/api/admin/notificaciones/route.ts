import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data } = await supabase
        .from("notificaciones")
        .select(`
            id, tipo, mensaje, leida, created_at,
            clientes:cliente_id(nombres_completos, celular)
        `)
        .eq("tenant_id", session.tenantId)
        .eq("leida", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20)

    const { count } = await supabase
        .from("notificaciones")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", session.tenantId)
        .eq("leida", false)
        .is("deleted_at", null)

    return NextResponse.json({
        notificaciones: data || [],
        total_no_leidas: count || 0
    })
}

export async function PATCH(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { ids, todas } = await request.json()

    let query = supabase
        .from("notificaciones")
        .update({ leida: true })
        .eq("tenant_id", session.tenantId)

    if (!todas && ids?.length) {
        query = query.in("id", ids)
    }

    await query
    return NextResponse.json({ ok: true })
}