"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface Conversacion {
    id: number
    modo: string
    updated_at: string
    step: string
    cliente: { id: number; nombre: string; celular: string; verificado: boolean }
    ultimo_mensaje: { contenido: string; origen: string; created_at: string } | null
    notificaciones: number
}

export default function ConversacionesClient({
    conversaciones: inicial
}: {
    conversaciones: Conversacion[]
}) {
    const router = useRouter()
    const [conversaciones] = useState(inicial)
    const [filtroModo, setFiltroModo] = useState<string>("todos")
    const [busqueda, setBusqueda] = useState("")

    const filtradas = conversaciones.filter(c => {
        if (filtroModo !== "todos" && c.modo !== filtroModo) return false
        if (busqueda && !c.cliente.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
            !c.cliente.celular.includes(busqueda)) return false
        return true
    })

    const tiempoRelativo = (fecha: string) => {
        const diff = Date.now() - new Date(fecha).getTime()
        const min = Math.floor(diff / 60000)
        if (min < 1) return "ahora"
        if (min < 60) return `${min}m`
        const h = Math.floor(min / 60)
        if (h < 24) return `${h}h`
        return `${Math.floor(h / 24)}d`
    }

    const iniciales = (nombre: string) =>
        nombre.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()

    const badgeModo = (modo: string) => ({
        automatico: { bg: "var(--sgb)", text: "var(--sg)", label: "bot" },
        manual: { bg: "var(--sab)", text: "var(--sa)", label: "manual" },
        pausado: { bg: "var(--sgrb)", text: "var(--sgr)", label: "pausado" },
    }[modo] || { bg: "var(--sgb)", text: "var(--sg)", label: "bot" })

    const colores = [
        { bg: "var(--sab)", text: "var(--sa)" },
        { bg: "var(--sbb)", text: "var(--sb)" },
        { bg: "var(--sgb)", text: "var(--sg)" },
        { bg: "var(--spb)", text: "var(--sp)" },
    ]

    const filtros = [
        { id: "todos", label: "Todas" },
        { id: "automatico", label: "Bot activo" },
        { id: "manual", label: "Manual" },
        { id: "pausado", label: "Pausado" },
    ]

    return (
        <div>
            {/* Header */}
            <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16, flexWrap: "wrap", gap: 10
            }}>
                <div style={{
                    fontSize: 22, color: "var(--text)", fontWeight: 500,
                    fontFamily: "'DM Serif Display', serif"
                }}>
                    Conversaciones
                </div>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>
                    {filtradas.length} conversación(es)
                </span>
            </div>

            {/* Filtros */}
            <div style={{
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                borderRadius: 10, padding: "10px 14px",
                display: "flex", flexWrap: "wrap",
                gap: 8, alignItems: "center",
                marginBottom: 14
            }}>
                {/* Búsqueda */}
                <input
                    type="text"
                    placeholder="Buscar por nombre o número..."
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    style={{
                        flex: 1, minWidth: 180,
                        padding: "6px 10px", borderRadius: 7,
                        border: "0.5px solid var(--border2)",
                        background: "var(--surface2)", color: "var(--text)",
                        fontFamily: "inherit", fontSize: 12, outline: "none"
                    }}
                />

                {/* Chips de modo */}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {filtros.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFiltroModo(f.id)}
                            style={{
                                padding: "5px 12px", borderRadius: 20,
                                border: "0.5px solid var(--border2)",
                                background: filtroModo === f.id ? "var(--accent-light)" : "var(--surface2)",
                                color: filtroModo === f.id ? "var(--accent)" : "var(--text2)",
                                fontSize: 11, fontWeight: 500, cursor: "pointer",
                                fontFamily: "inherit", transition: "all .12s"
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Lista */}
            <div style={{
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                borderRadius: 10, overflow: "hidden"
            }}>
                {filtradas.length === 0 ? (
                    <div style={{
                        padding: 40, textAlign: "center",
                        fontSize: 13, color: "var(--text3)"
                    }}>
                        Sin conversaciones
                    </div>
                ) : filtradas.map((c, i) => {
                    const color = colores[c.id % colores.length]
                    const badge = badgeModo(c.modo)
                    const origenLabel = c.ultimo_mensaje?.origen === "bot" ? "Bot: "
                        : c.ultimo_mensaje?.origen === "agente" ? "Tú: " : ""

                    return (
                        <div
                            key={c.id}
                            onClick={() => router.push(`/dashboard/conversaciones/${c.id}`)}
                            style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "12px 16px",
                                borderBottom: i < filtradas.length - 1
                                    ? "0.5px solid var(--border)" : "none",
                                cursor: "pointer", transition: "background .1s",
                                position: "relative"
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                            {/* Avatar */}
                            <div style={{
                                width: 38, height: 38, borderRadius: "50%",
                                background: color.bg, color: color.text,
                                display: "flex", alignItems: "center",
                                justifyContent: "center", fontSize: 13,
                                fontWeight: 500, flexShrink: 0, position: "relative"
                            }}>
                                {iniciales(c.cliente.nombre)}
                                {c.notificaciones > 0 && (
                                    <div style={{
                                        position: "absolute", top: -2, right: -2,
                                        width: 14, height: 14, borderRadius: "50%",
                                        background: "var(--sr)", color: "#fff",
                                        fontSize: 8, fontWeight: 700,
                                        display: "flex", alignItems: "center",
                                        justifyContent: "center"
                                    }}>
                                        {c.notificaciones}
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, overflow: "hidden" }}>
                                <div style={{
                                    display: "flex", alignItems: "center",
                                    gap: 6, marginBottom: 2
                                }}>
                                    <div style={{
                                        fontSize: 13, fontWeight: 500, color: "var(--text)"
                                    }}>
                                        {c.cliente.nombre}
                                    </div>
                                    {c.cliente.verificado && (
                                        <span style={{ fontSize: 10, color: "var(--sg)" }}>✓</span>
                                    )}
                                </div>
                                <div style={{
                                    fontSize: 11, color: "var(--text3)",
                                    whiteSpace: "nowrap", overflow: "hidden",
                                    textOverflow: "ellipsis"
                                }}>
                                    {c.ultimo_mensaje
                                        ? `${origenLabel}${c.ultimo_mensaje.contenido.slice(0, 60)}`
                                        : c.cliente.celular
                                    }
                                </div>
                            </div>

                            {/* Meta */}
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                                <div style={{
                                    fontSize: 10, color: "var(--text3)", marginBottom: 4
                                }}>
                                    {tiempoRelativo(c.updated_at)}
                                </div>
                                <span style={{
                                    display: "inline-flex", padding: "2px 7px",
                                    borderRadius: 20, fontSize: 10, fontWeight: 500,
                                    background: badge.bg, color: badge.text
                                }}>
                                    {badge.label}
                                </span>
                                {c.step && (
                                    <div style={{
                                        fontSize: 9, color: "var(--text3)",
                                        marginTop: 2
                                    }}>
                                        {c.step}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}