"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const ESTADOS = ["activo", "en_construccion", "entregado", "inactivo"]
const FORMAS_PAGO = ["contado", "financiamiento", "biess"]
const AMENIDADES_LISTA = [
    "piscina", "gimnasio", "bbq", "seguridad_24h",
    "parqueadero_visitas", "areas_verdes", "salon_comunal",
    "juegos_infantiles", "ascensor", "generador", "cisterna"
]

interface Props {
    proyectosIniciales: any[]
    ciudades: any[]
    sectores: any[]
    tenantId: number
}

export default function ProyectosClient({
    proyectosIniciales, ciudades, sectores, tenantId
}: Props) {
    const router = useRouter()
    const [proyectos, setProyectos] = useState(proyectosIniciales)
    const [modal, setModal] = useState<null | "nuevo" | "editar">(null)
    const [proyActual, setProyActual] = useState<any>(null)
    const [guardando, setGuardando] = useState(false)
    const [toast, setToast] = useState("")
    const [ciudadSeleccionada, setCiudadSeleccionada] = useState<number | null>(null)
    const [busqueda, setBusqueda] = useState("")

    const [form, setForm] = useState<any>({
        nombre: "", descripcion: "", slogan: "",
        precio_desde: "", precio_hasta: "",
        tipo_pago: ["contado", "financiamiento"],
        estado: "activo",
        fecha_entrega_estimada: "",
        amenidades: [],
        sitio_web: "", fotos: [],
        ciudad_id: "", sector_id: "",
    })

    const mostrarToast = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(""), 2200)
    }

    const abrirNuevo = () => {
        setForm({
            nombre: "", descripcion: "", slogan: "",
            precio_desde: "", precio_hasta: "",
            tipo_pago: ["contado", "financiamiento"],
            estado: "activo", fecha_entrega_estimada: "",
            amenidades: [], sitio_web: "", fotos: [],
            ciudad_id: "", sector_id: "",
        })
        setCiudadSeleccionada(null)
        setProyActual(null)
        setModal("nuevo")
    }

    const abrirEditar = (p: any) => {
        setForm({
            nombre: p.nombre || "",
            descripcion: p.descripcion || "",
            slogan: p.slogan || "",
            precio_desde: p.precio_desde || "",
            precio_hasta: p.precio_hasta || "",
            tipo_pago: p.tipo_pago || ["contado"],
            estado: p.estado || "activo",
            fecha_entrega_estimada: p.fecha_entrega_estimada
                ? p.fecha_entrega_estimada.split("T")[0] : "",
            amenidades: Array.isArray(p.amenidades) ? p.amenidades : [],
            sitio_web: p.sitio_web || "",
            fotos: p.fotos || [],
            ciudad_id: (p.ciudad as any)?.id || "",
            sector_id: (p.sector as any)?.id || "",
        })
        setCiudadSeleccionada((p.ciudad as any)?.id || null)
        setProyActual(p)
        setModal("editar")
    }

    const guardar = async () => {
        if (!form.nombre.trim()) { mostrarToast("El nombre es requerido"); return }
        if (!form.ciudad_id) { mostrarToast("La ciudad es requerida"); return }
        if (!form.precio_desde) { mostrarToast("El precio desde es requerido"); return }

        setGuardando(true)
        try {
            const body = {
                nombre: form.nombre,
                descripcion: form.descripcion,
                slogan: form.slogan,
                precio_desde: parseFloat(form.precio_desde),
                precio_hasta: form.precio_hasta ? parseFloat(form.precio_hasta) : null,
                tipo_pago: form.tipo_pago,
                estado: form.estado,
                fecha_entrega_estimada: form.fecha_entrega_estimada || null,
                amenidades: form.amenidades,
                sitio_web: form.sitio_web,
                fotos: form.fotos,
                ciudad_id: parseInt(form.ciudad_id),
                sector_id: form.sector_id ? parseInt(form.sector_id) : null,
            }

            const url = modal === "editar"
                ? `/api/admin/proyectos/${proyActual.id}`
                : "/api/admin/proyectos"

            const res = await fetch(url, {
                method: modal === "editar" ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })

            if (!res.ok) {
                const err = await res.json()
                mostrarToast(err.error || "Error al guardar")
                return
            }

            const data = await res.json()
            const ciudad = ciudades.find(c => c.id === parseInt(form.ciudad_id))

            if (modal === "editar") {
                setProyectos(prev => prev.map(p =>
                    p.id === proyActual.id
                        ? { ...p, ...body, ciudad, total_unidades: p.total_unidades }
                        : p
                ))
                mostrarToast("Proyecto actualizado ✓")
            } else {
                setProyectos(prev => [{
                    ...data.proyecto, ciudad,
                    total_unidades: 0, slug: null
                }, ...prev])
                mostrarToast("Proyecto creado ✓")
            }

            setModal(null)
        } finally {
            setGuardando(false)
        }
    }

    const eliminar = async (id: number) => {
        if (!confirm("¿Eliminar este proyecto? También se eliminarán sus unidades.")) return
        await fetch(`/api/admin/proyectos/${id}`, { method: "DELETE" })
        setProyectos(prev => prev.filter(p => p.id !== id))
        mostrarToast("Proyecto eliminado")
    }

    const togglePago = (forma: string) => {
        setForm((prev: any) => ({
            ...prev,
            tipo_pago: prev.tipo_pago.includes(forma)
                ? prev.tipo_pago.filter((f: string) => f !== forma)
                : [...prev.tipo_pago, forma]
        }))
    }

    const toggleAmenidad = (a: string) => {
        setForm((prev: any) => ({
            ...prev,
            amenidades: prev.amenidades.includes(a)
                ? prev.amenidades.filter((x: string) => x !== a)
                : [...prev.amenidades, a]
        }))
    }

    const sectorsFiltrados = ciudadSeleccionada
        ? sectores.filter(s => s.ciudad_id === ciudadSeleccionada)
        : []

    const filtrados = proyectos.filter(p =>
        !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    )

    const badgeEstado = (estado: string) => ({
        activo: { bg: "var(--sgb)", text: "var(--sg)", label: "Activo" },
        en_construccion: { bg: "var(--sab)", text: "var(--sa)", label: "En construcción" },
        entregado: { bg: "var(--sbb)", text: "var(--sb)", label: "Entregado" },
        inactivo: { bg: "var(--sgrb)", text: "var(--sgr)", label: "Inactivo" },
    }[estado] || { bg: "var(--sgrb)", text: "var(--sgr)", label: estado })

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
                    Proyectos
                </div>
                <button
                    onClick={abrirNuevo}
                    style={{
                        padding: "7px 14px", borderRadius: 7,
                        background: "var(--accent)", color: "#fff",
                        border: "none", cursor: "pointer",
                        fontSize: 13, fontWeight: 500, fontFamily: "inherit"
                    }}
                >
                    + Nuevo proyecto
                </button>
            </div>

            {/* Búsqueda */}
            <div style={{
                background: "var(--surface)", border: "0.5px solid var(--border)",
                borderRadius: 10, padding: "10px 14px",
                marginBottom: 14
            }}>
                <input
                    type="text"
                    placeholder="Buscar proyecto..."
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    style={{
                        width: "100%", padding: "6px 10px",
                        borderRadius: 7, border: "0.5px solid var(--border2)",
                        background: "var(--surface2)", color: "var(--text)",
                        fontFamily: "inherit", fontSize: 12, outline: "none"
                    }}
                />
            </div>

            {/* Lista proyectos */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filtrados.length === 0 ? (
                    <div style={{
                        background: "var(--surface)",
                        border: "0.5px solid var(--border)",
                        borderRadius: 10, padding: 40,
                        textAlign: "center", fontSize: 13, color: "var(--text3)"
                    }}>
                        Sin proyectos
                    </div>
                ) : filtrados.map(p => {
                    const badge = badgeEstado(p.estado)
                    const ciudad = (p.ciudad as any)?.nombre || ""
                    const sector = (p.sector as any)?.nombre || ""
                    const amenidades = Array.isArray(p.amenidades) ? p.amenidades : []
                    const pago = Array.isArray(p.tipo_pago) ? p.tipo_pago : []

                    return (
                        <div key={p.id} style={{
                            background: "var(--surface)",
                            border: "0.5px solid var(--border)",
                            borderRadius: 10, overflow: "hidden"
                        }}>
                            {/* Header del proyecto */}
                            <div style={{
                                padding: "14px 18px",
                                borderBottom: "0.5px solid var(--border)",
                                display: "flex", alignItems: "flex-start",
                                justifyContent: "space-between", gap: 12
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        display: "flex", alignItems: "center",
                                        gap: 8, flexWrap: "wrap", marginBottom: 4
                                    }}>
                                        <div style={{
                                            fontSize: 15, fontWeight: 500, color: "var(--text)"
                                        }}>
                                            {p.nombre}
                                        </div>
                                        <span style={{
                                            padding: "2px 8px", borderRadius: 20,
                                            fontSize: 10, fontWeight: 500,
                                            background: badge.bg, color: badge.text
                                        }}>
                                            {badge.label}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 12, color: "var(--text3)" }}>
                                        {[ciudad, sector].filter(Boolean).join(" · ")}
                                        {p.fecha_entrega_estimada && ` · Entrega: ${new Date(p.fecha_entrega_estimada).toLocaleDateString("es-EC", { month: "short", year: "numeric" })}`}
                                    </div>
                                    {p.slogan && (
                                        <div style={{
                                            fontSize: 11, color: "var(--accent)",
                                            fontStyle: "italic", marginTop: 3
                                        }}>
                                            "{p.slogan}"
                                        </div>
                                    )}
                                </div>

                                {/* Acciones */}
                                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                                    <button
                                        onClick={() => abrirEditar(p)}
                                        style={{
                                            width: 28, height: 28, borderRadius: 6,
                                            border: "0.5px solid var(--border2)",
                                            background: "var(--surface2)", cursor: "pointer",
                                            display: "flex", alignItems: "center",
                                            justifyContent: "center", fontSize: 12,
                                            color: "var(--text2)"
                                        }}
                                    >
                                        ✎
                                    </button>
                                    <button
                                        onClick={() => eliminar(p.id)}
                                        style={{
                                            width: 28, height: 28, borderRadius: 6,
                                            border: "0.5px solid var(--border2)",
                                            background: "var(--surface2)", cursor: "pointer",
                                            display: "flex", alignItems: "center",
                                            justifyContent: "center", fontSize: 12,
                                            color: "var(--text2)"
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
                                </div>
                            </div>

                            {/* Stats del proyecto */}
                            <div style={{
                                padding: "12px 18px",
                                display: "flex", flexWrap: "wrap", gap: 20
                            }}>
                                <div>
                                    <div style={{
                                        fontSize: 10, color: "var(--text3)",
                                        textTransform: "uppercase",
                                        letterSpacing: ".06em", fontWeight: 500
                                    }}>
                                        Precio desde
                                    </div>
                                    <div style={{
                                        fontSize: 16, fontWeight: 500,
                                        color: "var(--accent)",
                                        fontFamily: "'DM Serif Display', serif",
                                        marginTop: 2
                                    }}>
                                        ${Number(p.precio_desde || 0).toLocaleString("es-EC")}
                                    </div>
                                </div>

                                {p.precio_hasta && (
                                    <div>
                                        <div style={{
                                            fontSize: 10, color: "var(--text3)",
                                            textTransform: "uppercase",
                                            letterSpacing: ".06em", fontWeight: 500
                                        }}>
                                            Hasta
                                        </div>
                                        <div style={{
                                            fontSize: 16, fontWeight: 500,
                                            color: "var(--accent)",
                                            fontFamily: "'DM Serif Display', serif",
                                            marginTop: 2
                                        }}>
                                            ${Number(p.precio_hasta).toLocaleString("es-EC")}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <div style={{
                                        fontSize: 10, color: "var(--text3)",
                                        textTransform: "uppercase",
                                        letterSpacing: ".06em", fontWeight: 500
                                    }}>
                                        Unidades
                                    </div>
                                    <div style={{
                                        fontSize: 16, fontWeight: 500, color: "var(--text)",
                                        fontFamily: "'DM Serif Display', serif", marginTop: 2
                                    }}>
                                        {p.total_unidades}
                                    </div>
                                </div>

                                <div>
                                    <div style={{
                                        fontSize: 10, color: "var(--text3)",
                                        textTransform: "uppercase",
                                        letterSpacing: ".06em", fontWeight: 500
                                    }}>
                                        Consultas bot
                                    </div>
                                    <div style={{
                                        fontSize: 16, fontWeight: 500, color: "var(--text)",
                                        fontFamily: "'DM Serif Display', serif", marginTop: 2
                                    }}>
                                        {p.total_consultas || 0}
                                    </div>
                                </div>

                                {p.slug && (
                                    <div>
                                        <div style={{
                                            fontSize: 10, color: "var(--text3)",
                                            textTransform: "uppercase",
                                            letterSpacing: ".06em", fontWeight: 500
                                        }}>
                                            Link bot
                                        </div>
                                        <div style={{
                                            fontSize: 12, color: "var(--sb)", marginTop: 2,
                                            fontFamily: "monospace"
                                        }}>
                                            {p.slug}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Amenidades */}
                            {amenidades.length > 0 && (
                                <div style={{
                                    padding: "0 18px 12px",
                                    display: "flex", flexWrap: "wrap", gap: 5
                                }}>
                                    {amenidades.map((a: string) => (
                                        <span key={a} style={{
                                            padding: "2px 8px", borderRadius: 20,
                                            fontSize: 10, fontWeight: 500,
                                            background: "var(--surface2)",
                                            color: "var(--text3)",
                                            border: "0.5px solid var(--border)"
                                        }}>
                                            {a.replace(/_/g, " ")}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Footer con formas de pago y botón de unidades */}
                            <div style={{
                                padding: "10px 18px",
                                borderTop: "0.5px solid var(--border)",
                                display: "flex", alignItems: "center",
                                justifyContent: "space-between", flexWrap: "wrap", gap: 8
                            }}>
                                <div style={{ display: "flex", gap: 5 }}>
                                    {pago.map((f: string) => (
                                        <span key={f} style={{
                                            padding: "2px 7px", borderRadius: 20,
                                            fontSize: 10, background: "var(--sbb)",
                                            color: "var(--sb)", fontWeight: 500
                                        }}>
                                            {f}
                                        </span>
                                    ))}
                                </div>
                                <button
                                    onClick={() => router.push(`/dashboard/propiedades?proyecto_id=${p.id}`)}
                                    style={{
                                        padding: "5px 12px", borderRadius: 7,
                                        border: "0.5px solid var(--border2)",
                                        background: "var(--surface2)", cursor: "pointer",
                                        fontSize: 12, color: "var(--text2)",
                                        fontFamily: "inherit"
                                    }}
                                >
                                    Ver {p.total_unidades} unidad(es) →
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* MODAL */}
            {modal && (
                <div
                    style={{
                        position: "fixed", inset: 0,
                        background: "rgba(0,0,0,0.5)",
                        zIndex: 60, display: "flex",
                        alignItems: "flex-end", justifyContent: "center"
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
                >
                    <div style={{
                        background: "var(--surface)",
                        borderRadius: "14px 14px 0 0",
                        width: "100%", maxWidth: 600,
                        maxHeight: "90vh", overflowY: "auto",
                        padding: 24
                    }}>
                        {/* Modal header */}
                        <div style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between", marginBottom: 20
                        }}>
                            <div style={{
                                fontSize: 18, fontWeight: 500, color: "var(--text)",
                                fontFamily: "'DM Serif Display', serif"
                            }}>
                                {modal === "nuevo" ? "Nuevo proyecto" : "Editar proyecto"}
                            </div>
                            <button
                                onClick={() => setModal(null)}
                                style={{
                                    padding: "4px 10px", borderRadius: 6,
                                    border: "0.5px solid var(--border2)",
                                    background: "var(--surface2)", cursor: "pointer",
                                    fontSize: 11, color: "var(--text3)", fontFamily: "inherit"
                                }}
                            >
                                ✕ cerrar
                            </button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                            {/* Nombre y slogan */}
                            <Campo label="Nombre del proyecto">
                                <input type="text" value={form.nombre}
                                    onChange={e => setForm((p: any) => ({ ...p, nombre: e.target.value }))}
                                    placeholder="Ej: Conjunto Residencial Los Ceibos" />
                            </Campo>

                            <Campo label="Slogan (opcional)">
                                <input type="text" value={form.slogan}
                                    onChange={e => setForm((p: any) => ({ ...p, slogan: e.target.value }))}
                                    placeholder="Ej: Tu hogar, tu refugio" />
                            </Campo>

                            {/* Precios */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                                <Campo label="Precio desde ($)">
                                    <input type="number" value={form.precio_desde}
                                        onChange={e => setForm((p: any) => ({ ...p, precio_desde: e.target.value }))}
                                        placeholder="85000" />
                                </Campo>
                                <Campo label="Precio hasta ($)">
                                    <input type="number" value={form.precio_hasta}
                                        onChange={e => setForm((p: any) => ({ ...p, precio_hasta: e.target.value }))}
                                        placeholder="145000" />
                                </Campo>
                                <Campo label="Estado">
                                    <select value={form.estado}
                                        onChange={e => setForm((p: any) => ({ ...p, estado: e.target.value }))}>
                                        {ESTADOS.map(s => (
                                            <option key={s} value={s}>
                                                {s.replace(/_/g, " ").charAt(0).toUpperCase() + s.replace(/_/g, " ").slice(1)}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                            </div>

                            {/* Ciudad + Sector + Fecha entrega */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                                <Campo label="Ciudad">
                                    <select value={form.ciudad_id}
                                        onChange={e => {
                                            const id = parseInt(e.target.value)
                                            setForm((p: any) => ({ ...p, ciudad_id: e.target.value, sector_id: "" }))
                                            setCiudadSeleccionada(id)
                                        }}>
                                        <option value="">Seleccionar...</option>
                                        {ciudades.map(c => (
                                            <option key={c.id} value={c.id}>{c.nombre}</option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo label="Sector (opcional)">
                                    <select value={form.sector_id}
                                        onChange={e => setForm((p: any) => ({ ...p, sector_id: e.target.value }))}>
                                        <option value="">Sin sector</option>
                                        {sectorsFiltrados.map(s => (
                                            <option key={s.id} value={s.id}>{s.nombre}</option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo label="Entrega estimada">
                                    <input type="date" value={form.fecha_entrega_estimada}
                                        onChange={e => setForm((p: any) => ({ ...p, fecha_entrega_estimada: e.target.value }))} />
                                </Campo>
                            </div>

                            {/* Formas de pago */}
                            <Campo label="Formas de pago">
                                <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
                                    {FORMAS_PAGO.map(f => (
                                        <label key={f} style={{
                                            display: "flex", alignItems: "center", gap: 5,
                                            fontSize: 12, color: "var(--text2)", cursor: "pointer"
                                        }}>
                                            <input type="checkbox"
                                                checked={form.tipo_pago.includes(f)}
                                                onChange={() => togglePago(f)}
                                                style={{ accentColor: "var(--accent)" }}
                                            />
                                            {f.charAt(0).toUpperCase() + f.slice(1)}
                                        </label>
                                    ))}
                                </div>
                            </Campo>

                            {/* Amenidades */}
                            <Campo label="Amenidades">
                                <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(3, 1fr)",
                                    gap: 6, paddingTop: 4
                                }}>
                                    {AMENIDADES_LISTA.map(a => (
                                        <label key={a} style={{
                                            display: "flex", alignItems: "center", gap: 5,
                                            fontSize: 12, color: "var(--text2)", cursor: "pointer"
                                        }}>
                                            <input type="checkbox"
                                                checked={form.amenidades.includes(a)}
                                                onChange={() => toggleAmenidad(a)}
                                                style={{ accentColor: "var(--accent)" }}
                                            />
                                            {a.replace(/_/g, " ")}
                                        </label>
                                    ))}
                                </div>
                            </Campo>

                            {/* Descripción */}
                            <Campo label="Descripción">
                                <textarea value={form.descripcion}
                                    onChange={e => setForm((p: any) => ({ ...p, descripcion: e.target.value }))}
                                    placeholder="Describe el proyecto..."
                                    rows={3} />
                            </Campo>

                            {/* Sitio web */}
                            <Campo label="Sitio web (opcional)">
                                <input type="text" value={form.sitio_web}
                                    onChange={e => setForm((p: any) => ({ ...p, sitio_web: e.target.value }))}
                                    placeholder="https://miproyecto.com" />
                            </Campo>

                            {/* Fotos */}
                            <Campo label="URLs de fotos (una por línea)">
                                <textarea
                                    value={(form.fotos || []).join("\n")}
                                    onChange={e => setForm((p: any) => ({
                                        ...p,
                                        fotos: e.target.value.split("\n")
                                            .map((u: string) => u.trim())
                                            .filter(Boolean)
                                    }))}
                                    placeholder="https://ejemplo.com/foto1.jpg"
                                    rows={2}
                                />
                            </Campo>

                            {/* Acciones */}
                            <div style={{
                                display: "flex", gap: 8,
                                justifyContent: "flex-end", paddingTop: 4
                            }}>
                                <button
                                    onClick={() => setModal(null)}
                                    style={{
                                        padding: "8px 16px", borderRadius: 7,
                                        border: "0.5px solid var(--border2)",
                                        background: "var(--surface2)", cursor: "pointer",
                                        fontSize: 13, color: "var(--text)", fontFamily: "inherit"
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={guardar}
                                    disabled={guardando}
                                    style={{
                                        padding: "8px 20px", borderRadius: 7,
                                        background: "var(--accent)", color: "#fff",
                                        border: "none", cursor: "pointer",
                                        fontSize: 13, fontWeight: 500, fontFamily: "inherit",
                                        opacity: guardando ? 0.6 : 1
                                    }}
                                >
                                    {guardando ? "Guardando..." : "Guardar proyecto"}
                                </button>
                            </div>
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

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{
                fontSize: 10, fontWeight: 500, color: "var(--text3)",
                textTransform: "uppercase", letterSpacing: ".05em"
            }}>
                {label}
            </label>
            <style>{`
                input[type=text], input[type=number], input[type=date],
                select, textarea {
                    padding: 7px 9px; border-radius: 7px;
                    border: 0.5px solid var(--border2);
                    background: var(--surface2); color: var(--text);
                    font-family: inherit; font-size: 12px;
                    outline: none; transition: border-color .12s; width: 100%;
                }
                input:focus, select:focus, textarea:focus { border-color: var(--accent); }
                textarea { resize: vertical; min-height: 56px; }
            `}</style>
            {children}
        </div>
    )
}