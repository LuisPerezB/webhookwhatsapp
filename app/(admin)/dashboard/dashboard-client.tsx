"use client"

import { useRouter } from "next/navigation"

interface Props {
    session: any
    resumen: any
    leadsPorDia: { dia: string; label: string; count: number }[]
    visitasHoy: any[]
    conversaciones: any[]
    fechaFormato: string
}

export default function DashboardClient({
    session, resumen, leadsPorDia, visitasHoy, conversaciones, fechaFormato
}: Props) {
    const router = useRouter()

    const maxLeads = Math.max(...leadsPorDia.map(d => d.count), 1)

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
        (nombre || "CL").split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()

    const badgeModo = (modo: string) => {
        const cfg: Record<string, { bg: string; text: string; label: string }> = {
            automatico: { bg: "var(--sgb)", text: "var(--sg)", label: "bot" },
            manual: { bg: "var(--sab)", text: "var(--sa)", label: "manual" },
            pausado: { bg: "var(--sgrb)", text: "var(--sgr)", label: "pausado" },
        }
        return cfg[modo] || cfg.automatico
    }

    const coloresAvatar = [
        { bg: "var(--sab)", text: "var(--sa)" },
        { bg: "var(--sbb)", text: "var(--sb)" },
        { bg: "var(--sgb)", text: "var(--sg)" },
        { bg: "var(--spb)", text: "var(--sp)" },
    ]

    const stats = [
        {
            label: "Propiedades",
            value: resumen.total_propiedades ?? 0,
            sub: "activas",
            color: "var(--sb)"
        },
        {
            label: "Proyectos",
            value: resumen.total_proyectos ?? 0,
            sub: "activos",
            color: "var(--sp)"
        },
        {
            label: "Clientes",
            value: resumen.total_clientes ?? 0,
            sub: "registrados",
            color: "var(--sg)"
        },
        {
            label: "Reservas",
            value: resumen.reservas_pendientes ?? 0,
            sub: "pendientes",
            color: "var(--sa)"
        },
        {
            label: "Leads hoy",
            value: resumen.leads_hoy ?? 0,
            sub: "nuevos",
            color: "var(--accent)"
        },
        {
            label: "Conversaciones",
            value: resumen.conversaciones_activas ?? 0,
            sub: "activas",
            color: "var(--sg)"
        },
    ]

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
                <div style={{
                    fontSize: 22, color: "var(--text)", fontWeight: 500,
                    fontFamily: "'DM Serif Display', serif"
                }}>
                    Buen día, {session.nombres.split(" ")[0]}
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                    {fechaFormato}
                </div>
            </div>

            {/* Stats */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 10, marginBottom: 16
            }}>
                {stats.map(s => (
                    <div key={s.label} style={{
                        background: "var(--surface2)", borderRadius: 10, padding: 13
                    }}>
                        <div style={{
                            fontSize: 10, color: "var(--text3)", fontWeight: 500,
                            textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5
                        }}>
                            {s.label}
                        </div>
                        <div style={{
                            fontSize: 26, fontWeight: 300, color: "var(--text)",
                            lineHeight: 1, fontFamily: "'DM Serif Display', serif"
                        }}>
                            {s.value}
                        </div>
                        <div style={{ fontSize: 11, color: s.color, marginTop: 3 }}>
                            {s.sub}
                        </div>
                    </div>
                ))}
            </div>

            {/* Grid principal */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14, marginBottom: 14
            }}>
                {/* Conversaciones recientes */}
                <div style={{
                    background: "var(--surface)",
                    border: "0.5px solid var(--border)",
                    borderRadius: 10, overflow: "hidden"
                }}>
                    <div style={{
                        padding: "12px 16px",
                        borderBottom: "0.5px solid var(--border)",
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between"
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                            Conversaciones recientes
                        </div>
                        <button
                            onClick={() => router.push("/dashboard/conversaciones")}
                            style={{
                                fontSize: 11, color: "var(--accent)",
                                background: "none", border: "none",
                                cursor: "pointer", fontFamily: "inherit"
                            }}
                        >
                            Ver todas →
                        </button>
                    </div>

                    {conversaciones.length === 0 ? (
                        <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text3)" }}>
                            Sin conversaciones aún
                        </div>
                    ) : conversaciones.map((conv: any, i: number) => {
                        const color = coloresAvatar[i % coloresAvatar.length]
                        const badge = badgeModo(conv.modo)
                        const cliente = conv.cliente || {}
                        return (
                            <div
                                key={conv.id}
                                onClick={() => router.push(`/dashboard/conversaciones/${conv.id}`)}
                                style={{
                                    display: "flex", alignItems: "center", gap: 10,
                                    padding: "9px 16px",
                                    borderBottom: "0.5px solid var(--border)",
                                    cursor: "pointer", transition: "background .1s"
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                                <div style={{
                                    width: 30, height: 30, borderRadius: "50%",
                                    background: color.bg, color: color.text,
                                    display: "flex", alignItems: "center",
                                    justifyContent: "center", fontSize: 11,
                                    fontWeight: 500, flexShrink: 0
                                }}>
                                    {iniciales(cliente.nombres_completos || "CL")}
                                </div>
                                <div style={{ flex: 1, overflow: "hidden" }}>
                                    <div style={{
                                        fontSize: 13, fontWeight: 500, color: "var(--text)",
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                    }}>
                                        {cliente.nombres_completos || cliente.celular || "Cliente"}
                                    </div>
                                    <div style={{
                                        fontSize: 11, color: "var(--text3)", marginTop: 1,
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                    }}>
                                        {conv.ultimo_mensaje
                                            ? `${conv.ultimo_mensaje.origen === "bot" ? "Bot: " : conv.ultimo_mensaje.origen === "agente" ? "Tú: " : ""}${conv.ultimo_mensaje.contenido.slice(0, 45)}`
                                            : "Sin mensajes"
                                        }
                                    </div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 3 }}>
                                        {tiempoRelativo(conv.updated_at)}
                                    </div>
                                    <span style={{
                                        display: "inline-flex", padding: "1px 6px",
                                        borderRadius: 20, fontSize: 10, fontWeight: 500,
                                        background: badge.bg, color: badge.text
                                    }}>
                                        {badge.label}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Visitas de hoy */}
                <div style={{
                    background: "var(--surface)",
                    border: "0.5px solid var(--border)",
                    borderRadius: 10, overflow: "hidden"
                }}>
                    <div style={{
                        padding: "12px 16px",
                        borderBottom: "0.5px solid var(--border)",
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between"
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                            Visitas de hoy
                        </div>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>
                            {new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long" })}
                        </span>
                    </div>

                    {visitasHoy.length === 0 ? (
                        <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text3)" }}>
                            Sin visitas programadas para hoy
                        </div>
                    ) : visitasHoy.map((v: any, i: number) => {
                        const cliente = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
                        const prop = Array.isArray(v.propiedades) ? v.propiedades[0] : v.propiedades
                        const proy = Array.isArray(v.proyectos) ? v.proyectos[0] : v.proyectos
                        const hora = new Date(v.fecha).toLocaleTimeString("es-EC", {
                            hour: "2-digit", minute: "2-digit"
                        })
                        return (
                            <div key={v.id} style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: "9px 16px",
                                borderBottom: "0.5px solid var(--border)",
                                transition: "background .1s"
                            }}>
                                <div style={{
                                    background: "var(--surface2)", borderRadius: 7,
                                    padding: "5px 9px", textAlign: "center", flexShrink: 0
                                }}>
                                    <div style={{
                                        fontSize: 14, fontWeight: 500,
                                        fontFamily: "'DM Serif Display', serif",
                                        color: "var(--text)", lineHeight: 1
                                    }}>
                                        {hora}
                                    </div>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 13, fontWeight: 500, color: "var(--text)"
                                    }}>
                                        {cliente?.nombres_completos || cliente?.celular || "Cliente"}
                                    </div>
                                    <div style={{
                                        fontSize: 11, color: "var(--text3)", marginTop: 1,
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                    }}>
                                        {prop?.nombre || proy?.nombre || "Visita"}
                                    </div>
                                </div>
                                <span style={{
                                    display: "inline-flex", padding: "2px 8px",
                                    borderRadius: 20, fontSize: 10, fontWeight: 500,
                                    background: v.estado === "confirmada" ? "var(--sgb)" : "var(--sab)",
                                    color: v.estado === "confirmada" ? "var(--sg)" : "var(--sa)"
                                }}>
                                    {v.estado}
                                </span>
                            </div>
                        )
                    })}

                    {visitasHoy.length > 0 && (
                        <div style={{ padding: "8px 16px", textAlign: "center" }}>
                            <button
                                onClick={() => router.push("/dashboard/reservas")}
                                style={{
                                    fontSize: 12, color: "var(--accent)",
                                    background: "none", border: "none",
                                    cursor: "pointer", fontFamily: "inherit"
                                }}
                            >
                                Ver todas las reservas →
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Gráfico leads */}
            <div style={{
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                borderRadius: 10, overflow: "hidden"
            }}>
                <div style={{
                    padding: "12px 16px",
                    borderBottom: "0.5px solid var(--border)",
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between"
                }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                        Leads por día
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>
                        últimos 7 días
                    </span>
                </div>
                <div style={{
                    padding: "16px 20px",
                    display: "flex", alignItems: "flex-end",
                    gap: 8, height: 100
                }}>
                    {leadsPorDia.map((d, i) => {
                        const esHoy = i === leadsPorDia.length - 1
                        const altura = d.count === 0 ? 4 : Math.max((d.count / maxLeads) * 64, 8)
                        return (
                            <div key={d.dia} style={{
                                flex: 1, display: "flex",
                                flexDirection: "column", alignItems: "center", gap: 6
                            }}>
                                {d.count > 0 && (
                                    <div style={{
                                        fontSize: 10, color: esHoy ? "var(--accent)" : "var(--text3)",
                                        fontWeight: esHoy ? 500 : 400
                                    }}>
                                        {d.count}
                                    </div>
                                )}
                                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                                    <div style={{
                                        width: "100%",
                                        height: altura,
                                        background: esHoy ? "var(--accent)" : "var(--accent-light)",
                                        borderRadius: "3px 3px 0 0",
                                        transition: "height .3s ease"
                                    }} />
                                </div>
                                <span style={{
                                    fontSize: 10,
                                    color: esHoy ? "var(--accent)" : "var(--text3)",
                                    fontWeight: esHoy ? 500 : 400
                                }}>
                                    {d.label}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}