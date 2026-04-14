"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface Cliente {
    id: number
    nombres_completos: string
    celular: string
    ruc_ci: string | null
    verificado: boolean
    bloqueado: boolean
    primer_contacto: string
    ultimo_contacto: string
}

export default function ClientesClient({
    clientesIniciales
}: {
    clientesIniciales: Cliente[]
}) {
    const router = useRouter()
    const [editando, setEditando] = useState<Cliente | null>(null)
    const [nuevoNombre, setNuevoNombre] = useState("")
    const [clientes, setClientes] = useState(clientesIniciales)
    const [busqueda, setBusqueda] = useState("")
    const [filtro, setFiltro] = useState("todos")
    const [toast, setToast] = useState("")

    const mostrarToast = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(""), 2200)
    }

    const toggleBloqueo = async (cliente: Cliente) => {
        const nuevoEstado = !cliente.bloqueado
        if (!confirm(`¿${nuevoEstado ? "Bloquear" : "Desbloquear"} a ${cliente.nombres_completos}?`)) return

        const res = await fetch("/api/admin/clientes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cliente_id: cliente.id, bloqueado: nuevoEstado })
        })

        if (res.ok) {
            setClientes(prev =>
                prev.map(c => c.id === cliente.id ? { ...c, bloqueado: nuevoEstado } : c)
            )
            mostrarToast(nuevoEstado ? "Cliente bloqueado" : "Cliente desbloqueado")
        }
    }
    const editarNombre = async () => {
        if (!editando || !nuevoNombre.trim()) return

        const res = await fetch("/api/admin/clientes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                cliente_id: editando.id,
                nombres_completos: nuevoNombre.trim()
            })
        })

        if (res.ok) {
            setClientes(prev =>
                prev.map(c => c.id === editando.id
                    ? { ...c, nombres_completos: nuevoNombre.trim() }
                    : c
                )
            )
            setEditando(null)
            mostrarToast("Nombre actualizado ✓")
        }
    }
    const filtrados = clientes.filter(c => {
        if (filtro === "verificados" && !c.verificado) return false
        if (filtro === "sin_verificar" && c.verificado) return false
        if (filtro === "bloqueados" && !c.bloqueado) return false
        if (busqueda) {
            const q = busqueda.toLowerCase()
            if (!c.nombres_completos?.toLowerCase().includes(q) &&
                !c.celular?.includes(busqueda) &&
                !c.ruc_ci?.includes(busqueda)) return false
        }
        return true
    })

    const formatFecha = (fecha: string) =>
        new Date(fecha).toLocaleDateString("es-EC", {
            day: "numeric", month: "short", year: "numeric"
        })

    const tiempoRelativo = (fecha: string) => {
        const diff = Date.now() - new Date(fecha).getTime()
        const min = Math.floor(diff / 60000)
        if (min < 1) return "ahora"
        if (min < 60) return `${min}m`
        const h = Math.floor(min / 60)
        if (h < 24) return `${h}h`
        const d = Math.floor(h / 24)
        if (d < 30) return `${d}d`
        return formatFecha(fecha)
    }

    const iniciales = (nombre: string) =>
        (nombre || "CL").split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()

    const colores = [
        { bg: "var(--sab)", text: "var(--sa)" },
        { bg: "var(--sbb)", text: "var(--sb)" },
        { bg: "var(--sgb)", text: "var(--sg)" },
        { bg: "var(--spb)", text: "var(--sp)" },
    ]

    const filtros = [
        { id: "todos", label: "Todos" },
        { id: "verificados", label: "Verificados" },
        { id: "sin_verificar", label: "Sin verificar" },
        { id: "bloqueados", label: "Bloqueados" },
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
                    fontSize: 22, fontWeight: 500, color: "var(--text)",
                    fontFamily: "'DM Serif Display', serif"
                }}>
                    Clientes
                </div>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>
                    {filtrados.length} cliente(s)
                </span>
            </div>

            {/* Filtros */}
            <div style={{
                background: "var(--surface)", border: "0.5px solid var(--border)",
                borderRadius: 10, padding: "10px 14px",
                display: "flex", flexWrap: "wrap", gap: 8,
                alignItems: "center", marginBottom: 14
            }}>
                <input
                    type="text"
                    placeholder="Buscar por nombre, número o cédula..."
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    style={{
                        flex: 1, minWidth: 200, padding: "6px 10px",
                        borderRadius: 7, border: "0.5px solid var(--border2)",
                        background: "var(--surface2)", color: "var(--text)",
                        fontFamily: "inherit", fontSize: 12, outline: "none"
                    }}
                />
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {filtros.map(f => (
                        <button key={f.id} onClick={() => setFiltro(f.id)} style={{
                            padding: "4px 10px", borderRadius: 20, fontSize: 11,
                            fontWeight: 500, cursor: "pointer",
                            border: "0.5px solid var(--border2)",
                            background: filtro === f.id ? "var(--accent-light)" : "var(--surface2)",
                            color: filtro === f.id ? "var(--accent)" : "var(--text2)",
                            fontFamily: "inherit"
                        }}>
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
                {filtrados.length === 0 ? (
                    <div style={{
                        padding: 40, textAlign: "center",
                        fontSize: 13, color: "var(--text3)"
                    }}>
                        Sin clientes
                    </div>
                ) : filtrados.map((c, i) => {
                    const color = colores[c.id % colores.length]
                    return (
                        <div
                            key={c.id}
                            style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "12px 16px",
                                borderBottom: i < filtrados.length - 1
                                    ? "0.5px solid var(--border)" : "none",
                                opacity: c.bloqueado ? 0.5 : 1,
                                transition: "background .1s"
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
                                fontWeight: 500, flexShrink: 0
                            }}>
                                {iniciales(c.nombres_completos)}
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, overflow: "hidden" }}>
                                <div style={{
                                    display: "flex", alignItems: "center", gap: 6
                                }}>
                                    <div style={{
                                        fontSize: 13, fontWeight: 500, color: "var(--text)"
                                    }}>
                                        {c.nombres_completos || "Cliente WhatsApp"}
                                    </div>
                                    {c.verificado && (
                                        <span style={{
                                            fontSize: 10, color: "var(--sg)", fontWeight: 500
                                        }}>
                                            ✓ verificado
                                        </span>
                                    )}
                                    {c.bloqueado && (
                                        <span style={{
                                            fontSize: 10, color: "var(--sr)",
                                            background: "var(--srb)", padding: "1px 6px",
                                            borderRadius: 10, fontWeight: 500
                                        }}>
                                            bloqueado
                                        </span>
                                    )}
                                </div>
                                <div style={{
                                    fontSize: 11, color: "var(--text3)", marginTop: 2
                                }}>
                                    {c.celular}
                                    {c.ruc_ci && ` · CI: ${c.ruc_ci}`}
                                </div>
                            </div>

                            {/* Fechas */}
                            <div style={{
                                textAlign: "right", flexShrink: 0,
                                display: "flex", flexDirection: "column", gap: 2
                            }}>
                                <div style={{ fontSize: 10, color: "var(--text3)" }}>
                                    Último: {tiempoRelativo(c.ultimo_contacto)}
                                </div>
                                <div style={{ fontSize: 10, color: "var(--text3)" }}>
                                    Primer: {formatFecha(c.primer_contacto)}
                                </div>
                            </div>

                            {/* Acciones */}
             // En el div de acciones de cada cliente
                            <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                                {/* Botón editar nombre */}
                                <button
                                    onClick={() => {
                                        setEditando(c)
                                        setNuevoNombre(
                                            c.nombres_completos === "Cliente WhatsApp" ? "" : c.nombres_completos
                                        )
                                    }}
                                    title="Editar nombre / alias"
                                    style={{
                                        width: 28, height: 28, borderRadius: 6,
                                        border: "0.5px solid var(--border2)",
                                        background: "var(--surface2)", cursor: "pointer",
                                        display: "flex", alignItems: "center",
                                        justifyContent: "center", color: "var(--text2)",
                                        fontSize: 13
                                    }}
                                >
                                    ✎
                                </button>

                                {/* Ver conversación */}
                                <button
                                    onClick={() => router.push("/dashboard/conversaciones")}
                                    title="Ver conversación"
                                    style={{
                                        width: 28, height: 28, borderRadius: 6,
                                        border: "0.5px solid var(--border2)",
                                        background: "var(--surface2)", cursor: "pointer",
                                        display: "flex", alignItems: "center",
                                        justifyContent: "center", color: "var(--text2)"
                                    }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path d="M14 10.5c0 .8-.7 1.5-1.5 1.5H4l-2.5 2.5V3.5C1.5 2.7 2.2 2 3 2h10c.8 0 1.5.7 1.5 1.5v7z" />
                                    </svg>
                                </button>

                                {/* Bloquear */}
                                <button
                                    onClick={() => toggleBloqueo(c)}
                                    title={c.bloqueado ? "Desbloquear" : "Bloquear"}
                                    style={{
                                        width: 28, height: 28, borderRadius: 6,
                                        border: "0.5px solid var(--border2)",
                                        background: c.bloqueado ? "var(--srb)" : "var(--surface2)",
                                        cursor: "pointer",
                                        display: "flex", alignItems: "center",
                                        justifyContent: "center",
                                        color: c.bloqueado ? "var(--sr)" : "var(--text2)"
                                    }}
                                >
                                    {c.bloqueado ? "🔓" : "🚫"}
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
            {/* Modal editar nombre */}
            {editando && (
                <div
                    style={{
                        position: "fixed", inset: 0,
                        background: "rgba(0,0,0,0.4)",
                        zIndex: 60, display: "flex",
                        alignItems: "center", justifyContent: "center",
                        padding: 20
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setEditando(null) }}
                >
                    <div style={{
                        background: "var(--surface)",
                        borderRadius: 12, padding: 24,
                        width: "100%", maxWidth: 380
                    }}>
                        <div style={{
                            fontSize: 15, fontWeight: 500,
                            color: "var(--text)", marginBottom: 4
                        }}>
                            Editar nombre
                        </div>
                        <div style={{
                            fontSize: 12, color: "var(--text3)", marginBottom: 16
                        }}>
                            {editando.celular}
                            {editando.ruc_ci && ` · CI: ${editando.ruc_ci}`}
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{
                                display: "block", fontSize: 10, fontWeight: 500,
                                color: "var(--text3)", textTransform: "uppercase",
                                letterSpacing: ".06em", marginBottom: 6
                            }}>
                                Nombre o alias
                            </label>
                            <input
                                type="text"
                                value={nuevoNombre}
                                onChange={e => setNuevoNombre(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") editarNombre() }}
                                placeholder={editando.celular}
                                autoFocus
                                style={{
                                    width: "100%", padding: "9px 12px",
                                    borderRadius: 8, border: "0.5px solid var(--border2)",
                                    background: "var(--surface2)", color: "var(--text)",
                                    fontFamily: "inherit", fontSize: 13, outline: "none"
                                }}
                            />
                            <div style={{
                                fontSize: 11, color: "var(--text3)", marginTop: 5
                            }}>
                                Si el cliente tiene cédula verificada, este campo
                                sobreescribe el nombre del Registro Civil.
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                onClick={() => setEditando(null)}
                                style={{
                                    flex: 1, padding: "8px 0", borderRadius: 7,
                                    border: "0.5px solid var(--border2)",
                                    background: "var(--surface2)", cursor: "pointer",
                                    fontSize: 13, color: "var(--text)", fontFamily: "inherit"
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={editarNombre}
                                style={{
                                    flex: 1, padding: "8px 0", borderRadius: 7,
                                    background: "var(--accent)", color: "#fff",
                                    border: "none", cursor: "pointer",
                                    fontSize: 13, fontWeight: 500, fontFamily: "inherit"
                                }}
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
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