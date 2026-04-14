"use client"

import { useState } from "react"

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DOWS_LABEL = ["L","M","Mi","J","V","S","D"]
const DOWS_FULL = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"]

interface Horario {
    id: number
    fecha: string
    hora_inicio: string
    hora_fin: string
    disponible: boolean
    propiedad?: { id: number; nombre: string }
    proyecto?: { id: number; nombre: string }
}

export default function HorariosClient({
    horariosIniciales, propiedades, proyectos
}: {
    horariosIniciales: Horario[]
    propiedades: any[]
    proyectos: any[]
}) {
    const hoy = new Date()
    const [horarios, setHorarios] = useState(horariosIniciales)
    const [calY, setCalY] = useState(hoy.getFullYear())
    const [calM, setCalM] = useState(hoy.getMonth() + 1)
    const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [toast, setToast] = useState("")
    const [form, setForm] = useState({
        hora_inicio: "09:00",
        hora_fin: "10:00",
        tipo: "propiedad" as "propiedad" | "proyecto",
        ref_id: "",
        busqueda: ""
    })

    const mostrarToast = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(""), 2000)
    }

    const dayKey = (y: number, m: number, d: number) =>
        `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`

    const horariosPorDia = (fecha: string) =>
        horarios.filter(h => h.fecha === fecha)

    const cambiarMes = (dir: number) => {
        let m = calM + dir
        let y = calY
        if (m > 12) { m = 1; y++ }
        if (m < 1) { m = 12; y-- }
        setCalM(m)
        setCalY(y)
        setDiaSeleccionado(null)
        setShowForm(false)
    }

    const guardarSlot = async () => {
        if (!diaSeleccionado) return
        if (!form.ref_id) { mostrarToast("Selecciona una propiedad o proyecto"); return }
        if (form.hora_inicio >= form.hora_fin) { mostrarToast("La hora fin debe ser mayor"); return }

        setGuardando(true)
        try {
            const body: any = {
                fecha: diaSeleccionado,
                hora_inicio: form.hora_inicio,
                hora_fin: form.hora_fin,
            }
            if (form.tipo === "propiedad") body.propiedad_id = parseInt(form.ref_id)
            else body.proyecto_id = parseInt(form.ref_id)

            const res = await fetch("/api/admin/horarios", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })

            if (!res.ok) { mostrarToast("Error al guardar"); return }
            const data = await res.json()

            const ref = form.tipo === "propiedad"
                ? propiedades.find(p => p.id === parseInt(form.ref_id))
                : proyectos.find(p => p.id === parseInt(form.ref_id))

            setHorarios(prev => [...prev, {
                ...data.horario,
                [form.tipo]: { id: parseInt(form.ref_id), nombre: ref?.nombre || "" }
            }].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio)))

            setForm(f => ({ ...f, ref_id: "", busqueda: "", hora_inicio: "09:00", hora_fin: "10:00" }))
            setShowForm(false)
            mostrarToast("Slot agregado ✓")
        } finally {
            setGuardando(false)
        }
    }

    const eliminarSlot = async (id: number) => {
        await fetch("/api/admin/horarios", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
        })
        setHorarios(prev => prev.filter(h => h.id !== id))
        mostrarToast("Slot eliminado")
    }

    // Construir calendario
    const primerDia = new Date(calY, calM - 1, 1).getDay()
    const offset = primerDia === 0 ? 6 : primerDia - 1
    const diasEnMes = new Date(calY, calM, 0).getDate()
    const todayKey = dayKey(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate())

    const diasSelSlots = diaSeleccionado ? horariosPorDia(diaSeleccionado) : []

    const itemsFiltrados = [
        ...propiedades.filter(p => !form.busqueda || p.nombre.toLowerCase().includes(form.busqueda.toLowerCase())).map(p => ({ ...p, _tipo: "propiedad" })),
        ...proyectos.filter(p => !form.busqueda || p.nombre.toLowerCase().includes(form.busqueda.toLowerCase())).map(p => ({ ...p, _tipo: "proyecto" }))
    ]

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <div style={{
                    fontSize: 22, fontWeight: 500, color: "var(--text)",
                    fontFamily: "'DM Serif Display', serif"
                }}>
                    Horarios disponibles
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                    Clic en un día para ver o agregar slots de visita
                </div>
            </div>

            <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 300px",
                gap: 14, alignItems: "start"
            }}>
                {/* Calendario */}
                <div style={{
                    background: "var(--surface)",
                    border: "0.5px solid var(--border)",
                    borderRadius: 10, overflow: "hidden"
                }}>
                    {/* Header mes */}
                    <div style={{
                        padding: "12px 16px",
                        borderBottom: "0.5px solid var(--border)",
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between"
                    }}>
                        <div style={{
                            fontSize: 16, fontWeight: 500, color: "var(--text)",
                            fontFamily: "'DM Serif Display', serif"
                        }}>
                            {MESES[calM - 1]} {calY}
                        </div>
                        <div style={{ display: "flex", gap: 5 }}>
                            {["‹", "›"].map((a, i) => (
                                <button key={a} onClick={() => cambiarMes(i === 0 ? -1 : 1)}
                                    style={{
                                        width: 28, height: 28, borderRadius: 6,
                                        border: "0.5px solid var(--border2)",
                                        background: "var(--surface2)", cursor: "pointer",
                                        fontSize: 16, color: "var(--text2)", display: "flex",
                                        alignItems: "center", justifyContent: "center"
                                    }}>
                                    {a}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Días semana */}
                    <div style={{
                        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
                        padding: "8px 12px 2px", gap: 2
                    }}>
                        {DOWS_LABEL.map(d => (
                            <div key={d} style={{
                                fontSize: 10, fontWeight: 500, color: "var(--text3)",
                                textAlign: "center", textTransform: "uppercase",
                                letterSpacing: ".06em"
                            }}>
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Grid días */}
                    <div style={{
                        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
                        padding: "4px 12px 12px", gap: 3
                    }}>
                        {/* Offsets */}
                        {Array.from({ length: offset }).map((_, i) => (
                            <div key={`off-${i}`} />
                        ))}

                        {/* Días */}
                        {Array.from({ length: diasEnMes }, (_, i) => i + 1).map(d => {
                            const key = dayKey(calY, calM, d)
                            const slots = horariosPorDia(key)
                            const tieneSlots = slots.length > 0
                            const tieneReservados = slots.some(s => !s.disponible)
                            const esHoy = key === todayKey
                            const esSel = key === diaSeleccionado
                            const esPasado = key < todayKey

                            return (
                                <div
                                    key={d}
                                    onClick={() => {
                                        if (esPasado) return
                                        setDiaSeleccionado(key)
                                        setShowForm(false)
                                    }}
                                    style={{
                                        borderRadius: 7, minHeight: 44,
                                        display: "flex", flexDirection: "column",
                                        alignItems: "center", justifyContent: "center",
                                        cursor: esPasado ? "default" : "pointer",
                                        padding: "3px 2px",
                                        border: esHoy
                                            ? "0.5px solid var(--accent)"
                                            : "0.5px solid transparent",
                                        background: esSel
                                            ? "var(--accent)"
                                            : tieneSlots
                                                ? "var(--accent-light)"
                                                : "transparent",
                                        opacity: esPasado ? 0.3 : 1,
                                        transition: "all .12s",
                                        color: esSel ? "#fff" : esHoy ? "var(--accent)" : "var(--text2)",
                                        fontWeight: esHoy ? 500 : 400,
                                    }}
                                >
                                    <div style={{ fontSize: 12, lineHeight: 1 }}>{d}</div>
                                    {tieneSlots && (
                                        <div style={{ display: "flex", gap: 2, marginTop: 3 }}>
                                            {slots.slice(0, 4).map((s, si) => (
                                                <div key={si} style={{
                                                    width: 4, height: 4, borderRadius: "50%",
                                                    background: esSel
                                                        ? "rgba(255,255,255,.7)"
                                                        : !s.disponible
                                                            ? "var(--sa)"
                                                            : "var(--accent)"
                                                }} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* Leyenda */}
                    <div style={{
                        display: "flex", gap: 12, flexWrap: "wrap",
                        padding: "10px 16px",
                        borderTop: "0.5px solid var(--border)"
                    }}>
                        {[
                            { color: "var(--accent-light)", border: "var(--accent)", label: "Con slots" },
                            { color: "var(--accent)", border: "var(--accent)", label: "Seleccionado" },
                            { color: "transparent", border: "var(--accent)", label: "Hoy" },
                            { color: "var(--sab)", border: "var(--sa)", label: "Reservado" },
                        ].map(l => (
                            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <div style={{
                                    width: 8, height: 8, borderRadius: "50%",
                                    background: l.color, border: `1px solid ${l.border}`
                                }} />
                                <span style={{ fontSize: 10, color: "var(--text3)" }}>{l.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Panel lateral */}
                <div style={{
                    background: "var(--surface)",
                    border: "0.5px solid var(--border)",
                    borderRadius: 10, overflow: "hidden",
                    position: "sticky", top: 0
                }}>
                    <div style={{
                        padding: "12px 14px",
                        borderBottom: "0.5px solid var(--border)",
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between", gap: 8
                    }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                                {diaSeleccionado
                                    ? (() => {
                                        const d = new Date(diaSeleccionado + "T00:00:00")
                                        return `${d.getDate()} de ${MESES[d.getMonth()]}`
                                    })()
                                    : "Selecciona un día"
                                }
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text3)" }}>
                                {diaSeleccionado
                                    ? `${DOWS_FULL[new Date(diaSeleccionado + "T00:00:00").getDay() === 0 ? 6 : new Date(diaSeleccionado + "T00:00:00").getDay() - 1]} · ${diasSelSlots.length} slot(s)`
                                    : "Haz clic en el calendario"
                                }
                            </div>
                        </div>
                        {diaSeleccionado && (
                            <button
                                onClick={() => setShowForm(f => !f)}
                                style={{
                                    padding: "4px 10px", borderRadius: 6,
                                    background: showForm ? "var(--surface2)" : "var(--accent)",
                                    color: showForm ? "var(--text2)" : "#fff",
                                    border: "0.5px solid var(--border2)",
                                    cursor: "pointer", fontSize: 11,
                                    fontWeight: 500, fontFamily: "inherit"
                                }}
                            >
                                {showForm ? "✕ Cerrar" : "+ Agregar"}
                            </button>
                        )}
                    </div>

                    {/* Slots del día */}
                    {!diaSeleccionado ? (
                        <div style={{
                            padding: 24, textAlign: "center",
                            fontSize: 12, color: "var(--text3)"
                        }}>
                            Selecciona un día del calendario para ver los horarios
                        </div>
                    ) : diasSelSlots.length === 0 && !showForm ? (
                        <div style={{ padding: 24, textAlign: "center" }}>
                            <div style={{ fontSize: 24, marginBottom: 6 }}>🕐</div>
                            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 10 }}>
                                Sin slots para este día
                            </div>
                            <button
                                onClick={() => setShowForm(true)}
                                style={{
                                    fontSize: 12, color: "var(--accent)",
                                    background: "none", border: "none",
                                    cursor: "pointer", fontFamily: "inherit",
                                    fontWeight: 500
                                }}
                            >
                                + Agregar primer slot
                            </button>
                        </div>
                    ) : (
                        <div>
                            {diasSelSlots.map(h => {
                                const nombre = h.propiedad?.nombre || h.proyecto?.nombre || ""
                                return (
                                    <div key={h.id} style={{
                                        display: "flex", alignItems: "center", gap: 9,
                                        padding: "9px 14px",
                                        borderBottom: "0.5px solid var(--border)",
                                        transition: "background .1s"
                                    }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                    >
                                        <div style={{
                                            background: "var(--surface2)", borderRadius: 6,
                                            padding: "5px 8px", textAlign: "center", flexShrink: 0
                                        }}>
                                            <div style={{
                                                fontSize: 12, fontWeight: 500, color: "var(--text)",
                                                lineHeight: 1, fontFamily: "'DM Serif Display', serif"
                                            }}>
                                                {h.hora_inicio}
                                            </div>
                                            <div style={{ fontSize: 9, color: "var(--text3)" }}>
                                                {h.hora_fin}
                                            </div>
                                        </div>
                                        <div style={{ flex: 1, overflow: "hidden" }}>
                                            <div style={{
                                                fontSize: 12, fontWeight: 500, color: "var(--text)",
                                                whiteSpace: "nowrap", overflow: "hidden",
                                                textOverflow: "ellipsis"
                                            }}>
                                                {nombre}
                                            </div>
                                            <div style={{ fontSize: 10, color: "var(--sb)" }}>
                                                {h.propiedad ? "propiedad" : "proyecto"}
                                            </div>
                                        </div>
                                        <span style={{
                                            padding: "2px 7px", borderRadius: 20,
                                            fontSize: 9, fontWeight: 500,
                                            background: h.disponible ? "var(--sgb)" : "var(--sab)",
                                            color: h.disponible ? "var(--sg)" : "var(--sa)"
                                        }}>
                                            {h.disponible ? "libre" : "reservado"}
                                        </span>
                                        {h.disponible && (
                                            <button
                                                onClick={() => eliminarSlot(h.id)}
                                                style={{
                                                    width: 22, height: 22, borderRadius: 5,
                                                    border: "0.5px solid var(--border2)",
                                                    background: "var(--surface2)", cursor: "pointer",
                                                    display: "flex", alignItems: "center",
                                                    justifyContent: "center", fontSize: 10,
                                                    color: "var(--text2)", flexShrink: 0
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
                                )
                            })}
                        </div>
                    )}

                    {/* Formulario agregar slot */}
                    {showForm && diaSeleccionado && (
                        <div style={{
                            padding: "12px 14px",
                            borderTop: "0.5px solid var(--border)"
                        }}>
                            <div style={{
                                fontSize: 11, fontWeight: 500, color: "var(--text)",
                                marginBottom: 10
                            }}>
                                Nuevo slot de visita
                            </div>

                            {/* Buscar propiedad/proyecto */}
                            <div style={{ marginBottom: 8 }}>
                                <div style={{
                                    fontSize: 10, color: "var(--text3)",
                                    textTransform: "uppercase", letterSpacing: ".05em",
                                    marginBottom: 4, fontWeight: 500
                                }}>
                                    Propiedad o proyecto
                                </div>
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    value={form.busqueda}
                                    onChange={e => setForm(f => ({ ...f, busqueda: e.target.value, ref_id: "" }))}
                                    style={{
                                        width: "100%", padding: "6px 9px",
                                        borderRadius: 6, border: "0.5px solid var(--border2)",
                                        background: "var(--surface2)", color: "var(--text)",
                                        fontFamily: "inherit", fontSize: 12, outline: "none",
                                        marginBottom: 4
                                    }}
                                />
                                <div style={{
                                    maxHeight: 120, overflowY: "auto",
                                    border: form.busqueda ? "0.5px solid var(--border)" : "none",
                                    borderRadius: 6
                                }}>
                                    {itemsFiltrados.slice(0, 6).map(item => (
                                        <div
                                            key={`${item._tipo}-${item.id}`}
                                            onClick={() => setForm(f => ({
                                                ...f,
                                                ref_id: String(item.id),
                                                tipo: item._tipo as "propiedad" | "proyecto",
                                                busqueda: item.nombre
                                            }))}
                                            style={{
                                                padding: "6px 9px", cursor: "pointer",
                                                fontSize: 12, color: "var(--text)",
                                                background: form.ref_id === String(item.id)
                                                    ? "var(--accent-light)" : "transparent",
                                                borderBottom: "0.5px solid var(--border)",
                                                display: "flex", alignItems: "center", gap: 6
                                            }}
                                        >
                                            <span>{item._tipo === "proyecto" ? "🏗️" : "🏠"}</span>
                                            <div style={{ overflow: "hidden" }}>
                                                <div style={{
                                                    whiteSpace: "nowrap", overflow: "hidden",
                                                    textOverflow: "ellipsis", fontSize: 12
                                                }}>
                                                    {item.nombre}
                                                </div>
                                                <div style={{ fontSize: 10, color: "var(--text3)" }}>
                                                    {(item.ciudad as any)?.nombre || ""}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Horas */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                                <div>
                                    <div style={{
                                        fontSize: 10, color: "var(--text3)",
                                        textTransform: "uppercase", letterSpacing: ".05em",
                                        marginBottom: 4, fontWeight: 500
                                    }}>
                                        Hora inicio
                                    </div>
                                    <input
                                        type="time"
                                        value={form.hora_inicio}
                                        onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))}
                                        style={{
                                            width: "100%", padding: "6px 9px",
                                            borderRadius: 6, border: "0.5px solid var(--border2)",
                                            background: "var(--surface2)", color: "var(--text)",
                                            fontFamily: "inherit", fontSize: 12, outline: "none"
                                        }}
                                    />
                                </div>
                                <div>
                                    <div style={{
                                        fontSize: 10, color: "var(--text3)",
                                        textTransform: "uppercase", letterSpacing: ".05em",
                                        marginBottom: 4, fontWeight: 500
                                    }}>
                                        Hora fin
                                    </div>
                                    <input
                                        type="time"
                                        value={form.hora_fin}
                                        onChange={e => setForm(f => ({ ...f, hora_fin: e.target.value }))}
                                        style={{
                                            width: "100%", padding: "6px 9px",
                                            borderRadius: 6, border: "0.5px solid var(--border2)",
                                            background: "var(--surface2)", color: "var(--text)",
                                            fontFamily: "inherit", fontSize: 12, outline: "none"
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Acciones */}
                            <div style={{ display: "flex", gap: 7 }}>
                                <button
                                    onClick={() => setShowForm(false)}
                                    style={{
                                        flex: 1, padding: "7px 0",
                                        borderRadius: 7, border: "0.5px solid var(--border2)",
                                        background: "var(--surface2)", cursor: "pointer",
                                        fontSize: 12, color: "var(--text)", fontFamily: "inherit"
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={guardarSlot}
                                    disabled={guardando}
                                    style={{
                                        flex: 1, padding: "7px 0",
                                        borderRadius: 7, background: "var(--accent)",
                                        color: "#fff", border: "none", cursor: "pointer",
                                        fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                                        opacity: guardando ? 0.6 : 1
                                    }}
                                >
                                    {guardando ? "..." : "Guardar slot"}
                                </button>
                            </div>
                        </div>
                    )}
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