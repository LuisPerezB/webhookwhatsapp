import { supabase } from "./supabase"
import { validarCedulaAPI } from "./cedula"

export async function handleMessage({
  tenant,
  cliente,
  session,
  message,
  config,
}: any) {
  const text = message.text?.body?.toLowerCase().trim() || ""
  let state = session.contenido || {}

  // =========================
  // COMANDO GLOBAL: agente
  // En cualquier punto del flujo el cliente puede pedir agente
  // =========================
  if (text === "agente" || text === "hablar con agente" || text === "humano") {
    await supabase
      .from("chat_sesiones")
      .update({ modo: "manual" })
      .eq("id", session.id)

    await supabase.from("notificaciones").insert({
      tenant_id: tenant.id,
      cliente_id: cliente.id,
      sesion_id: session.id,
      tipo: "modo_manual",
      mensaje: `${cliente.celular} solicitó hablar con un agente`,
    })

    return "Un agente te atenderá en breve. ⏳\nEscribe *bot* para volver al asistente automático."
  }

  // COMANDO GLOBAL: volver al bot
  if (text === "bot" || text === "volver") {
    await supabase
      .from("chat_sesiones")
      .update({ modo: "automatico", contenido: { step: "inicio" } })
      .eq("id", session.id)

    return "De vuelta con el asistente 🤖\n¿En qué puedo ayudarte?"
  }

  // =========================
  // PASO: INICIO
  // Pregunta si busca propiedad o proyecto
  // =========================
  if (!state.step || state.step === "inicio") {
    state = { step: "menu_principal" }
    await updateSession(session.id, state)

    const saludo = config?.saludo || "Hola 👋"

    return `${saludo}\n\n¿Qué deseas hacer hoy?\n\n1. 🏠 Ver propiedades\n2. 🏗️ Ver proyectos inmobiliarios\n3. 📅 Mis citas\n\nEscribe *agente* para hablar con una persona.`
  }

  // =========================
  // PASO: MENU PRINCIPAL
  // =========================
  if (state.step === "menu_principal") {
    if (text === "1" || text.includes("propiedad")) {
      state.step = "tipo_propiedad"
      await updateSession(session.id, state)
      return "¿Qué tipo de propiedad buscas?\n\n1. Casa\n2. Departamento\n3. Terreno\n4. Local / Comercial\n5. Oficina"
    }

    if (text === "2" || text.includes("proyecto")) {
      state.step = "ver_proyectos"
      await updateSession(session.id, state)
      return await listarProyectos(tenant.id)
    }

    if (text === "3" || text.includes("cita")) {
      return await listarCitasCliente(cliente.id, tenant.id)
    }

    return "Por favor selecciona una opción válida:\n1. Propiedades\n2. Proyectos\n3. Mis citas"
  }

  // =========================
  // FLUJO PROYECTOS
  // =========================
  if (state.step === "ver_proyectos") {
    // El cliente selecciona un proyecto por número
    const num = parseInt(text)
    if (!isNaN(num) && state.proyectos_ids?.[num - 1]) {
      const proyectoId = state.proyectos_ids[num - 1]

      // Incrementar contador de consultas
      await supabase.rpc("increment_consultas_proyecto", { p_id: proyectoId })

      const detalle = await detalleProyecto(proyectoId)
      state.step = "detalle_proyecto"
      state.proyecto_id = proyectoId
      await updateSession(session.id, state)

      return detalle
    }

    return "Escribe el número del proyecto que te interesa."
  }

  if (state.step === "detalle_proyecto") {
    if (text === "1" || text.includes("unidad") || text.includes("propiedad")) {
      const propiedades = await listarPropiedadesProyecto(state.proyecto_id)
      state.step = "ver_propiedades_proyecto"
      await updateSession(session.id, state)
      return propiedades
    }

    if (text === "2" || text.includes("cita") || text.includes("visita")) {
      state.step = "agendar_proyecto"
      await updateSession(session.id, state)
      return await mostrarHorariosProyecto(state.proyecto_id, config?.dias_max_cita ?? 7)
    }

    if (text === "0" || text.includes("volver")) {
      state.step = "menu_principal"
      await updateSession(session.id, state)
      return "¿En qué más puedo ayudarte?\n\n1. Propiedades\n2. Proyectos\n3. Mis citas"
    }

    return "¿Qué deseas hacer?\n\n1. Ver unidades disponibles\n2. Agendar visita al proyecto\n0. Volver al menú"
  }

  // =========================
  // FLUJO PROPIEDADES INDEPENDIENTES
  // =========================
  if (state.step === "tipo_propiedad") {
    const tipos: Record<string, string> = {
      "1": "casa", "casa": "casa",
      "2": "departamento", "departamento": "departamento", "depa": "departamento",
      "3": "terreno", "terreno": "terreno", "lote": "terreno",
      "4": "comercial", "local": "comercial", "comercial": "comercial",
      "5": "oficina", "oficina": "oficina",
    }

    const tipo = tipos[text]
    if (!tipo) return "Selecciona una opción válida:\n1. Casa\n2. Departamento\n3. Terreno\n4. Local\n5. Oficina"

    state.tipo = tipo
    state.step = "operacion"
    await updateSession(session.id, state)

    return "¿Buscas para:\n\n1. Comprar\n2. Alquilar"
  }

  if (state.step === "operacion") {
    const operaciones: Record<string, string> = {
      "1": "venta", "comprar": "venta", "compra": "venta", "venta": "venta",
      "2": "alquiler", "alquilar": "alquiler", "arrendar": "alquiler", "arriendo": "alquiler",
    }

    const operacion = operaciones[text]
    if (!operacion) return "Selecciona:\n1. Comprar\n2. Alquilar"

    state.operacion = operacion
    state.step = "ciudad"
    await updateSession(session.id, state)

    return "¿En qué ciudad buscas?\nEjemplo: Guayaquil, Quito, Cuenca"
  }

  if (state.step === "ciudad") {
    state.ciudad = text
    state.step = "sector"
    await updateSession(session.id, state)

    return "¿En qué sector o zona?\nEjemplo: Norte, Samborondón, Cumbayá"
  }

  if (state.step === "sector") {
    state.sector = text
    state.step = "mostrar_resultados"

    const { data: propiedades } = await supabase
      .from("propiedades")
      .select("id, nombre, precio, tipo_propiedad, sector, ciudad, estado")
      .eq("tenant_id", tenant.id)
      .eq("tipo_propiedad", state.tipo)
      .eq("tipo_operacion", state.operacion)
      .eq("estado", "disponible")
      .ilike("ciudad", `%${state.ciudad}%`)
      .ilike("sector", `%${state.sector}%`)
      .is("deleted_at", null)
      .is("proyecto_id", null)
      .limit(5)

    if (!propiedades?.length) {
      state.step = "sin_resultados"
      await updateSession(session.id, state)
      return `No encontré ${state.tipo}s en ${state.sector}, ${state.ciudad}.\n\n¿Deseas:\n1. Buscar en otro sector\n2. Ver proyectos en esa zona\n0. Volver al menú`
    }

    state.propiedades_ids = propiedades.map(p => p.id)
    await updateSession(session.id, state)

    let res = `🏠 Encontré ${propiedades.length} opción(es):\n\n`
    propiedades.forEach((p, i) => {
      res += `${i + 1}. *${p.nombre}*\n`
      res += `   💰 $${Number(p.precio).toLocaleString("es-EC")}\n`
      res += `   📍 ${p.sector}, ${p.ciudad}\n\n`
    })
    res += `Escribe el número para ver detalles o *0* para volver.`

    return res
  }

  if (state.step === "mostrar_resultados") {
    const num = parseInt(text)
    if (text === "0") {
      state.step = "menu_principal"
      await updateSession(session.id, state)
      return "¿En qué más puedo ayudarte?\n\n1. Propiedades\n2. Proyectos\n3. Mis citas"
    }

    if (!isNaN(num) && state.propiedades_ids?.[num - 1]) {
      const propiedadId = state.propiedades_ids[num - 1]

      await supabase
        .from("propiedades")
        .update({ total_consultas: supabase.rpc as any })
        .eq("id", propiedadId)

      const detalle = await detallePropiedad(propiedadId)
      state.step = "detalle_propiedad"
      state.propiedad_id = propiedadId
      await updateSession(session.id, state)

      return detalle
    }

    return "Escribe el número de la propiedad que te interesa o *0* para volver."
  }

  if (state.step === "detalle_propiedad") {
    if (text === "1" || text.includes("cita") || text.includes("visita")) {
      // Verificar si está verificado para agendar
      if (!cliente.verificado) {
        state.step = "solicitar_cedula"
        await updateSession(session.id, state)
        return "Para agendar una cita necesitamos verificar tu identidad.\n\nPor favor envíanos tu número de cédula:"
      }

      state.step = "agendar_propiedad"
      await updateSession(session.id, state)
      return await mostrarHorariosPropiedad(state.propiedad_id, config?.dias_max_cita ?? 7)
    }

    if (text === "0" || text.includes("volver")) {
      state.step = "mostrar_resultados"
      await updateSession(session.id, state)
      return "¿Qué otra propiedad te interesa? Escribe el número o *0* para el menú."
    }

    return "¿Qué deseas hacer?\n\n1. Agendar visita\n0. Volver"
  }

  // =========================
  // VERIFICACIÓN DE CÉDULA
  // =========================
  // =========================
  // VERIFICACIÓN DE CÉDULA
  // =========================
  if (state.step === "solicitar_cedula") {
    const cedula = text.replace(/\D/g, "")

    if (cedula.length !== 10) {
      return "Por favor ingresa los 10 dígitos de tu cédula:"
    }

    // Validar con API del Registro Civil
    const resultado = await validarCedulaAPI(cedula)

    if (!resultado.valida) {
      return `❌ ${resultado.error || "Cédula inválida"}.\n\nPor favor verifica e intenta de nuevo:`
    }

    // Actualizar cliente con datos del Registro Civil
    const updateData: any = {
      ruc_ci: cedula,
      verificado: true,
      verificado_at: new Date().toISOString(),
    }

    // Si la API trajo el nombre, actualizarlo
    if (resultado.nombre_completo) {
      updateData.nombres_completos = resultado.nombre_completo
    }

    await supabase
      .from("clientes")
      .update(updateData)
      .eq("id", cliente.id)

    // Continuar al agendamiento
    state.step = state.propiedad_id ? "agendar_propiedad" : "agendar_proyecto"
    await updateSession(session.id, state)

    const saludo = resultado.nombre_completo
      ? `✅ Identidad verificada. Bienvenid@ *${resultado.nombre_completo}*.\n\n`
      : `✅ Cédula verificada.\n\n`

    const horarios = state.propiedad_id
      ? await mostrarHorariosPropiedad(state.propiedad_id, config?.dias_max_cita ?? 7)
      : await mostrarHorariosProyecto(state.proyecto_id, config?.dias_max_cita ?? 7)

    return saludo + horarios
  }
  // =========================
  // SIN RESULTADOS
  // =========================
  if (state.step === "sin_resultados") {
    if (text === "1") {
      state.step = "sector"
      await updateSession(session.id, state)
      return "¿En qué otro sector buscas?"
    }
    if (text === "2") {
      state.step = "ver_proyectos"
      await updateSession(session.id, state)
      return await listarProyectos(tenant.id, state.ciudad)
    }
    if (text === "0") {
      state.step = "menu_principal"
      await updateSession(session.id, state)
      return "¿En qué más puedo ayudarte?\n\n1. Propiedades\n2. Proyectos\n3. Mis citas"
    }
    return "Selecciona:\n1. Buscar en otro sector\n2. Ver proyectos\n0. Menú principal"
  }

  // Fallback — no entendió
  await supabase.from("notificaciones").insert({
    tenant_id: tenant.id,
    cliente_id: cliente.id,
    sesion_id: session.id,
    tipo: "bot_no_entendio",
    mensaje: `El bot no entendió: "${text}"`,
  })

  return "No entendí tu mensaje 😅\n\nEscribe *menu* para ver las opciones o *agente* para hablar con una persona."
}

// =========================
// HELPERS
// =========================

async function updateSession(id: number, contenido: any) {
  await supabase
    .from("chat_sesiones")
    .update({ contenido, updated_at: new Date().toISOString() })
    .eq("id", id)
}

async function listarProyectos(tenantId: number, ciudad?: string): Promise<string> {
  let query = supabase
    .from("proyectos")
    .select("id, nombre, ciudad, sector, precio_desde, precio_hasta, estado, fecha_entrega_estimada")
    .eq("tenant_id", tenantId)
    .eq("estado", "activo")
    .is("deleted_at", null)
    .limit(5)

  if (ciudad) query = query.ilike("ciudad", `%${ciudad}%`)

  const { data } = await query

  if (!data?.length) return "No tenemos proyectos disponibles en este momento.\n\nEscribe *1* para buscar propiedades independientes."

  let res = "🏗️ *Proyectos disponibles:*\n\n"
  data.forEach((p, i) => {
    res += `${i + 1}. *${p.nombre}*\n`
    res += `   📍 ${p.sector}, ${p.ciudad}\n`
    if (p.precio_desde) res += `   💰 Desde $${Number(p.precio_desde).toLocaleString("es-EC")}\n`
    if (p.fecha_entrega_estimada) res += `   📆 Entrega: ${new Date(p.fecha_entrega_estimada).toLocaleDateString("es-EC")}\n`
    res += "\n"
  })
  res += "Escribe el número del proyecto para ver detalles."

  return res
}

async function detalleProyecto(proyectoId: number): Promise<string> {
  const { data: p } = await supabase
    .from("proyectos")
    .select("*")
    .eq("id", proyectoId)
    .single()

  if (!p) return "Proyecto no encontrado."

  const amenidades = Array.isArray(p.amenidades) ? p.amenidades.join(", ") : ""

  let res = `🏗️ *${p.nombre}*\n\n`
  res += `📍 ${p.direccion || p.sector + ", " + p.ciudad}\n`
  res += `💰 Desde $${Number(p.precio_desde).toLocaleString("es-EC")}`
  if (p.precio_hasta) res += ` hasta $${Number(p.precio_hasta).toLocaleString("es-EC")}`
  res += "\n"
  if (p.fecha_entrega_estimada) res += `📆 Entrega estimada: ${new Date(p.fecha_entrega_estimada).toLocaleDateString("es-EC")}\n`
  if (amenidades) res += `✨ Amenidades: ${amenidades}\n`
  res += `\n${p.descripcion}\n`
  if (p.sitio_web) res += `\n🌐 ${p.sitio_web}\n`
  res += "\n¿Qué deseas hacer?\n1. Ver unidades disponibles\n2. Agendar visita\n0. Volver"

  return res
}

async function listarPropiedadesProyecto(proyectoId: number): Promise<string> {
  const { data } = await supabase
    .from("propiedades")
    .select("id, nombre, precio, tipo_propiedad, estado, caracteristicas")
    .eq("proyecto_id", proyectoId)
    .eq("estado", "disponible")
    .is("deleted_at", null)
    .limit(10)

  if (!data?.length) return "No hay unidades disponibles en este proyecto actualmente."

  let res = "🏠 *Unidades disponibles:*\n\n"
  data.forEach((p, i) => {
    const hab = p.caracteristicas?.habitaciones
    const m2 = p.caracteristicas?.m2 || p.caracteristicas?.m2_construccion
    res += `${i + 1}. *${p.nombre}*\n`
    res += `   💰 $${Number(p.precio).toLocaleString("es-EC")}\n`
    if (hab) res += `   🛏 ${hab} habitaciones\n`
    if (m2) res += `   📐 ${m2} m²\n`
    res += "\n"
  })

  return res
}

async function detallePropiedad(propiedadId: number): Promise<string> {
  const { data: p } = await supabase
    .from("propiedades")
    .select("*")
    .eq("id", propiedadId)
    .single()

  if (!p) return "Propiedad no encontrada."

  const c = p.caracteristicas || {}
  let res = `🏠 *${p.nombre}*\n\n`
  res += `📍 ${p.direccion || p.sector + ", " + p.ciudad}\n`
  res += `💰 $${Number(p.precio).toLocaleString("es-EC")}\n`
  if (c.habitaciones) res += `🛏 ${c.habitaciones} habitaciones\n`
  if (c.banos) res += `🚿 ${c.banos} baños\n`
  if (c.m2_construccion) res += `📐 ${c.m2_construccion} m² construcción\n`
  if (c.m2_terreno) res += `📐 ${c.m2_terreno} m² terreno\n`
  if (c.estacionamientos) res += `🚗 ${c.estacionamientos} estacionamiento(s)\n`
  res += `\n${p.descripcion}\n`
  if (p.sitio_web) res += `\n🌐 ${p.sitio_web}\n`
  res += "\n¿Qué deseas hacer?\n1. Agendar visita\n0. Volver"

  return res
}

async function mostrarHorariosPropiedad(propiedadId: number, diasMax: number): Promise<string> {
  const desde = new Date()
  const hasta = new Date()
  hasta.setDate(hasta.getDate() + diasMax)

  const { data } = await supabase
    .from("horarios_disponibles")
    .select("id, fecha, hora_inicio, hora_fin")
    .eq("propiedad_id", propiedadId)
    .eq("disponible", true)
    .gte("fecha", desde.toISOString().split("T")[0])
    .lte("fecha", hasta.toISOString().split("T")[0])
    .is("deleted_at", null)
    .order("fecha", { ascending: true })
    .limit(6)

  if (!data?.length) return "No hay horarios disponibles para esta propiedad en este momento.\nEscribe *agente* para coordinar directamente."

  let res = "📅 *Horarios disponibles:*\n\n"
  data.forEach((h, i) => {
    const fecha = new Date(h.fecha + "T00:00:00").toLocaleDateString("es-EC", {
      weekday: "long", day: "numeric", month: "long"
    })
    res += `${i + 1}. ${fecha}\n   🕐 ${h.hora_inicio} - ${h.hora_fin}\n\n`
  })
  res += "Escribe el número del horario que prefieres."

  return res
}

async function mostrarHorariosProyecto(proyectoId: number, diasMax: number): Promise<string> {
  const desde = new Date()
  const hasta = new Date()
  hasta.setDate(hasta.getDate() + diasMax)

  const { data } = await supabase
    .from("horarios_disponibles")
    .select("id, fecha, hora_inicio, hora_fin")
    .eq("proyecto_id", proyectoId)
    .eq("disponible", true)
    .gte("fecha", desde.toISOString().split("T")[0])
    .lte("fecha", hasta.toISOString().split("T")[0])
    .is("deleted_at", null)
    .order("fecha", { ascending: true })
    .limit(6)

  if (!data?.length) return "No hay horarios disponibles para este proyecto.\nEscribe *agente* para coordinar."

  let res = "📅 *Horarios disponibles para visita al proyecto:*\n\n"
  data.forEach((h, i) => {
    const fecha = new Date(h.fecha + "T00:00:00").toLocaleDateString("es-EC", {
      weekday: "long", day: "numeric", month: "long"
    })
    res += `${i + 1}. ${fecha}\n   🕐 ${h.hora_inicio} - ${h.hora_fin}\n\n`
  })
  res += "Escribe el número del horario que prefieres."

  return res
}

async function listarCitasCliente(clienteId: number, tenantId: number): Promise<string> {
  const { data } = await supabase
    .from("reservas")
    .select("fecha, estado, propiedades(nombre), proyectos(nombre)")
    .eq("cliente_id", clienteId)
    .eq("tenant_id", tenantId)
    .gte("fecha", new Date().toISOString())
    .is("deleted_at", null)
    .order("fecha", { ascending: true })
    .limit(5)

  if (!data?.length) return "No tienes citas programadas.\n\n¿Deseas:\n1. Buscar propiedades\n2. Ver proyectos"

  let res = "📅 *Tus citas próximas:*\n\n"
  data.forEach((r: any, i: number) => {
    const fecha = new Date(r.fecha).toLocaleDateString("es-EC", {
      weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
    })
    const nombre = r.propiedades?.nombre || r.proyectos?.nombre || "Visita"
    res += `${i + 1}. *${nombre}*\n   📆 ${fecha}\n   Estado: ${r.estado}\n\n`
  })

  return res
}

function validarCedulaEcuatoriana(cedula: string): boolean {
  if (cedula.length !== 10) return false
  const provincia = parseInt(cedula.substring(0, 2))
  if (provincia < 1 || provincia > 24) return false

  const digitos = cedula.split("").map(Number)
  const verificador = digitos[9]
  let suma = 0

  for (let i = 0; i < 9; i++) {
    let val = digitos[i]
    if (i % 2 === 0) {
      val *= 2
      if (val > 9) val -= 9
    }
    suma += val
  }

  const resultado = suma % 10 === 0 ? 0 : 10 - (suma % 10)
  return resultado === verificador
}