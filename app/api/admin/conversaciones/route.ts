import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const modo = searchParams.get("modo") // auto | manual | pausado | null (todos)
    const busqueda = searchParams.get("busqueda") || ""
    const pagina = parseInt(searchParams.get("pagina") || "0")
    const limite = 20

    let query = supabase
        .from("chat_sesiones")
        .select(`
            id, modo, updated_at, contenido, agente_id,
            clientes:cliente_id(id, nombres_completos, celular, verificado)
        `)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(pagina * limite, (pagina + 1) * limite - 1)

    if (modo) query = query.eq("modo", modo)

    const { data: sesiones, error } = await query

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Para cada sesión — último mensaje y notificaciones no leídas
    const resultado = await Promise.all((sesiones || []).map(async (s: any) => {
        const cliente = Array.isArray(s.clientes) ? s.clientes[0] : s.clientes

        // Filtro por búsqueda
        if (busqueda && !cliente?.nombres_completos?.toLowerCase().includes(busqueda.toLowerCase()) &&
            !cliente?.celular?.includes(busqueda)) {
            return null
        }

        const [{ data: ultimoMensaje }, { count: notifCount }] = await Promise.all([
            supabase
                .from("mensajes")
                .select("contenido, origen, created_at")
                .eq("sesion_id", s.id)
                .is("deleted_at", null)
                .order("created_at", { ascending: false })
                .limit(1)
                .single(),
            supabase
                .from("notificaciones")
                .select("*", { count: "exact", head: true })
                .eq("sesion_id", s.id)
                .eq("leida", false)
                .is("deleted_at", null)
        ])

        return {
            id: s.id,
            modo: s.modo,
            updated_at: s.updated_at,
            step: s.contenido?.step,
            cliente: {
                id: cliente?.id,
                nombre: cliente?.nombres_completos || "Cliente",
                celular: cliente?.celular,
                verificado: cliente?.verificado || false,
            },
            ultimo_mensaje: ultimoMensaje ? {
                contenido: ultimoMensaje.contenido,
                origen: ultimoMensaje.origen,
                created_at: ultimoMensaje.created_at,
            } : null,
            notificaciones_no_leidas: notifCount || 0,
        }
    }))

    return NextResponse.json({
        conversaciones: resultado.filter(Boolean),
        pagina,
        tiene_mas: (sesiones?.length || 0) === limite
    })
}