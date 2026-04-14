import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data: resumen } = await supabase
        .from("dashboard_resumen")
        .select("*")
        .eq("tenant_id", session.tenantId)
        .single()

    // Leads por día — últimos 7 días
    const hace7 = new Date()
    hace7.setDate(hace7.getDate() - 7)

    const { data: leadsRaw } = await supabase
        .from("cliente_tenants")
        .select("primer_contacto")
        .eq("tenant_id", session.tenantId)
        .gte("primer_contacto", hace7.toISOString())
        .is("deleted_at", null)

    // Agrupar por día
    const leadsPorDia: Record<string, number> = {}
    const dias = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"]
    for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = d.toISOString().split("T")[0]
        leadsPorDia[key] = 0
    }

    leadsRaw?.forEach((l: any) => {
        const key = l.primer_contacto.split("T")[0]
        if (key in leadsPorDia) leadsPorDia[key]++
    })

    // Próximas visitas hoy
    const hoy = new Date().toISOString().split("T")[0]
    const { data: visitasHoy } = await supabase
        .from("reservas")
        .select(`
            fecha, estado,
            clientes:cliente_id(nombres_completos, celular),
            propiedades:propiedad_id(nombre),
            proyectos:proyecto_id(nombre)
        `)
        .eq("tenant_id", session.tenantId)
        .gte("fecha", `${hoy}T00:00:00`)
        .lte("fecha", `${hoy}T23:59:59`)
        .is("deleted_at", null)
        .order("fecha", { ascending: true })
        .limit(5)

    return NextResponse.json({
        resumen: resumen || {
            total_propiedades: 0,
            total_proyectos: 0,
            total_clientes: 0,
            reservas_pendientes: 0,
            leads_hoy: 0,
            conversaciones_activas: 0
        },
        leadsPorDia,
        visitasHoy: visitasHoy || []
    })
}