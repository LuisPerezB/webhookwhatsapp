// app/api/admin/whatsapp/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { id } = await params
    const { access_token } = await request.json()

    await supabase
        .from("whatsapp_numbers")
        .update({ access_token })
        .eq("id", parseInt(id))
        .eq("tenant_id", session.tenantId)

    return NextResponse.json({ ok: true })
}