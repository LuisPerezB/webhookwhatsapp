import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const verificado = searchParams.get("verificado")
    const busqueda = searchParams.get("busqueda") || ""
    const pagina = parseInt(searchParams.get("pagina") || "0")
    const limite = 30

    const { data: relaciones } = await supabase
        .from("cliente_tenants")
        .select(`
            primer_contacto, ultimo_contacto,
            clientes:cliente_id(
                id, nombres_completos, celular, ruc_ci,
                verificado, bloqueado, created_at
            )
        `)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("ultimo_contacto", { ascending: false })
        .range(pagina * limite, (pagina + 1) * limite - 1)

    const clientes = (relaciones || [])
        .map((r: any) => {
            const c = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
            return {
                ...c,
                primer_contacto: r.primer_contacto,
                ultimo_contacto: r.ultimo_contacto,
            }
        })
        .filter((c: any) => {
            if (verificado === "true" && !c.verificado) return false
            if (verificado === "false" && c.verificado) return false
            if (busqueda && !c.nombres_completos?.toLowerCase().includes(busqueda.toLowerCase()) &&
                !c.celular?.includes(busqueda) && !c.ruc_ci?.includes(busqueda)) return false
            return true
        })

    return NextResponse.json({
        clientes,
        total: clientes.length,
        pagina,
        tiene_mas: (relaciones?.length || 0) === limite
    })
}

// En app/api/admin/clientes/route.ts — actualiza el PATCH existente
export async function PATCH(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { cliente_id, bloqueado, nombres_completos } = await request.json()

    const updateData: any = {}
    if (bloqueado !== undefined) updateData.bloqueado = bloqueado
    if (nombres_completos !== undefined) updateData.nombres_completos = nombres_completos

    await supabase
        .from("clientes")
        .update(updateData)
        .eq("id", cliente_id)

    return NextResponse.json({ ok: true })
}