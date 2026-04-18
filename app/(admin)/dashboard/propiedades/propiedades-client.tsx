"use client"

import { useState } from "react"
import { FotoUploader, subirFotosPendientes } from "@/components/FotoUploader"
import type { FotoItem } from "@/components/FotoUploader"

interface Props {
    propiedadesIniciales: any[]
    ciudades: any[]
    sectores: any[]
    proyectos: any[]
    tenantId: number
}

const TIPOS = ["casa", "departamento", "terreno", "comercial", "oficina"]
const OPERACIONES = ["venta", "alquiler"]
const ESTADOS = ["disponible", "reservado", "vendido", "alquilado", "inactivo"]
const FORMAS_PAGO = ["contado", "financiamiento", "biess"]

const urlsAFotoItems = (fotos: any[]): FotoItem[] =>
    (fotos || []).map((url: string) => ({
        tipo: "remota" as const,
        url,
        preview: url
    }))

export default function PropiedadesClient({
    propiedadesIniciales, ciudades, sectores, proyectos, tenantId
}: Props) {
    const [propiedades, setPropiedades] = useState(propiedadesIniciales)
    const [filtroTipo, setFiltroTipo] = useState("todos")
    const [filtroOp, setFiltroOp] = useState("todos")
    const [busqueda, setBusqueda] = useState("")
    const [modal, setModal] = useState<null | "nueva" | "editar">(null)
    const [propActual, setPropActual] = useState<any>(null)
    const [guardando, setGuardando] = useState(false)
    const [toast, setToast] = useState("")
    const [ciudadSeleccionada, setCiudadSeleccionada] = useState<number | null>(null)

    const formVacio = {
        nombre: "", descripcion: "", tipo_propiedad: "casa",
        tipo_operacion: "venta", tipo_pago: ["contado"],
        precio: "", precio_negociable: false, estado: "disponible",
        ciudad_id: "", sector_id: "", proyecto_id: "",
        dimensiones: { m2_construccion: "", m2_terreno: "", m2_total: "", pisos: "" },
        ambientes: { habitaciones: "", banos: "", medios_banos: "", sala: false, comedor: false, cocina: false, estudio: false },
        exteriores: { patio: false, jardin: false, terraza: false, balcon: false, piscina: false, bbq: false },
        estacionamiento: { estacionamientos: "", cubierto: false, bodega: false },
        extras: { amoblado: false, ascensor: false, generador: false, cisterna: false, panel_solar: false },
        servicios: { agua: true, luz: true, gas: false, alcantarillado: true, internet: false, tv_cable: false },
        seguridad: { conjunto_cerrado: false, guardianía: false, camara_seguridad: false, alarma: false, cerca_electrica: false },
        fotos: [] as FotoItem[],
    }

    const [form, setForm] = useState<any>(formVacio)

    const mostrarToast = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(""), 2200)
    }

    const abrirNueva = () => {
        setForm(formVacio)
        setCiudadSeleccionada(null)
        setPropActual(null)
        setModal("nueva")
    }

    const abrirEditar = (prop: any) => {
        setForm({
            nombre: prop.nombre || "",
            descripcion: prop.descripcion || "",
            tipo_propiedad: prop.tipo_propiedad || "casa",
            tipo_operacion: prop.tipo_operacion || "venta",
            tipo_pago: prop.tipo_pago || ["contado"],
            precio: prop.precio || "",
            precio_negociable: prop.precio_negociable || false,
            estado: prop.estado || "disponible",
            ciudad_id: prop.ciudad?.id || prop.ciudad_id || "",  // ← puede venir de dos formas
            sector_id: prop.sector?.id || prop.sector_id || "",
            proyecto_id: prop.proyecto?.id || "",
            dimensiones: prop.dimensiones || {},
            ambientes: prop.ambientes || {},
            exteriores: prop.exteriores || {},
            estacionamiento: prop.estacionamiento || {},
            extras: prop.extras || {},
            servicios: prop.servicios || {},
            seguridad: prop.seguridad || {},
            // Convertir URLs guardadas a FotoItems
            fotos: urlsAFotoItems(prop.fotos || []),
        })
        setCiudadSeleccionada(prop.ciudad?.id || null)
        setPropActual(prop)
        setModal("editar")
    }

    const guardar = async () => {
        console.log("ciudad_id antes de enviar:", form.ciudad_id)
        console.log("sector_id antes de enviar:", form.sector_id)
        console.log("tipo:", typeof form.ciudad_id)
        if (!form.nombre.trim()) { mostrarToast("El nombre es requerido"); return }
        if (!form.precio) { mostrarToast("El precio es requerido"); return }
        if (!form.ciudad_id) { mostrarToast("La ciudad es requerida"); return }

        setGuardando(true)
        try {
            // 1. Subir fotos pendientes primero, conservar remotas
            const fotosUrls = await subirFotosPendientes(form.fotos || [])

            const body = {
                nombre: form.nombre,
                descripcion: form.descripcion,
                tipo_propiedad: form.tipo_propiedad,
                tipo_operacion: form.tipo_operacion,
                tipo_pago: form.tipo_pago,
                precio: parseFloat(form.precio),
                precio_negociable: form.precio_negociable,
                estado: form.estado,
                ciudad_id: parseInt(form.ciudad_id),
                sector_id: form.sector_id ? parseInt(form.sector_id) : null,
                proyecto_id: form.proyecto_id ? parseInt(form.proyecto_id) : null,
                dimensiones: limpiarJsonb(form.dimensiones),
                ambientes: limpiarJsonb(form.ambientes),
                exteriores: form.exteriores,
                estacionamiento: limpiarJsonb(form.estacionamiento),
                extras: form.extras,
                servicios: form.servicios,
                seguridad: form.seguridad,
                fotos: fotosUrls, // ← URLs finales ya subidas
            }
            console.log("Payload a enviar:", body);
            const url = modal === "editar"
                ? `/api/admin/propiedades/${propActual.id}`
                : "/api/admin/propiedades"

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
            const ciudadObj = ciudades.find(c => c.id === parseInt(form.ciudad_id))

            if (modal === "editar") {
                setPropiedades(prev => prev.map(p =>
                    p.id === propActual.id
                        ? { ...p, ...body, fotos: fotosUrls, ciudad: ciudadObj }
                        : p
                ))
                mostrarToast("Propiedad actualizada ✓")
            } else {
                setPropiedades(prev => [{ ...data.propiedad, ciudad: ciudadObj }, ...prev])
                mostrarToast("Propiedad creada ✓")
            }

            setModal(null)
        } finally {
            setGuardando(false)
        }
    }

    const eliminar = async (id: number) => {
        if (!confirm("¿Eliminar esta propiedad?")) return
        await fetch(`/api/admin/propiedades/${id}`, { method: "DELETE" })
        setPropiedades(prev => prev.filter(p => p.id !== id))
        mostrarToast("Propiedad eliminada")
    }

    const togglePago = (forma: string) => {
        setForm((prev: any) => ({
            ...prev,
            tipo_pago: prev.tipo_pago.includes(forma)
                ? prev.tipo_pago.filter((f: string) => f !== forma)
                : [...prev.tipo_pago, forma]
        }))
    }

    const limpiarJsonb = (obj: any) => {
        const resultado: any = {}
        Object.entries(obj).forEach(([k, v]) => {
            if (v !== "" && v !== null && v !== undefined) {
                resultado[k] = typeof v === "string" ? parseFloat(v) || v : v
            }
        })
        return resultado
    }

    const sectorsFiltrados = ciudadSeleccionada
        ? sectores.filter(s => s.ciudad_id === ciudadSeleccionada)
        : []

    const propsFiltradas = propiedades.filter(p => {
        if (filtroTipo !== "todos" && p.tipo_propiedad !== filtroTipo) return false
        if (filtroOp !== "todos" && p.tipo_operacion !== filtroOp) return false
        if (busqueda && !p.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
        return true
    })

    const emojiTipo = (tipo: string) => ({
        casa: "🏠", departamento: "🏢", terreno: "🌿",
        comercial: "🏪", oficina: "💼"
    }[tipo] || "🏠")

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
                    Propiedades
                </div>
                <button onClick={abrirNueva} style={{
                    padding: "7px 14px", borderRadius: 7,
                    background: "var(--accent)", color: "#fff",
                    border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 500, fontFamily: "inherit"
                }}>
                    + Nueva propiedad
                </button>
            </div>

            {/* Filtros */}
            <div style={{
                background: "var(--surface)", border: "0.5px solid var(--border)",
                borderRadius: 10, padding: "10px 14px",
                display: "flex", flexWrap: "wrap", gap: 8,
                alignItems: "center", marginBottom: 14
            }}>
                <input
                    type="text" placeholder="Buscar..."
                    value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    style={{
                        flex: 1, minWidth: 150, padding: "6px 10px",
                        borderRadius: 7, border: "0.5px solid var(--border2)",
                        background: "var(--surface2)", color: "var(--text)",
                        fontFamily: "inherit", fontSize: 12, outline: "none"
                    }}
                />
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {["todos", ...TIPOS].map(t => (
                        <button key={t} onClick={() => setFiltroTipo(t)} style={{
                            padding: "4px 10px", borderRadius: 20, fontSize: 11,
                            fontWeight: 500, cursor: "pointer", border: "0.5px solid var(--border2)",
                            background: filtroTipo === t ? "var(--accent-light)" : "var(--surface2)",
                            color: filtroTipo === t ? "var(--accent)" : "var(--text2)",
                            fontFamily: "inherit"
                        }}>
                            {t === "todos" ? "Todos" : t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                    {["todos", ...OPERACIONES].map(o => (
                        <button key={o} onClick={() => setFiltroOp(o)} style={{
                            padding: "4px 10px", borderRadius: 20, fontSize: 11,
                            fontWeight: 500, cursor: "pointer", border: "0.5px solid var(--border2)",
                            background: filtroOp === o ? "var(--sbb)" : "var(--surface2)",
                            color: filtroOp === o ? "var(--sb)" : "var(--text2)",
                            fontFamily: "inherit"
                        }}>
                            {o === "todos" ? "Todos" : o.charAt(0).toUpperCase() + o.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12
            }}>
                {propsFiltradas.length === 0 ? (
                    <div style={{
                        gridColumn: "1/-1", padding: 40,
                        textAlign: "center", fontSize: 13, color: "var(--text3)"
                    }}>
                        Sin propiedades
                    </div>
                ) : propsFiltradas.map(p => (
                    <div key={p.id} style={{
                        background: "var(--surface)", border: "0.5px solid var(--border)",
                        borderRadius: 10, overflow: "hidden", cursor: "pointer",
                        transition: "transform .12s, border-color .12s",
                    }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"
                                ; (e.currentTarget as HTMLElement).style.borderColor = "var(--border2)"
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.transform = "none"
                                ; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"
                        }}
                    >
                        {/* Imagen */}
                        <div style={{
                            height: 90, background: "var(--surface2)",
                            display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: 32,
                            position: "relative", overflow: "hidden"
                        }}>
                            {p.fotos?.length > 0
                                ? <img
                                    src={p.fotos[0]}
                                    alt={p.nombre}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                                : emojiTipo(p.tipo_propiedad)
                            }
                            <span style={{
                                position: "absolute", top: 8, left: 8,
                                padding: "2px 7px", borderRadius: 20,
                                fontSize: 10, fontWeight: 500,
                                background: p.tipo_operacion === "venta" ? "var(--sbb)" : "var(--sab)",
                                color: p.tipo_operacion === "venta" ? "var(--sb)" : "var(--sa)"
                            }}>
                                {p.tipo_operacion}
                            </span>
                        </div>

                        {/* Body */}
                        <div style={{ padding: "10px 12px" }}>
                            <div style={{
                                fontSize: 13, fontWeight: 500, color: "var(--text)",
                                marginBottom: 2, whiteSpace: "nowrap",
                                overflow: "hidden", textOverflow: "ellipsis"
                            }}>
                                {p.nombre}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 5 }}>
                                {(p.ciudad as any)?.nombre || ""}
                                {(p.sector as any)?.nombre ? ` · ${(p.sector as any).nombre}` : ""}
                            </div>
                            <div style={{
                                fontSize: 15, fontWeight: 500, color: "var(--accent)",
                                fontFamily: "'DM Serif Display', serif"
                            }}>
                                ${Number(p.precio).toLocaleString("es-EC")}
                                {p.tipo_operacion === "alquiler" && "/mes"}
                            </div>

                            <div style={{
                                display: "flex", alignItems: "center",
                                justifyContent: "space-between",
                                marginTop: 8, paddingTop: 8,
                                borderTop: "0.5px solid var(--border)"
                            }}>
                                <span style={{
                                    padding: "2px 7px", borderRadius: 20,
                                    fontSize: 10, fontWeight: 500,
                                    background: p.estado === "disponible" ? "var(--sgb)"
                                        : p.estado === "reservado" ? "var(--sab)" : "var(--sgrb)",
                                    color: p.estado === "disponible" ? "var(--sg)"
                                        : p.estado === "reservado" ? "var(--sa)" : "var(--sgr)"
                                }}>
                                    {p.estado}
                                </span>
                                <div style={{ display: "flex", gap: 4 }}>
                                    <button
                                        onClick={e => { e.stopPropagation(); abrirEditar(p) }}
                                        style={{
                                            width: 24, height: 24, borderRadius: 5,
                                            border: "0.5px solid var(--border2)",
                                            background: "var(--surface2)", cursor: "pointer",
                                            display: "flex", alignItems: "center",
                                            justifyContent: "center", fontSize: 11, color: "var(--text2)"
                                        }}
                                    >✎</button>
                                    <button
                                        onClick={e => { e.stopPropagation(); eliminar(p.id) }}
                                        style={{
                                            width: 24, height: 24, borderRadius: 5,
                                            border: "0.5px solid var(--border2)",
                                            background: "var(--surface2)", cursor: "pointer",
                                            display: "flex", alignItems: "center",
                                            justifyContent: "center", fontSize: 11, color: "var(--text2)"
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLElement).style.background = "var(--srb)"
                                                ; (e.currentTarget as HTMLElement).style.color = "var(--sr)"
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLElement).style.background = "var(--surface2)"
                                                ; (e.currentTarget as HTMLElement).style.color = "var(--text2)"
                                        }}
                                    >✕</button>
                                </div>
                            </div>

                            {p.total_consultas > 0 && (
                                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>
                                    {p.total_consultas} consulta(s) via bot
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* MODAL */}
            {modal && (
                <div
                    style={{
                        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
                        zIndex: 60, display: "flex",
                        alignItems: "flex-end", justifyContent: "center"
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
                >
                    <div style={{
                        background: "var(--surface)", borderRadius: "14px 14px 0 0",
                        width: "100%", maxWidth: 640,
                        maxHeight: "90vh", overflowY: "auto", padding: 24
                    }}>
                        <div style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between", marginBottom: 20
                        }}>
                            <div style={{
                                fontSize: 18, fontWeight: 500, color: "var(--text)",
                                fontFamily: "'DM Serif Display', serif"
                            }}>
                                {modal === "nueva" ? "Nueva propiedad" : "Editar propiedad"}
                            </div>
                            <button onClick={() => setModal(null)} style={{
                                padding: "4px 10px", borderRadius: 6,
                                border: "0.5px solid var(--border2)",
                                background: "var(--surface2)", cursor: "pointer",
                                fontSize: 11, color: "var(--text3)", fontFamily: "inherit"
                            }}>
                                ✕ cerrar
                            </button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                            <Campo label="Nombre">
                                <input type="text" value={form.nombre}
                                    onChange={e => setForm((p: any) => ({ ...p, nombre: e.target.value }))}
                                    placeholder="Ej: Casa en Urb. Villa del Rey" />
                            </Campo>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <Campo label="Tipo">
                                    <select value={form.tipo_propiedad}
                                        onChange={e => setForm((p: any) => ({ ...p, tipo_propiedad: e.target.value }))}>
                                        {TIPOS.map(t => (
                                            <option key={t} value={t}>
                                                {t.charAt(0).toUpperCase() + t.slice(1)}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo label="Operación">
                                    <select value={form.tipo_operacion}
                                        onChange={e => setForm((p: any) => ({ ...p, tipo_operacion: e.target.value }))}>
                                        {OPERACIONES.map(o => (
                                            <option key={o} value={o}>
                                                {o.charAt(0).toUpperCase() + o.slice(1)}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                                <Campo label="Precio ($)">
                                    <input type="number" value={form.precio}
                                        onChange={e => setForm((p: any) => ({ ...p, precio: e.target.value }))}
                                        placeholder="75000" />
                                </Campo>
                                <Campo label="Estado">
                                    <select value={form.estado}
                                        onChange={e => setForm((p: any) => ({ ...p, estado: e.target.value }))}>
                                        {ESTADOS.map(s => (
                                            <option key={s} value={s}>
                                                {s.charAt(0).toUpperCase() + s.slice(1)}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo label="Proyecto (opcional)">
                                    <select value={form.proyecto_id}
                                        onChange={e => setForm((p: any) => ({ ...p, proyecto_id: e.target.value }))}>
                                        <option value="">Independiente</option>
                                        {proyectos.map(p => (
                                            <option key={p.id} value={p.id}>{p.nombre}</option>
                                        ))}
                                    </select>
                                </Campo>
                            </div>

                            <Campo label="Formas de pago">
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
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
                                    <label style={{
                                        display: "flex", alignItems: "center", gap: 5,
                                        fontSize: 12, color: "var(--text2)", cursor: "pointer"
                                    }}>
                                        <input type="checkbox"
                                            checked={form.precio_negociable}
                                            onChange={e => setForm((p: any) => ({ ...p, precio_negociable: e.target.checked }))}
                                            style={{ accentColor: "var(--accent)" }}
                                        />
                                        Precio negociable
                                    </label>
                                </div>
                            </Campo>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                            </div>

                            {/* Dimensiones */}
                            <div>
                                <div style={{
                                    fontSize: 11, fontWeight: 500, color: "var(--text3)",
                                    textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8
                                }}>
                                    Dimensiones
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                                    {[
                                        { k: "m2_construccion", label: "m² construc." },
                                        { k: "m2_terreno", label: "m² terreno" },
                                        { k: "m2_total", label: "m² total" },
                                        { k: "pisos", label: "Pisos" },
                                    ].map(f => (
                                        <Campo key={f.k} label={f.label}>
                                            <input type="number"
                                                value={form.dimensiones[f.k] || ""}
                                                onChange={e => setForm((p: any) => ({
                                                    ...p, dimensiones: { ...p.dimensiones, [f.k]: e.target.value }
                                                }))}
                                            />
                                        </Campo>
                                    ))}
                                </div>
                            </div>

                            {/* Ambientes */}
                            <div>
                                <div style={{
                                    fontSize: 11, fontWeight: 500, color: "var(--text3)",
                                    textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8
                                }}>
                                    Ambientes
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                                    {[
                                        { k: "habitaciones", label: "Habitaciones" },
                                        { k: "banos", label: "Baños" },
                                        { k: "medios_banos", label: "Medios baños" },
                                    ].map(f => (
                                        <Campo key={f.k} label={f.label}>
                                            <input type="number"
                                                value={form.ambientes[f.k] || ""}
                                                onChange={e => setForm((p: any) => ({
                                                    ...p, ambientes: { ...p.ambientes, [f.k]: e.target.value }
                                                }))}
                                            />
                                        </Campo>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                                    {["sala", "comedor", "cocina", "estudio"].map(k => (
                                        <label key={k} style={{
                                            display: "flex", alignItems: "center", gap: 5,
                                            fontSize: 12, color: "var(--text2)", cursor: "pointer"
                                        }}>
                                            <input type="checkbox"
                                                checked={!!form.ambientes[k]}
                                                onChange={e => setForm((p: any) => ({
                                                    ...p, ambientes: { ...p.ambientes, [k]: e.target.checked }
                                                }))}
                                                style={{ accentColor: "var(--accent)" }}
                                            />
                                            {k.charAt(0).toUpperCase() + k.slice(1)}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Extras */}
                            <div>
                                <div style={{
                                    fontSize: 11, fontWeight: 500, color: "var(--text3)",
                                    textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8
                                }}>
                                    Extras y amenidades
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                                    {[
                                        { grupo: "exteriores", k: "patio", label: "Patio" },
                                        { grupo: "exteriores", k: "jardin", label: "Jardín" },
                                        { grupo: "exteriores", k: "terraza", label: "Terraza" },
                                        { grupo: "exteriores", k: "balcon", label: "Balcón" },
                                        { grupo: "exteriores", k: "piscina", label: "Piscina" },
                                        { grupo: "exteriores", k: "bbq", label: "BBQ" },
                                        { grupo: "estacionamiento", k: "cubierto", label: "Garaje cubierto" },
                                        { grupo: "estacionamiento", k: "bodega", label: "Bodega" },
                                        { grupo: "extras", k: "amoblado", label: "Amoblado" },
                                        { grupo: "extras", k: "ascensor", label: "Ascensor" },
                                        { grupo: "extras", k: "generador", label: "Generador" },
                                        { grupo: "extras", k: "cisterna", label: "Cisterna" },
                                        { grupo: "seguridad", k: "conjunto_cerrado", label: "Conjunto cerrado" },
                                        { grupo: "seguridad", k: "guardianía", label: "Guardianía" },
                                        { grupo: "seguridad", k: "camara_seguridad", label: "Cámaras" },
                                    ].map(f => (
                                        <label key={`${f.grupo}-${f.k}`} style={{
                                            display: "flex", alignItems: "center", gap: 5,
                                            fontSize: 12, color: "var(--text2)", cursor: "pointer"
                                        }}>
                                            <input type="checkbox"
                                                checked={!!form[f.grupo][f.k]}
                                                onChange={e => setForm((p: any) => ({
                                                    ...p,
                                                    [f.grupo]: { ...p[f.grupo], [f.k]: e.target.checked }
                                                }))}
                                                style={{ accentColor: "var(--accent)" }}
                                            />
                                            {f.label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <Campo label="Estacionamientos">
                                <input type="number"
                                    value={form.estacionamiento.estacionamientos || ""}
                                    onChange={e => setForm((p: any) => ({
                                        ...p, estacionamiento: {
                                            ...p.estacionamiento,
                                            estacionamientos: e.target.value
                                        }
                                    }))}
                                    placeholder="0"
                                    style={{ maxWidth: 100 }}
                                />
                            </Campo>

                            <Campo label="Descripción">
                                <textarea
                                    value={form.descripcion}
                                    onChange={e => setForm((p: any) => ({ ...p, descripcion: e.target.value }))}
                                    placeholder="Describe la propiedad..."
                                    rows={3}
                                />
                            </Campo>

                            {/* FOTOS — uploader con preview local */}
                            <Campo label="Fotos">
                                <FotoUploader
                                    fotosIniciales={propActual?.fotos || []}
                                    fotos={form.fotos || []}
                                    onChange={fotos => setForm((p: any) => ({ ...p, fotos }))}
                                />
                                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>
                                    Las fotos se suben al guardar la propiedad. La primera es la portada.
                                </div>
                            </Campo>

                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
                                <button onClick={() => setModal(null)} style={{
                                    padding: "8px 16px", borderRadius: 7,
                                    border: "0.5px solid var(--border2)",
                                    background: "var(--surface2)", cursor: "pointer",
                                    fontSize: 13, color: "var(--text)", fontFamily: "inherit"
                                }}>
                                    Cancelar
                                </button>
                                <button onClick={guardar} disabled={guardando} style={{
                                    padding: "8px 20px", borderRadius: 7,
                                    background: "var(--accent)", color: "#fff",
                                    border: "none", cursor: "pointer",
                                    fontSize: 13, fontWeight: 500, fontFamily: "inherit",
                                    opacity: guardando ? 0.6 : 1
                                }}>
                                    {guardando ? "Guardando..." : "Guardar propiedad"}
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
                input[type=text], input[type=number], select, textarea {
                    padding: 7px 9px; border-radius: 7px;
                    border: 0.5px solid var(--border2);
                    background: var(--surface2); color: var(--text);
                    font-family: inherit; font-size: 12px; outline: none;
                    transition: border-color .12s; width: 100%;
                }
                input:focus, select:focus, textarea:focus { border-color: var(--accent); }
                textarea { resize: vertical; min-height: 56px; }
            `}</style>
            {children}
        </div>
    )
}