// app/(admin)/dashboard/page.tsx — versión limpia
import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import DashboardClient from "./dashboard-client"

export default async function DashboardPage() {
    const session = await getSession()
    if (!session) redirect("/auth/login")

    const { data: resumen } = await supabase
        .from("dashboard_resumen")
        .select("*")
        .eq("tenant_id", session.tenantId)
        .maybeSingle()

    const hace7 = new Date()
    hace7.setDate(hace7.getDate() - 6)
    hace7.setHours(0, 0, 0, 0)

    const { data: leadsRaw } = await supabase
        .from("cliente_tenants")
        .select("primer_contacto")
        .eq("tenant_id", session.tenantId)
        .gte("primer_contacto", hace7.toISOString())
        .is("deleted_at", null)

    const diasLabels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"]
    const leadsPorDia = Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        const key = d.toISOString().split("T")[0]
        return {
            dia: key,
            label: diasLabels[d.getDay()],
            count: leadsRaw?.filter(l => l.primer_contacto.startsWith(key)).length || 0
        }
    })

    const hoy = new Date().toISOString().split("T")[0]

    const { data: visitasHoy } = await supabase
        .from("reservas")
        .select(`
            id, fecha, estado,
            clientes:cliente_id(nombres_completos, celular),
            propiedades:propiedad_id(nombre),
            proyectos:proyecto_id(nombre)
        `)
        .eq("tenant_id", session.tenantId)
        .gte("fecha", `${hoy}T00:00:00`)
        .lte("fecha", `${hoy}T23:59:59`)
        .is("deleted_at", null)
        .order("fecha", { ascending: true })

    const { data: sesiones } = await supabase
        .from("chat_sesiones")
        .select(`id, modo, updated_at, clientes:cliente_id(nombres_completos, celular)`)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(5)

    const conversaciones = await Promise.all(
        (sesiones || []).map(async (c: any) => {
            const { data: msg } = await supabase
                .from("mensajes")
                .select("contenido, origen")
                .eq("sesion_id", c.id)
                .is("deleted_at", null)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()

            const cliente = Array.isArray(c.clientes) ? c.clientes[0] : c.clientes
            return { ...c, cliente, ultimo_mensaje: msg }
        })
    )

    const hoy2 = new Date()
    const diasSemana = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    const fechaFormato = `${diasSemana[hoy2.getDay()]} ${hoy2.getDate()} de ${meses[hoy2.getMonth()]}, ${hoy2.getFullYear()}`

    return (
        <DashboardClient
            session={session}
            resumen={resumen || {}}
            leadsPorDia={leadsPorDia}
            visitasHoy={visitasHoy || []}
            conversaciones={conversaciones}
            fechaFormato={fechaFormato}
        />
    )
}