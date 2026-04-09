import { supabase } from "./supabase"
import { sendWhatsAppMessage } from "./whatsapp"
import { handleMessage } from "./chatbot"

export async function dispatchMessage({
    phoneNumberId,
    from,
    message,
}: any) {

    // 1. Tenant
    console.log("[Dispatcher] Iniciando con phoneNumberId:", phoneNumberId, "from:", from)

    const { data: tenant, error } = await supabase
        .from("whatsapp_numbers")
        .select("*")
        .eq("phone_number_id", phoneNumberId)
        .single()

    //console.log("[Dispatcher] Tenant:", tenant?.tenant_id ?? "NO ENCONTRADO", "Error:", tenantError?.message)

    if (!tenant) {
        console.log("NO TENANT - fallback test")
        await sendWhatsAppMessage(phoneNumberId, from, "Hola fallback")
        return
    }


    // 2. Cliente
    let { data: cliente } = await supabase
        .from("clientes")
        .select("*")
        .eq("celular", from)
        .eq("tenant_id", tenant.tenant_id)
        .single()

    if (!cliente) {
        const { data } = await supabase
            .from("clientes")
            .insert({
                celular: from,
                tenant_id: tenant.tenant_id,
                nombres_completos: "Cliente WhatsApp",
            })
            .select()
            .single()

        cliente = data
    }

    // 3. Sesión
    let { data: session } = await supabase
        .from("chat_sesiones")
        .select("*")
        .eq("cliente_id", cliente.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    // Después de obtener la sesión existente:
    const sesionExpirada = session &&
        new Date().getTime() - new Date(session.created_at).getTime() > 24 * 60 * 60 * 1000

    if (!session || sesionExpirada) {
        const { data } = await supabase
            .from("chat_sesiones")
            .insert({
                cliente_id: cliente.id,
                tenant_id: tenant.tenant_id,
                contenido: { step: "inicio" },
            })
            .select()
            .single()
        session = data
    }
    // 4. Chatbot
    const response = await handleMessage({
        tenant,
        cliente,
        session,
        message,
    })

    // 5. Responder
    if (response) {
        await sendWhatsAppMessage(phoneNumberId, from, response)
    }
}