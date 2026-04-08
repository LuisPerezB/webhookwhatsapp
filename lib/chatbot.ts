import { supabase } from "./supabase"

export async function handleMessage({ tenant, cliente, session, message }: any) {
  const text = message.text?.body?.toLowerCase().trim() || ""
  let state = session.contenido || {}

  if (!state.step || state.step === "inicio") {
    state = { step: "tipo" }
    await updateSession(session.id, state)

    return "Hola 👋 ¿Qué tipo de propiedad buscas?\n1. Casa\n2. Departamento\n3. Terreno\n4. Local"
  }

  if (state.step === "tipo") {
    let tipo = null

    if (text.includes("casa") || text === "1") tipo = "casa"
    if (text.includes("departamento") || text === "2") tipo = "departamento"

    if (!tipo) return "Selecciona una opción válida"

    state.tipo = tipo
    state.step = "ciudad"

    await updateSession(session.id, state)

    return "¿En qué ciudad?"
  }

  if (state.step === "ciudad") {
    state.ciudad = text
    state.step = "sector"

    await updateSession(session.id, state)

    return "¿Sector?"
  }

  if (state.step === "sector") {
    state.sector = text

    const { data } = await supabase
      .from("propiedades")
      .select("*")
      .ilike("ciudad", `%${state.ciudad}%`)
      .ilike("sector", `%${state.sector}%`)
      .eq("tipo_propiedad", state.tipo)
      .limit(5)

    if (!data?.length) return "No encontré propiedades"

    let res = "Opciones:\n\n"
    data.forEach((p, i) => {
      res += `${i + 1}. ${p.nombre} - $${p.precio}\n`
    })

    return res
  }

  return "No entendí"
}

async function updateSession(id: number, contenido: any) {
  await supabase.from("chat_sesiones").update({ contenido }).eq("id", id)
}