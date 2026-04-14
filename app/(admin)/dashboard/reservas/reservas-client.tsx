"use client"

import { useState } from "react"

interface Reserva {
    id: number
    fecha: string
    estado: string
    created_at: string
    clientes: any
    propiedades: any
    proyectos: any
}

export default function ReservasClient({
    reservasIniciales
}: {
    reservasIniciales: Reserva[]
}) {
    const [reservas, setReservas] = useState(reservasIniciales)
    const [filtro, setFiltro] = useState("todos")
    const [toast, setToast] = useState("")

    const mostrarToast = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(""), 2200)
    }

    const cambiarEstado = async (id: number, estado: string) => {
        const res = await fetch("/api/admin/reservas", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, estado })
        })

        if (res.ok) {
            setReservas(prev =>
                prev.map(r => r.id === id ? { ...r, estado } : r)
            )
            mostrarToast(
                estado === "confirmada" ? "Cita confirmada ✓"
                    : estado === "cancelada" ? "Cita cancelada"
                    : "Estado actualizado"
            )
        }
    }

    const filtradas = reservas.filter(r => {
        if (filtro === "pendiente" && r.estado !== "pendiente") return false
        if (filtro === "confirmada" && r.estado !== "confirmada") return false
        if (filtro === "cancelada" && r.estado !== "cancelada") return false
        return true
    })

    // Agrupar por fecha
    const agrupadas: Record<string, Reserva[]> = {}
    filtradas.forEach(r => {
        const fecha = r.fecha.split("T")[0]
        if (!agrupadas[fecha]) agrupadas[fecha] = []
        agrupadas[fecha].push(r)
    })

    const formatFechaGrupo = (fecha: string) => {
        const d = new Date(fecha + "T00:00:00")
        const hoy = new Date()
        const manana = new Date()
        manana.setDate(hoy.getDate() + 1)

        const esHoy = d.toDateString() === hoy.toDateString()
        const esManana = d.toDateString() === manana.toDateString()

        if (esHoy) return "Hoy"
        if (esManana) return "Mañana"
        return d.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" })
    }

    const badgeEstado = (estado: string) => ({
        pendiente: { bg: "var(--sab)", text: "var(--sa)" },
        confirmada: { bg: "var(--sgb)", text: "var(--sg)" },
        cancelada: { bg: "var(--sgrb)", text: "var(--sgr)" },
    }[estado] || { bg: "var(--sgrb)", text: "var(--sgr)" })

    const filtros = [
        { id: "todos", label: "Todas" },
        { id: "pendiente", label: "Pendientes" },
        { id: "confirmada", label: "Confirmadas" },
        { id: "cancelada", label: "Canceladas" },
    ]

    const pendientes = reservas.filter(r => r.estado === "pendiente").length

    return (
        <div>
            {/* Header */}
            <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16, flexWrap: "wrap", gap: 10
            }}>
                <div style={{
                    fontSize: 22, fontWeight: 500, color: "var(--text)",
                    fontFamily: "'DM Serif Display', serif"
                }}>
                    Reservas y citas
                </div>
                {pendientes > 0 && (
                    <span style={{
                        padding: "4px 10px", borderRadius: 20,
                        background: "var(--sab)", color: "var(--sa)",
                        fontSize: 12, fontWeight: 500
                    }}>
                        {pendientes} pendiente(s)
                    </span>
                )}
            </div>

            {/* Filtros */}
            <div style={{
                background: "var(--surface)", border: "0.5px solid var(--border)",
                borderRadius: 10, padding: "10px 14px",
                display: "flex", gap: 8, flexWrap: "wrap",
                alignItems: "center", marginBottom: 14
            }}>
                {filtros.map(f => (
                    <button key={f.id} onClick={() => setFiltro(f.id)} style={{
                        padding: "5px 12px", borderRadius: 20,
                        border: "0.5px solid var(--border2)",
                        background: filtro === f.id ? "var(--accent-light)" : "var(--surface2)",
                        color: filtro === f.id ? "var(--accent)" : "var(--text2)",
                        fontSize: 11, fontWeight: 500, cursor: "pointer",
                        fontFamily: "inherit"
                    }}>
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Reservas agrupadas por fecha */}
            {Object.keys(agrupadas).length === 0 ? (
                <div style={{
                    background: "var(--surface)",
                    border: "0.5px solid var(--border)",
                    borderRadius: 10, padding: 40,
                    textAlign: "center", fontSize: 13, color: "var(--text3)"
                }}>
                    Sin reservas
                </div>
            ) : (
                <div style={{
                    background: "var(--surface)",
                    border: "0.5px solid var(--border)",
                    borderRadius: 10, overflow: "hidden"
                }}>
                    {Object.entries(agrupadas).map(([fecha, items]) => (
                        <div key={fecha}>
                            {/* Separador de fecha */}
                            <div style={{
                                display: "flex", alignItems: "center",
                                gap: 10, padding: "8px 16px 4px"
                            }}>
                                <span style={{
                                    fontSize: 11, fontWeight: 500,
                                    color: "var(--text3)",
                                    textTransform: "uppercase",
                                    letterSpacing: ".07em"
                                }}>
                                    {formatFechaGrupo(fecha)}
                                </span>
                                <div style={{
                                    flex: 1, height: "0.5px",
                                    background: "var(--border)"
                                }} />
                            </div>

                            {/* Items del día */}
                            {items.map((r, i) => {
                                const cliente = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
                                const prop = Array.isArray(r.propiedades) ? r.propiedades[0] : r.propiedades
                                const proy = Array.isArray(r.proyectos) ? r.proyectos[0] : r.proyectos
                                const hora = new Date(r.fecha).toLocaleTimeString("es-EC", {
                                    hour: "2-digit", minute: "2-digit"
                                })
                                const badge = badgeEstado(r.estado)

                                return (
                                    <div
                                        key={r.id}
                                        style={{
                                            display: "flex", alignItems: "center",
                                            gap: 10, padding: "10px 16px",
                                            borderBottom: "0.5px solid var(--border)",
                                            transition: "background .1s"
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                    >
                                        {/* Hora */}
                                        <div style={{
                                            background: "var(--surface2)",
                                            borderRadius: 7, padding: "5px 9px",
                                            textAlign: "center", flexShrink: 0,
                                            minWidth: 52
                                        }}>
                                            <div style={{
                                                fontSize: 14, fontWeight: 500,
                                                fontFamily: "'DM Serif Display', serif",
                                                color: "var(--text)", lineHeight: 1
                                            }}>
                                                {hora}
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div style={{ flex: 1, overflow: "hidden" }}>
                                            <div style={{
                                                fontSize: 13, fontWeight: 500,
                                                color: "var(--text)"
                                            }}>
                                                {cliente?.nombres_completos || cliente?.celular || "Cliente"}
                                            </div>
                                            <div style={{
                                                fontSize: 11, color: "var(--text3)",
                                                marginTop: 1,
                                                whiteSpace: "nowrap", overflow: "hidden",
                                                textOverflow: "ellipsis"
                                            }}>
                                                {prop?.nombre || proy?.nombre || "Visita"}
                                                {cliente?.celular && ` · ${cliente.celular}`}
                                            </div>
                                        </div>

                                        {/* Estado badge */}
                                        <span style={{
                                            padding: "2px 8px", borderRadius: 20,
                                            fontSize: 10, fontWeight: 500,
                                            background: badge.bg, color: badge.text,
                                            flexShrink: 0
                                        }}>
                                            {r.estado}
                                        </span>

                                        {/* Acciones */}
                                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                            {r.estado === "pendiente" && (
                                                <button
                                                    onClick={() => cambiarEstado(r.id, "confirmada")}
                                                    title="Confirmar cita"
                                                    style={{
                                                        width: 28, height: 28, borderRadius: 6,
                                                        border: "0.5px solid var(--sgb)",
                                                        background: "var(--sgb)", cursor: "pointer",
                                                        display: "flex", alignItems: "center",
                                                        justifyContent: "center",
                                                        color: "var(--sg)", fontSize: 13
                                                    }}
                                                >
                                                    ✓
                                                </button>
                                            )}
                                            {r.estado !== "cancelada" && (
                                                <button
                                                    onClick={() => cambiarEstado(r.id, "cancelada")}
                                                    title="Cancelar cita"
                                                    style={{
                                                        width: 28, height: 28, borderRadius: 6,
                                                        border: "0.5px solid var(--border2)",
                                                        background: "var(--surface2)", cursor: "pointer",
                                                        display: "flex", alignItems: "center",
                                                        justifyContent: "center",
                                                        color: "var(--text2)", fontSize: 12
                                                    }}
                                                    onMouseEnter={e => {
                                                        (e.currentTarget as HTMLElement).style.background = "var(--srb)"
                                                        ;(e.currentTarget as HTMLElement).style.color = "var(--sr)"
                                                    }}
                                                    onMouseLeave={e => {
                                                        (e.currentTarget as HTMLElement).style.background = "var(--surface2)"
                                                        ;(e.currentTarget as HTMLElement).style.color = "var(--text2)"
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </div>
            )}

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