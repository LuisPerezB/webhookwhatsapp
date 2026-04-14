import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data } = await supabase
        .from("tenant_config")
        .select("config")
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .single()

    // Tenant info
    const { data: tenant } = await supabase
        .from("tenants")
        .select("nombre, activo")
        .eq("id", session.tenantId)
        .single()

    // WhatsApp numbers
    const { data: numbers } = await supabase
        .from("whatsapp_numbers")
        .select("id, phone_number_id, numero, activo")
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)

    return NextResponse.json({
        config: data?.config || {},
        tenant,
        numbers: numbers || []
    })
}

export async function PATCH(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { config } = await request.json()

    const { data: existing } = await supabase
        .from("tenant_config")
        .select("id")
        .eq("tenant_id", session.tenantId)
        .single()

    if (existing) {
        await supabase
            .from("tenant_config")
            .update({ config })
            .eq("tenant_id", session.tenantId)
    } else {
        await supabase
            .from("tenant_config")
            .insert({ tenant_id: session.tenantId, config })
    }

    return NextResponse.json({ ok: true })
}