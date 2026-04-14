"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"

interface Mensaje {
    id: number
    origen: "cliente" | "bot" | "agente"
    contenido: string
    created_at: string
}

interface Props {
    sesion: { id: number; modo: string; step: string; updated_at: string }
    cliente: any
    mensajesIniciales: Mensaje[]
    propiedades: any[]
    proyectos: any[]
    agenteNombre: string
}

export default function ChatClient({
    sesion: sesionInicial,
    cliente,
    mensajesIniciales,
    propiedades,
    proyectos,
    agenteNombre
}: Props) {
    const router = useRouter()
    const [mensajes, setMensajes] = useState<Mensaje[]>(mensajesIniciales)
    const [modo, setModo] = useState(sesionInicial.modo)
    const [texto, setTexto] = useState("")
    const [enviando, setEnviando] = useState(false)
    const [cambiandoModo, setCambiandoModo] = useState(false)
    const [showPicker, setShowPicker] = useState(false)
    const [busquedaProp, setBusquedaProp] = useState("")
    const [toast, setToast] = useState("")
    const msgEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const pollingRef = useRef<NodeJS.Timeout | null>(null)

    // Scroll al fondo
    useEffect(() => {
        msgEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [mensajes])

    // Polling de mensajes nuevos
    const cargarMensajes = useCallback(async () => {
        try {
            const res = await fetch(`/api/admin/conversaciones/${sesionInicial.id}`)
            if (!res.ok) return
            const data = await res.json()
            setMensajes(data.mensajes || [])
            setModo(data.sesion.modo)
        } catch { }
    }, [sesionInicial.id])

    // En chat-client.tsx, reemplaza el useEffect del polling
    useEffect(() => {
        // Cargar mensajes frescos al montar
        cargarMensajes()

        // Polling cada 5 segundos
        pollingRef.current = setInterval(cargarMensajes, 5000)
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current)
        }
    }, [cargarMensajes])

    const mostrarToast = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(""), 2200)
    }

    // Cambiar modo
    const cambiarModo = async (nuevoModo: string) => {
        if (cambiandoModo || nuevoModo === modo) return
        setCambiandoModo(true)

        try {
            const res = await fetch("/api/admin/conversaciones/modo", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sesion_id: sesionInicial.id, modo: nuevoModo })
            })

            if (res.ok) {
                setModo(nuevoModo)
                mostrarToast({
                    automatico: "Bot activado",
                    manual: "Modo manual activado",
                    pausado: "Bot pausado"
                }[nuevoModo] || "")
            }
        } finally {
            setCambiandoModo(false)
        }
    }

    // Enviar mensaje
    const enviarMensaje = async () => {
        if (!texto.trim() || enviando || modo !== "manual") return
        setEnviando(true)

        const contenido = texto.trim()
        setTexto("")

        // Optimistic UI
        const msgTemp: Mensaje = {
            id: Date.now(),
            origen: "agente",
            contenido,
            created_at: new Date().toISOString()
        }
        setMensajes(prev => [...prev, msgTemp])

        try {
            const res = await fetch("/api/admin/conversaciones/mensaje", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sesion_id: sesionInicial.id,
                    mensaje: contenido,
                    celular_cliente: cliente?.celular
                })
            })

            if (!res.ok) {
                setMensajes(prev => prev.filter(m => m.id !== msgTemp.id))
                mostrarToast("Error al enviar el mensaje")
            }
        } catch {
            setMensajes(prev => prev.filter(m => m.id !== msgTemp.id))
            mostrarToast("Error de conexión")
        } finally {
            setEnviando(false)
        }
    }

    // Enviar link de propiedad/proyecto
    const enviarLink = async (item: any, tipo: "propiedad" | "proyecto") => {
        const slug = `${tipo}-1-${item.id}`
        const ciudad = (item.ciudad as any)?.nombre || ""
        const precio = item.precio
            ? `$${Number(item.precio).toLocaleString("es-EC")}`
            : item.precio_desde
                ? `Desde $${Number(item.precio_desde).toLocaleString("es-EC")}`
                : ""

        const msg = `${item.nombre}${ciudad ? ` · ${ciudad}` : ""}${precio ? ` · ${precio}` : ""}\n\n${process.env.NEXT_PUBLIC_APP_URL || ""}/p/${slug}`

        setTexto(msg)
        setShowPicker(false)
        textareaRef.current?.focus()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            enviarMensaje()
        }
    }

    const formatHora = (fecha: string) =>
        new Date(fecha).toLocaleTimeString("es-EC", {
            hour: "2-digit", minute: "2-digit"
        })

    const formatFecha = (fecha: string) =>
        new Date(fecha).toLocaleDateString("es-EC", {
            weekday: "short", day: "numeric", month: "short"
        })

    const modoConfig = {
        automatico: { dot: "var(--sg)", texto: "Bot activo — respondiendo automáticamente" },
        manual: { dot: "var(--sa)", texto: `Modo manual — ${agenteNombre} atendiendo` },
        pausado: { dot: "var(--sgr)", texto: "Pausado — sin respuestas automáticas" },
    }[modo] || { dot: "var(--sg)", texto: "" }

    // Agrupar mensajes por fecha
    const mensajesAgrupados: { fecha: string; mensajes: Mensaje[] }[] = []
    let fechaActual = ""
    mensajes.forEach(m => {
        const fecha = formatFecha(m.created_at)
        if (fecha !== fechaActual) {
            fechaActual = fecha
            mensajesAgrupados.push({ fecha, mensajes: [] })
        }
        mensajesAgrupados[mensajesAgrupados.length - 1].mensajes.push(m)
    })

    const propsFiltradas = [...propiedades, ...proyectos.map(p => ({ ...p, _tipo: "proyecto" }))].filter(p =>
        !busquedaProp || p.nombre.toLowerCase().includes(busquedaProp.toLowerCase())
    )

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 92px)" }}>

            {/* Header */}
            <div style={{
                display: "flex", alignItems: "center", gap: 12,
                marginBottom: 14, flexWrap: "wrap"
            }}>
                <button
                    onClick={() => router.push("/dashboard/conversaciones")}
                    style={{
                        padding: "5px 10px", borderRadius: 7,
                        border: "0.5px solid var(--border2)",
                        background: "var(--surface2)", cursor: "pointer",
                        fontSize: 12, color: "var(--text2)",
                        fontFamily: "inherit"
                    }}
                >
                    ← Volver
                </button>

                <div style={{ flex: 1 }}>
                    <div style={{
                        fontSize: 16, fontWeight: 500, color: "var(--text)"
                    }}>
                        {cliente?.nombres_completos || "Cliente WhatsApp"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text3)" }}>
                        {cliente?.celular}
                        {cliente?.verificado && (
                            <span style={{ color: "var(--sg)", marginLeft: 6 }}>✓ verificado</span>
                        )}
                        {cliente?.ruc_ci && (
                            <span style={{ marginLeft: 6 }}>· CI: {cliente.ruc_ci}</span>
                        )}
                    </div>
                </div>

                {/* Toggle modo */}
                <div style={{
                    display: "flex", border: "0.5px solid var(--border2)",
                    borderRadius: 7, overflow: "hidden"
                }}>
                    {[
                        { id: "automatico", label: "Bot" },
                        { id: "manual", label: "Manual" },
                        { id: "pausado", label: "Pausar" },
                    ].map(m => (
                        <button
                            key={m.id}
                            onClick={() => cambiarModo(m.id)}
                            disabled={cambiandoModo}
                            style={{
                                padding: "5px 12px", fontSize: 11, fontWeight: 500,
                                cursor: "pointer", border: "none",
                                fontFamily: "inherit", transition: "all .1s",
                                background: modo === m.id ? "var(--accent)" : "var(--surface2)",
                                color: modo === m.id ? "#fff" : "var(--text2)",
                            }}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chat */}
            <div style={{
                flex: 1, display: "flex", flexDirection: "column",
                background: "var(--surface)", border: "0.5px solid var(--border)",
                borderRadius: 10, overflow: "hidden"
            }}>
                {/* Mensajes */}
                <div style={{
                    flex: 1, overflowY: "auto", padding: 16,
                    display: "flex", flexDirection: "column", gap: 4,
                    background: "var(--bg)"
                }}>
                    {mensajesAgrupados.map(grupo => (
                        <div key={grupo.fecha}>
                            {/* Separador de fecha */}
                            <div style={{
                                display: "flex", alignItems: "center",
                                gap: 10, margin: "12px 0 8px"
                            }}>
                                <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
                                <span style={{
                                    fontSize: 10, color: "var(--text3)",
                                    fontWeight: 500, whiteSpace: "nowrap"
                                }}>
                                    {grupo.fecha}
                                </span>
                                <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
                            </div>

                            {/* Burbujas */}
                            {grupo.mensajes.map(m => {
                                const esAgente = m.origen === "agente"
                                const esBot = m.origen === "bot"
                                const esCliente = m.origen === "cliente"

                                return (
                                    <div
                                        key={m.id}
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            // Agente → derecha, Cliente y Bot → izquierda
                                            alignItems: esAgente ? "flex-end" : "flex-start",
                                            gap: 2, marginBottom: 8
                                        }}
                                    >
                                        {/* Etiqueta origen */}
                                        <div style={{
                                            fontSize: 10, color: "var(--text3)",
                                            padding: "0 4px",
                                            textAlign: esAgente ? "right" : "left"
                                        }}>
                                            {esAgente ? "asesor" : esBot ? "bot" : "cliente"}
                                        </div>

                                        {/* Burbuja */}
                                        <div style={{
                                            maxWidth: "75%",
                                            padding: "8px 12px",
                                            borderRadius: esAgente
                                                ? "12px 2px 12px 12px"   // derecha
                                                : "2px 12px 12px 12px",  // izquierda
                                            fontSize: 13,
                                            lineHeight: 1.5,
                                            wordBreak: "break-word",
                                            whiteSpace: "pre-wrap",
                                            // Agente = verde, Bot = azul claro, Cliente = blanco
                                            background: esAgente
                                                ? "var(--accent)"
                                                : esBot
                                                    ? "var(--sbb)"
                                                    : "var(--surface)",
                                            color: esAgente ? "#fff" : "var(--text)",
                                            border: esCliente
                                                ? "0.5px solid var(--border)" : "none",
                                            boxShadow: "0 1px 2px rgba(0,0,0,0.06)"
                                        }}>
                                            {m.contenido}
                                        </div>

                                        {/* Hora */}
                                        <div style={{
                                            fontSize: 9, color: "var(--text3)",
                                            padding: "0 4px"
                                        }}>
                                            {formatHora(m.created_at)}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                    <div ref={msgEndRef} />
                </div>

                {/* Barra de modo */}
                <div style={{
                    padding: "6px 14px",
                    borderTop: "0.5px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 6,
                    background: "var(--surface)"
                }}>
                    <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: modoConfig.dot, flexShrink: 0
                    }} />
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>
                        {modoConfig.texto}
                    </span>
                </div>

                {/* Selector de propiedades */}
                {showPicker && (
                    <div style={{
                        borderTop: "0.5px solid var(--border)",
                        padding: "10px 12px",
                        background: "var(--surface)"
                    }}>
                        <div style={{
                            fontSize: 10, fontWeight: 500, color: "var(--text3)",
                            textTransform: "uppercase", letterSpacing: ".06em",
                            marginBottom: 6
                        }}>
                            Adjuntar propiedad o proyecto
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={busquedaProp}
                            onChange={e => setBusquedaProp(e.target.value)}
                            style={{
                                width: "100%", padding: "6px 9px",
                                borderRadius: 6, border: "0.5px solid var(--border2)",
                                background: "var(--surface2)", color: "var(--text)",
                                fontFamily: "inherit", fontSize: 12, outline: "none",
                                marginBottom: 6
                            }}
                        />
                        <div style={{ maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                            {propsFiltradas.map(p => {
                                const esProy = !!(p as any)._tipo
                                const ciudad = (p.ciudad as any)?.nombre || ""
                                return (
                                    <div
                                        key={`${esProy ? "proy" : "prop"}-${p.id}`}
                                        onClick={() => enviarLink(p, esProy ? "proyecto" : "propiedad")}
                                        style={{
                                            display: "flex", alignItems: "center", gap: 8,
                                            padding: "6px 8px", borderRadius: 6,
                                            border: "0.5px solid var(--border)",
                                            cursor: "pointer", transition: "background .1s"
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                    >
                                        <span style={{ fontSize: 16 }}>
                                            {esProy ? "🏗️" : "🏠"}
                                        </span>
                                        <div style={{ flex: 1, overflow: "hidden" }}>
                                            <div style={{
                                                fontSize: 12, fontWeight: 500, color: "var(--text)",
                                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                            }}>
                                                {p.nombre}
                                            </div>
                                            <div style={{ fontSize: 10, color: "var(--text3)" }}>
                                                {ciudad}
                                                {p.precio
                                                    ? ` · $${Number(p.precio).toLocaleString("es-EC")}`
                                                    : p.precio_desde
                                                        ? ` · Desde $${Number(p.precio_desde).toLocaleString("es-EC")}`
                                                        : ""
                                                }
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Input */}
                <div style={{
                    borderTop: "0.5px solid var(--border)",
                    background: "var(--surface)", padding: "8px 12px"
                }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                        {/* Botón adjuntar */}
                        <button
                            onClick={() => setShowPicker(s => !s)}
                            disabled={modo !== "manual"}
                            title="Adjuntar propiedad"
                            style={{
                                width: 32, height: 32, borderRadius: 7,
                                border: "0.5px solid var(--border2)",
                                background: showPicker ? "var(--accent-light)" : "var(--surface2)",
                                cursor: modo === "manual" ? "pointer" : "not-allowed",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: showPicker ? "var(--accent)" : "var(--text2)",
                                opacity: modo !== "manual" ? 0.4 : 1,
                                flexShrink: 0
                            }}
                        >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="1" y="1" width="6" height="6" rx="1.5" />
                                <rect x="9" y="1" width="6" height="6" rx="1.5" />
                                <rect x="1" y="9" width="6" height="6" rx="1.5" />
                                <rect x="9" y="9" width="6" height="6" rx="1.5" />
                            </svg>
                        </button>

                        {/* Textarea */}
                        <textarea
                            ref={textareaRef}
                            value={texto}
                            onChange={e => {
                                setTexto(e.target.value)
                                e.target.style.height = "auto"
                                e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"
                            }}
                            onKeyDown={handleKeyDown}
                            disabled={modo !== "manual" || enviando}
                            placeholder={
                                modo !== "manual"
                                    ? "Cambia a modo Manual para responder"
                                    : "Escribe tu respuesta... (Enter envía)"
                            }
                            rows={1}
                            style={{
                                flex: 1, padding: "7px 10px",
                                borderRadius: 7, border: "0.5px solid var(--border2)",
                                background: "var(--surface2)", color: "var(--text)",
                                fontFamily: "inherit", fontSize: 13, outline: "none",
                                resize: "none", minHeight: 36, maxHeight: 100,
                                lineHeight: 1.4, transition: "border-color .12s",
                                opacity: modo !== "manual" ? 0.5 : 1,
                                cursor: modo !== "manual" ? "not-allowed" : "text"
                            }}
                        />

                        {/* Botón enviar */}
                        <button
                            onClick={enviarMensaje}
                            disabled={!texto.trim() || modo !== "manual" || enviando}
                            style={{
                                width: 34, height: 34, borderRadius: 7,
                                background: "var(--accent)", border: "none",
                                cursor: "pointer", display: "flex",
                                alignItems: "center", justifyContent: "center",
                                flexShrink: 0, transition: "background .12s",
                                opacity: !texto.trim() || modo !== "manual" ? 0.35 : 1
                            }}
                        >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.8">
                                <path d="M2 8h12M9 3l5 5-5 5" />
                            </svg>
                        </button>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4, paddingLeft: 40 }}>
                        Enter envía · Shift+Enter nueva línea
                    </div>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div style={{
                    position: "fixed", bottom: 24, left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--accent)", color: "#fff",
                    padding: "7px 16px", borderRadius: 8,
                    fontSize: 12, fontWeight: 500, zIndex: 99,
                    whiteSpace: "nowrap", pointerEvents: "none"
                }}>
                    {toast}
                </div>
            )}
        </div>
    )
}