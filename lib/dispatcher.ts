import { supabase } from "./supabase"
import { sendWhatsAppMessage } from "./whatsapp"
import { handleMessage } from "./chatbot"

export async function dispatchMessage({
  phoneNumberId,
  from,
  message,
}: any) {

  // 1. Tenant
  const { data: tenant } = await supabase
    .from("whatsapp_numbers")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .single()

  if (!tenant) return

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

  if (!session) {
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