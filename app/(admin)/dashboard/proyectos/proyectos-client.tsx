"use client"

import { useState } from "react"
import { FotoUploader, subirFotosPendientes } from "@/components/FotoUploader"
import type { FotoItem } from "@/components/FotoUploader"

const ESTADOS = ["activo", "en_construccion", "entregado", "inactivo"]
const ESTADOS_UNIDAD = ["disponible", "reservado", "vendido", "inactivo"]
const FORMAS_PAGO = ["contado", "financiamiento", "biess"]
const TIPOS_UNIDAD = ["casa", "departamento", "oficina", "comercial"]
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

const formUnidadVacio = {
    nombre: "", descripcion: "",
    tipo_propiedad: "casa", tipo_operacion: "venta",
    tipo_pago: ["contado", "financiamiento"],
    precio: "", precio_negociable: false,
    estado: "disponible",
    dimensiones: { m2_construccion: "", m2_terreno: "", m2_total: "", pisos: "" },
    ambientes: { habitaciones: "", banos: "", medios_banos: "", sala: false, comedor: false, cocina: false, estudio: false },
    exteriores: { patio: false, jardin: false, terraza: false, balcon: false, piscina: false, bbq: false },
    estacionamiento: { estacionamientos: "", cubierto: false, bodega: false },
    extras: { amoblado: false, ascensor: false, generador: false, cisterna: false },
    seguridad: { conjunto_cerrado: false, guardianía: false, camara_seguridad: false, alarma: false },
    fotos: [] as FotoItem[],
}

export default function ProyectosClient({
    proyectosIniciales, ciudades, sectores, tenantId
}: Props) {
    // ── Estado proyectos ──
    const [proyectos, setProyectos] = useState(proyectosIniciales)
    const [modal, setModal] = useState<null | "nuevo" | "editar">(null)
    const [proyActual, setProyActual] = useState<any>(null)
    const [guardando, setGuardando] = useState(false)
    const [toast, setToast] = useState("")
    const [ciudadSeleccionada, setCiudadSeleccionada] = useState<number | null>(null)
    const [busqueda, setBusqueda] = useState("")

    // ── Estado unidades ──
    const [unidades, setUnidades] = useState<Record<number, any[]>>({})
    const [proyectoExpandido, setProyectoExpandido] = useState<number | null>(null)
    const [modalUnidad, setModalUnidad] = useState<null | "nueva" | "editar">(null)
    const [unidadActual, setUnidadActual] = useState<any>(null)
    const [proyectoIdActivo, setProyectoIdActivo] = useState<number | null>(null)
    const [guardandoUnidad, setGuardandoUnidad] = useState(false)
    const [formUnidad, setFormUnidad] = useState<any>(formUnidadVacio)

    // ── Form proyecto ──
    const [form, setForm] = useState<any>({
        nombre: "", descripcion: "", slogan: "",
        precio_desde: "", precio_hasta: "",
        tipo_pago: ["contado", "financiamiento"],
        estado: "activo", fecha_entrega_estimada: "",
        amenidades: [], sitio_web: "", fotos: [],
        ciudad_id: "", sector_id: "",
    })

    const mostrarToast = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(""), 2200)
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

    // ── Proyectos CRUD ──
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

    // ── Unidades CRUD ──
    const cargarUnidades = async (proyectoId: number) => {
        if (proyectoExpandido === proyectoId) {
            setProyectoExpandido(null)
            return
        }

        if (!unidades[proyectoId]) {
            const res = await fetch(`/api/admin/propiedades?proyecto_id=${proyectoId}`)
            const data = await res.json()
            setUnidades(prev => ({ ...prev, [proyectoId]: data.propiedades || [] }))
        }

        setProyectoExpandido(proyectoId)
    }

    const abrirNuevaUnidad = (proyectoId: number) => {
        setProyectoIdActivo(proyectoId)
        setUnidadActual(null)
        setFormUnidad(formUnidadVacio)
        setModalUnidad("nueva")
    }

    const abrirEditarUnidad = (unidad: any, proyectoId: number) => {
        setProyectoIdActivo(proyectoId)
        setUnidadActual(unidad)
        setFormUnidad({
            nombre: unidad.nombre || "",
            descripcion: unidad.descripcion || "",
            tipo_propiedad: unidad.tipo_propiedad || "casa",
            tipo_operacion: unidad.tipo_operacion || "venta",
            tipo_pago: unidad.tipo_pago || ["contado"],
            precio: unidad.precio || "",
            precio_negociable: unidad.precio_negociable || false,
            estado: unidad.estado || "disponible",
            dimensiones: unidad.dimensiones || {},
            ambientes: unidad.ambientes || {},
            exteriores: unidad.exteriores || {},
            estacionamiento: unidad.estacionamiento || {},
            extras: unidad.extras || {},
            seguridad: unidad.seguridad || {},
            fotos: (unidad.fotos || []).map((url: string) => ({
                tipo: "remota" as const, url, preview: url
            })),
        })
        setModalUnidad("editar")
    }

    const guardarUnidad = async () => {
        if (!formUnidad.nombre.trim()) { mostrarToast("El nombre es requerido"); return }
        if (!formUnidad.precio) { mostrarToast("El precio es requerido"); return }
        if (!proyectoIdActivo) return

        setGuardandoUnidad(true)
        try {
            const fotosUrls = await subirFotosPendientes(formUnidad.fotos || [])
            const proyecto = proyectos.find(p => p.id === proyectoIdActivo)

            const body = {
                nombre: formUnidad.nombre,
                descripcion: formUnidad.descripcion,
                tipo_propiedad: formUnidad.tipo_propiedad,
                tipo_operacion: formUnidad.tipo_operacion,
                tipo_pago: formUnidad.tipo_pago,
                precio: parseFloat(formUnidad.precio),
                precio_negociable: formUnidad.precio_negociable,
                estado: formUnidad.estado,
                ciudad_id: (proyecto?.ciudad as any)?.id,
                sector_id: (proyecto?.sector as any)?.id || null,
                proyecto_id: proyectoIdActivo,
                dimensiones: limpiarJsonb(formUnidad.dimensiones),
                ambientes: limpiarJsonb(formUnidad.ambientes),
                exteriores: formUnidad.exteriores,
                estacionamiento: limpiarJsonb(formUnidad.estacionamiento),
                extras: formUnidad.extras,
                seguridad: formUnidad.seguridad,
                fotos: fotosUrls,
            }

            const url = modalUnidad === "editar"
                ? `/api/admin/propiedades/${unidadActual.id}`
                : "/api/admin/propiedades"

            const res = await fetch(url, {
                method: modalUnidad === "editar" ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })

            if (!res.ok) {
                const err = await res.json()
                mostrarToast(err.error || "Error al guardar")
                return
            }

            const data = await res.json()

            setUnidades(prev => {
                const lista = prev[proyectoIdActivo] || []
                if (modalUnidad === "editar") {
                    return {
                        ...prev,
                        [proyectoIdActivo]: lista.map(u =>
                            u.id === unidadActual.id
                                ? { ...u, ...body, fotos: fotosUrls }
                                : u
                        )
                    }
                } else {
                    return {
                        ...prev,
                        [proyectoIdActivo]: [data.propiedad, ...lista]
                    }
                }
            })

            if (modalUnidad === "nueva") {
                setProyectos(prev => prev.map(p =>
                    p.id === proyectoIdActivo
                        ? { ...p, total_unidades: p.total_unidades + 1 }
                        : p
                ))
            }

            mostrarToast(modalUnidad === "editar" ? "Unidad actualizada ✓" : "Unidad creada ✓")
            setModalUnidad(null)
        } finally {
            setGuardandoUnidad(false)
        }
    }

    const eliminarUnidad = async (unidadId: number, proyectoId: number) => {
        if (!confirm("¿Eliminar esta unidad?")) return
        await fetch(`/api/admin/propiedades/${unidadId}`, { method: "DELETE" })
        setUnidades(prev => ({
            ...prev,
            [proyectoId]: (prev[proyectoId] || []).filter(u => u.id !== unidadId)
        }))
        setProyectos(prev => prev.map(p =>
            p.id === proyectoId
                ? { ...p, total_unidades: Math.max(0, p.total_unidades - 1) }
                : p
        ))
        mostrarToast("Unidad eliminada")
    }

    const togglePagoUnidad = (forma: string) => {
        setFormUnidad((prev: any) => ({
            ...prev,
            tipo_pago: prev.tipo_pago.includes(forma)
                ? prev.tipo_pago.filter((f: string) => f !== forma)
                : [...prev.tipo_pago, forma]
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
                <button onClick={abrirNuevo} style={{
                    padding: "7px 14px", borderRadius: 7,
                    background: "var(--accent)", color: "#fff",
                    border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 500, fontFamily: "inherit"
                }}>
                    + Nuevo proyecto
                </button>
            </div>

            {/* Búsqueda */}
            <div style={{
                background: "var(--surface)", border: "0.5px solid var(--border)",
                borderRadius: 10, padding: "10px 14px", marginBottom: 14
            }}>
                <input
                    type="text" placeholder="Buscar proyecto..."
                    value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    style={{
                        width: "100%", padding: "6px 10px", borderRadius: 7,
                        border: "0.5px solid var(--border2)",
                        background: "var(--surface2)", color: "var(--text)",
                        fontFamily: "inherit", fontSize: 12, outline: "none"
                    }}
                />
            </div>

            {/* Lista proyectos */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filtrados.length === 0 ? (
                    <div style={{
                        background: "var(--surface)", border: "0.5px solid var(--border)",
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
                    const expandido = proyectoExpandido === p.id

                    return (
                        <div key={p.id} style={{
                            background: "var(--surface)",
                            border: "0.5px solid var(--border)",
                            borderRadius: 10, overflow: "hidden"
                        }}>
                            {/* Header */}
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
                                        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text)" }}>
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
                                        <div style={{ fontSize: 11, color: "var(--accent)", fontStyle: "italic", marginTop: 3 }}>
                                            "{p.slogan}"
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                                    <button onClick={() => abrirEditar(p)} style={{
                                        width: 28, height: 28, borderRadius: 6,
                                        border: "0.5px solid var(--border2)",
                                        background: "var(--surface2)", cursor: "pointer",
                                        display: "flex", alignItems: "center",
                                        justifyContent: "center", fontSize: 12, color: "var(--text2)"
                                    }}>✎</button>
                                    <button onClick={() => eliminar(p.id)} style={{
                                        width: 28, height: 28, borderRadius: 6,
                                        border: "0.5px solid var(--border2)",
                                        background: "var(--surface2)", cursor: "pointer",
                                        display: "flex", alignItems: "center",
                                        justifyContent: "center", fontSize: 12, color: "var(--text2)"
                                    }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLElement).style.background = "var(--srb)"
                                            ;(e.currentTarget as HTMLElement).style.color = "var(--sr)"
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLElement).style.background = "var(--surface2)"
                                            ;(e.currentTarget as HTMLElement).style.color = "var(--text2)"
                                        }}
                                    >✕</button>
                                </div>
                            </div>

                            {/* Stats */}
                            <div style={{ padding: "12px 18px", display: "flex", flexWrap: "wrap", gap: 20 }}>
                                <div>
                                    <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500 }}>Precio desde</div>
                                    <div style={{ fontSize: 16, fontWeight: 500, color: "var(--accent)", fontFamily: "'DM Serif Display', serif", marginTop: 2 }}>
                                        ${Number(p.precio_desde || 0).toLocaleString("es-EC")}
                                    </div>
                                </div>
                                {p.precio_hasta && (
                                    <div>
                                        <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500 }}>Hasta</div>
                                        <div style={{ fontSize: 16, fontWeight: 500, color: "var(--accent)", fontFamily: "'DM Serif Display', serif", marginTop: 2 }}>
                                            ${Number(p.precio_hasta).toLocaleString("es-EC")}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500 }}>Unidades</div>
                                    <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text)", fontFamily: "'DM Serif Display', serif", marginTop: 2 }}>
                                        {p.total_unidades}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500 }}>Consultas bot</div>
                                    <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text)", fontFamily: "'DM Serif Display', serif", marginTop: 2 }}>
                                        {p.total_consultas || 0}
                                    </div>
                                </div>
                                {p.slug && (
                                    <div>
                                        <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500 }}>Link bot</div>
                                        <div style={{ fontSize: 12, color: "var(--sb)", marginTop: 2, fontFamily: "monospace" }}>{p.slug}</div>
                                    </div>
                                )}
                            </div>

                            {/* Amenidades */}
                            {amenidades.length > 0 && (
                                <div style={{ padding: "0 18px 12px", display: "flex", flexWrap: "wrap", gap: 5 }}>
                                    {amenidades.map((a: string) => (
                                        <span key={a} style={{
                                            padding: "2px 8px", borderRadius: 20, fontSize: 10,
                                            fontWeight: 500, background: "var(--surface2)",
                                            color: "var(--text3)", border: "0.5px solid var(--border)"
                                        }}>
                                            {a.replace(/_/g, " ")}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Footer */}
                            <div style={{
                                padding: "10px 18px", borderTop: "0.5px solid var(--border)",
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
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button
                                        onClick={() => abrirNuevaUnidad(p.id)}
                                        style={{
                                            padding: "5px 12px", borderRadius: 7,
                                            background: "var(--accent)", color: "#fff",
                                            border: "none", cursor: "pointer",
                                            fontSize: 12, fontFamily: "inherit"
                                        }}
                                    >
                                        + Unidad
                                    </button>
                                    <button
                                        onClick={() => cargarUnidades(p.id)}
                                        style={{
                                            padding: "5px 12px", borderRadius: 7,
                                            border: "0.5px solid var(--border2)",
                                            background: "var(--surface2)", cursor: "pointer",
                                            fontSize: 12, color: "var(--text2)", fontFamily: "inherit"
                                        }}
                                    >
                                        {expandido ? "Ocultar ▲" : `Ver ${p.total_unidades} unidad(es) ▼`}
                                    </button>
                                </div>
                            </div>

                            {/* Unidades expandidas */}
                            {expandido && (
                                <div style={{ borderTop: "0.5px solid var(--border)", background: "var(--surface2)" }}>
                                    {!unidades[p.id] ? (
                                        <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text3)" }}>
                                            Cargando...
                                        </div>
                                    ) : unidades[p.id].length === 0 ? (
                                        <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text3)" }}>
                                            Sin unidades.{" "}
                                            <span
                                                onClick={() => abrirNuevaUnidad(p.id)}
                                                style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 500 }}
                                            >
                                                + Agregar primera
                                            </span>
                                        </div>
                                    ) : (
                                        <div style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                                            gap: 10, padding: 14
                                        }}>
                                            {unidades[p.id].map(u => (
                                                <div key={u.id} style={{
                                                    background: "var(--surface)",
                                                    border: "0.5px solid var(--border)",
                                                    borderRadius: 8, overflow: "hidden"
                                                }}>
                                                    <div style={{
                                                        height: 70, background: "var(--surface3)",
                                                        display: "flex", alignItems: "center",
                                                        justifyContent: "center", fontSize: 24,
                                                        overflow: "hidden"
                                                    }}>
                                                        {u.fotos?.length > 0
                                                            ? <img src={u.fotos[0]} alt={u.nombre}
                                                                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                            : "🏠"
                                                        }
                                                    </div>
                                                    <div style={{ padding: "8px 10px" }}>
                                                        <div style={{
                                                            fontSize: 12, fontWeight: 500, color: "var(--text)",
                                                            marginBottom: 2, whiteSpace: "nowrap",
                                                            overflow: "hidden", textOverflow: "ellipsis"
                                                        }}>
                                                            {u.nombre}
                                                        </div>
                                                        <div style={{
                                                            fontSize: 13, fontWeight: 500,
                                                            color: "var(--accent)",
                                                            fontFamily: "'DM Serif Display', serif"
                                                        }}>
                                                            ${Number(u.precio).toLocaleString("es-EC")}
                                                        </div>
                                                        {u.ambientes?.habitaciones && (
                                                            <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>
                                                                {u.ambientes.habitaciones} hab
                                                                {u.ambientes.banos ? ` · ${u.ambientes.banos} baños` : ""}
                                                            </div>
                                                        )}
                                                        <div style={{
                                                            display: "flex", alignItems: "center",
                                                            justifyContent: "space-between",
                                                            marginTop: 8, paddingTop: 6,
                                                            borderTop: "0.5px solid var(--border)"
                                                        }}>
                                                            <span style={{
                                                                padding: "1px 6px", borderRadius: 20,
                                                                fontSize: 9, fontWeight: 500,
                                                                background: u.estado === "disponible" ? "var(--sgb)" : "var(--sab)",
                                                                color: u.estado === "disponible" ? "var(--sg)" : "var(--sa)"
                                                            }}>
                                                                {u.estado}
                                                            </span>
                                                            <div style={{ display: "flex", gap: 3 }}>
                                                                <button
                                                                    onClick={() => abrirEditarUnidad(u, p.id)}
                                                                    style={{
                                                                        width: 22, height: 22, borderRadius: 5,
                                                                        border: "0.5px solid var(--border2)",
                                                                        background: "var(--surface2)", cursor: "pointer",
                                                                        display: "flex", alignItems: "center",
                                                                        justifyContent: "center", fontSize: 10, color: "var(--text2)"
                                                                    }}
                                                                >✎</button>
                                                                <button
                                                                    onClick={() => eliminarUnidad(u.id, p.id)}
                                                                    style={{
                                                                        width: 22, height: 22, borderRadius: 5,
                                                                        border: "0.5px solid var(--border2)",
                                                                        background: "var(--surface2)", cursor: "pointer",
                                                                        display: "flex", alignItems: "center",
                                                                        justifyContent: "center", fontSize: 10, color: "var(--text2)"
                                                                    }}
                                                                    onMouseEnter={e => {
                                                                        (e.currentTarget as HTMLElement).style.background = "var(--srb)"
                                                                        ;(e.currentTarget as HTMLElement).style.color = "var(--sr)"
                                                                    }}
                                                                    onMouseLeave={e => {
                                                                        (e.currentTarget as HTMLElement).style.background = "var(--surface2)"
                                                                        ;(e.currentTarget as HTMLElement).style.color = "var(--text2)"
                                                                    }}
                                                                >✕</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* MODAL PROYECTO */}
            {modal && (
                <div
                    style={{
                        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
                        zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center"
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
                >
                    <div style={{
                        background: "var(--surface)", borderRadius: "14px 14px 0 0",
                        width: "100%", maxWidth: 600, maxHeight: "90vh",
                        overflowY: "auto", padding: 24
                    }}>
                        <div style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between", marginBottom: 20
                        }}>
                            <div style={{ fontSize: 18, fontWeight: 500, color: "var(--text)", fontFamily: "'DM Serif Display', serif" }}>
                                {modal === "nuevo" ? "Nuevo proyecto" : "Editar proyecto"}
                            </div>
                            <button onClick={() => setModal(null)} style={{
                                padding: "4px 10px", borderRadius: 6,
                                border: "0.5px solid var(--border2)",
                                background: "var(--surface2)", cursor: "pointer",
                                fontSize: 11, color: "var(--text3)", fontFamily: "inherit"
                            }}>✕ cerrar</button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                            <Campo label="Formas de pago">
                                <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
                                    {FORMAS_PAGO.map(f => (
                                        <label key={f} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
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
                            <Campo label="Amenidades">
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, paddingTop: 4 }}>
                                    {AMENIDADES_LISTA.map(a => (
                                        <label key={a} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
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
                            <Campo label="Descripción">
                                <textarea value={form.descripcion}
                                    onChange={e => setForm((p: any) => ({ ...p, descripcion: e.target.value }))}
                                    placeholder="Describe el proyecto..." rows={3} />
                            </Campo>
                            <Campo label="Sitio web (opcional)">
                                <input type="text" value={form.sitio_web}
                                    onChange={e => setForm((p: any) => ({ ...p, sitio_web: e.target.value }))}
                                    placeholder="https://miproyecto.com" />
                            </Campo>
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
                                <button onClick={() => setModal(null)} style={{
                                    padding: "8px 16px", borderRadius: 7,
                                    border: "0.5px solid var(--border2)",
                                    background: "var(--surface2)", cursor: "pointer",
                                    fontSize: 13, color: "var(--text)", fontFamily: "inherit"
                                }}>Cancelar</button>
                                <button onClick={guardar} disabled={guardando} style={{
                                    padding: "8px 20px", borderRadius: 7,
                                    background: "var(--accent)", color: "#fff",
                                    border: "none", cursor: "pointer",
                                    fontSize: 13, fontWeight: 500, fontFamily: "inherit",
                                    opacity: guardando ? 0.6 : 1
                                }}>
                                    {guardando ? "Guardando..." : "Guardar proyecto"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL UNIDAD */}
            {modalUnidad && (
                <div
                    style={{
                        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
                        zIndex: 70, display: "flex", alignItems: "flex-end", justifyContent: "center"
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setModalUnidad(null) }}
                >
                    <div style={{
                        background: "var(--surface)", borderRadius: "14px 14px 0 0",
                        width: "100%", maxWidth: 600, maxHeight: "90vh",
                        overflowY: "auto", padding: 24
                    }}>
                        <div style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between", marginBottom: 20
                        }}>
                            <div style={{ fontSize: 18, fontWeight: 500, color: "var(--text)", fontFamily: "'DM Serif Display', serif" }}>
                                {modalUnidad === "nueva" ? "Nueva unidad" : "Editar unidad"}
                                <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 400, marginLeft: 8 }}>
                                    {proyectos.find(p => p.id === proyectoIdActivo)?.nombre}
                                </span>
                            </div>
                            <button onClick={() => setModalUnidad(null)} style={{
                                padding: "4px 10px", borderRadius: 6,
                                border: "0.5px solid var(--border2)",
                                background: "var(--surface2)", cursor: "pointer",
                                fontSize: 11, color: "var(--text3)", fontFamily: "inherit"
                            }}>✕ cerrar</button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            <Campo label="Nombre de la unidad">
                                <input type="text" value={formUnidad.nombre}
                                    onChange={e => setFormUnidad((p: any) => ({ ...p, nombre: e.target.value }))}
                                    placeholder="Ej: Casa Modelo A — 3 Habitaciones" />
                            </Campo>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                                <Campo label="Tipo">
                                    <select value={formUnidad.tipo_propiedad}
                                        onChange={e => setFormUnidad((p: any) => ({ ...p, tipo_propiedad: e.target.value }))}>
                                        {TIPOS_UNIDAD.map(t => (
                                            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo label="Precio ($)">
                                    <input type="number" value={formUnidad.precio}
                                        onChange={e => setFormUnidad((p: any) => ({ ...p, precio: e.target.value }))}
                                        placeholder="98000" />
                                </Campo>
                                <Campo label="Estado">
                                    <select value={formUnidad.estado}
                                        onChange={e => setFormUnidad((p: any) => ({ ...p, estado: e.target.value }))}>
                                        {ESTADOS_UNIDAD.map(s => (
                                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                        ))}
                                    </select>
                                </Campo>
                            </div>

                            <Campo label="Formas de pago">
                                <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
                                    {FORMAS_PAGO.map(f => (
                                        <label key={f} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                                            <input type="checkbox"
                                                checked={formUnidad.tipo_pago.includes(f)}
                                                onChange={() => togglePagoUnidad(f)}
                                                style={{ accentColor: "var(--accent)" }}
                                            />
                                            {f.charAt(0).toUpperCase() + f.slice(1)}
                                        </label>
                                    ))}
                                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                                        <input type="checkbox"
                                            checked={formUnidad.precio_negociable}
                                            onChange={e => setFormUnidad((p: any) => ({ ...p, precio_negociable: e.target.checked }))}
                                            style={{ accentColor: "var(--accent)" }}
                                        />
                                        Negociable
                                    </label>
                                </div>
                            </Campo>

                            {/* Dimensiones */}
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
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
                                                value={formUnidad.dimensiones[f.k] || ""}
                                                onChange={e => setFormUnidad((p: any) => ({
                                                    ...p, dimensiones: { ...p.dimensiones, [f.k]: e.target.value }
                                                }))}
                                            />
                                        </Campo>
                                    ))}
                                </div>
                            </div>

                            {/* Ambientes */}
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
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
                                                value={formUnidad.ambientes[f.k] || ""}
                                                onChange={e => setFormUnidad((p: any) => ({
                                                    ...p, ambientes: { ...p.ambientes, [f.k]: e.target.value }
                                                }))}
                                            />
                                        </Campo>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                                    {["sala", "comedor", "cocina", "estudio"].map(k => (
                                        <label key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                                            <input type="checkbox"
                                                checked={!!formUnidad.ambientes[k]}
                                                onChange={e => setFormUnidad((p: any) => ({
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
                                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
                                    Extras
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                                    {[
                                        { grupo: "exteriores", k: "patio", label: "Patio" },
                                        { grupo: "exteriores", k: "jardin", label: "Jardín" },
                                        { grupo: "exteriores", k: "terraza", label: "Terraza" },
                                        { grupo: "exteriores", k: "balcon", label: "Balcón" },
                                        { grupo: "exteriores", k: "piscina", label: "Piscina" },
                                        { grupo: "estacionamiento", k: "cubierto", label: "Garaje cubierto" },
                                        { grupo: "estacionamiento", k: "bodega", label: "Bodega" },
                                        { grupo: "extras", k: "amoblado", label: "Amoblado" },
                                        { grupo: "extras", k: "ascensor", label: "Ascensor" },
                                        { grupo: "seguridad", k: "conjunto_cerrado", label: "Conjunto cerrado" },
                                        { grupo: "seguridad", k: "guardianía", label: "Guardianía" },
                                        { grupo: "seguridad", k: "camara_seguridad", label: "Cámaras" },
                                    ].map(f => (
                                        <label key={`${f.grupo}-${f.k}`} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                                            <input type="checkbox"
                                                checked={!!formUnidad[f.grupo]?.[f.k]}
                                                onChange={e => setFormUnidad((p: any) => ({
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
                                    value={formUnidad.estacionamiento?.estacionamientos || ""}
                                    onChange={e => setFormUnidad((p: any) => ({
                                        ...p, estacionamiento: { ...p.estacionamiento, estacionamientos: e.target.value }
                                    }))}
                                    placeholder="0" style={{ maxWidth: 100 }}
                                />
                            </Campo>

                            <Campo label="Descripción">
                                <textarea value={formUnidad.descripcion}
                                    onChange={e => setFormUnidad((p: any) => ({ ...p, descripcion: e.target.value }))}
                                    placeholder="Describe la unidad..." rows={2} />
                            </Campo>

                            <Campo label="Fotos">
                                <FotoUploader
                                    fotosIniciales={unidadActual?.fotos || []}
                                    fotos={formUnidad.fotos || []}
                                    onChange={fotos => setFormUnidad((p: any) => ({ ...p, fotos }))}
                                />
                            </Campo>

                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
                                <button onClick={() => setModalUnidad(null)} style={{
                                    padding: "8px 16px", borderRadius: 7,
                                    border: "0.5px solid var(--border2)",
                                    background: "var(--surface2)", cursor: "pointer",
                                    fontSize: 13, color: "var(--text)", fontFamily: "inherit"
                                }}>Cancelar</button>
                                <button onClick={guardarUnidad} disabled={guardandoUnidad} style={{
                                    padding: "8px 20px", borderRadius: 7,
                                    background: "var(--accent)", color: "#fff",
                                    border: "none", cursor: "pointer",
                                    fontSize: 13, fontWeight: 500, fontFamily: "inherit",
                                    opacity: guardandoUnidad ? 0.6 : 1
                                }}>
                                    {guardandoUnidad ? "Guardando..." : "Guardar unidad"}
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