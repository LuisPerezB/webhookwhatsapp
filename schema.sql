-- =========================
-- ENUMS
-- =========================

CREATE TYPE tipo_operacion_enum AS ENUM ('venta', 'alquiler');

CREATE TYPE estado_propiedad_enum AS ENUM (
    'disponible',
    'inactivo',
    'vendida'
);

CREATE TYPE estado_proyecto_enum AS ENUM (
    'activo',
    'inactivo',
    'agotado'
);

CREATE TYPE estado_reserva_enum AS ENUM (
    'pendiente',
    'confirmada',
    'cancelada'
);

CREATE TYPE modo_chat_enum AS ENUM (
    'automatico',
    'manual',
    'pausado'
);

CREATE TYPE origen_mensaje_enum AS ENUM (
    'cliente',
    'bot',
    'agente'
);

CREATE TYPE tipo_notificacion_enum AS ENUM (
    'modo_manual',
    'bot_no_entendio',
    'cita_nueva',
    'cita_cancelada',
    'lead_nuevo'
);

CREATE TYPE tipo_comando_enum AS ENUM (
    'modo_manual',
    'modo_auto',
    'citas_hoy',
    'leads_hoy',
    'pausar',
    'reanudar'
);

CREATE TYPE tipo_propiedad_enum AS ENUM (
    'casa',
    'departamento',
    'terreno',
    'comercial',
    'oficina',
    'proyecto_inmobiliario'
);

-- =========================
-- UBICACIÓN GEOGRÁFICA
-- =========================

CREATE TABLE provincias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    codigo VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE ciudades (
    id SERIAL PRIMARY KEY,
    provincia_id INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (provincia_id) REFERENCES provincias(id) ON DELETE CASCADE,
    UNIQUE (provincia_id, nombre)
);

CREATE TABLE sectores (
    id SERIAL PRIMARY KEY,
    ciudad_id INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (ciudad_id) REFERENCES ciudades(id) ON DELETE CASCADE,
    UNIQUE (ciudad_id, nombre)
);

-- =========================
-- TENANTS
-- =========================

CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);

-- =========================
-- TENANT CONFIG
-- =========================

CREATE TABLE tenant_config (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL UNIQUE,

    config JSONB DEFAULT '{
        "bot_activo": true,
        "tiempo_inactividad_min": 15,
        "tiempo_manual_min": 15,
        "permite_proyectos": true,
        "permite_asesor": true,
        "intentos_cedula_max": 2,
        "validar_cedula_rc": true,
        "dias_max_cita": 7,
        "saludo": "Hola, bienvenido. ¿En qué puedo ayudarte?",
        "mensaje_despedida": "Que tengas un excelente día 🌟",
        "modo_global": "automatico",
        "bot_control_numbers": [],
        "notificar_lead_nuevo": true,
        "notificar_cita_nueva": true,
        "horario_atencion": {
            "inicio": "08:00",
            "fin": "18:00",
            "dias": ["lunes","martes","miercoles","jueves","viernes"]
        }
    }'::jsonb,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- =========================
-- WHATSAPP NUMBERS
-- =========================

CREATE TABLE whatsapp_numbers (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    phone_number_id TEXT NOT NULL UNIQUE,
    numero TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- =========================
-- USERS
-- =========================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,

    username VARCHAR(255) NOT NULL,
    nombres_completos VARCHAR(255) NOT NULL,
    ruc_ci VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    celular VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    rol VARCHAR(20) DEFAULT 'agente' CHECK (rol IN ('admin', 'agente')),

    suscription_plan VARCHAR(50) DEFAULT 'free',
    suscription_start TIMESTAMP,
    suscription_end TIMESTAMP,
    suscription_status VARCHAR(20) DEFAULT 'inactive',
    suscription_type VARCHAR(20) DEFAULT 'monthly',
    paid_until TIMESTAMP,

    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,

    UNIQUE (tenant_id, username),
    UNIQUE (tenant_id, email),
    UNIQUE (tenant_id, ruc_ci)
);

-- =========================
-- CLIENTES (GLOBAL)
-- =========================

CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,

    nombres_completos VARCHAR(255) NOT NULL,
    ruc_ci VARCHAR(20) UNIQUE,
    celular VARCHAR(20) NOT NULL UNIQUE,
    celular_alternativo VARCHAR(20),
    email VARCHAR(255) UNIQUE,

    verificado BOOLEAN DEFAULT FALSE,
    verificado_at TIMESTAMP,

    reporta_spam BOOLEAN DEFAULT FALSE,
    spam_count INTEGER DEFAULT 0,
    bloqueado BOOLEAN DEFAULT FALSE,
    bloqueado_at TIMESTAMP,
    bloqueado_motivo TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);

-- =========================
-- CLIENTE_TENANTS
-- =========================

CREATE TABLE cliente_tenants (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,

    activo BOOLEAN DEFAULT TRUE,
    consentimiento BOOLEAN DEFAULT FALSE,
    consentimiento_at TIMESTAMP,
    primer_contacto TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_contacto TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- { "notas": "...", "etiquetas": ["interesado", "cita agendada"] }
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,

    UNIQUE (cliente_id, tenant_id)
);

-- =========================
-- PROYECTOS
-- =========================

CREATE TABLE proyectos (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,

    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    slogan VARCHAR(255),

    -- Ubicación referenciada
    provincia_id INTEGER,
    ciudad_id INTEGER,
    sector_id INTEGER,
    direccion TEXT,
    coordenadas JSONB,
    -- { "lat": -2.1234, "lng": -79.8765 }

    fotos JSONB,
    videos JSONB,
    brochure_url TEXT,
    tour_virtual_url TEXT,

    precio_desde DECIMAL(12,2),
    precio_hasta DECIMAL(12,2),

    -- Array de formas de pago aceptadas
    -- ["contado", "financiamiento", "biess"]
    tipo_pago TEXT[] NOT NULL DEFAULT '{}',
    CONSTRAINT check_tipo_pago_proyecto CHECK (
        tipo_pago <@ ARRAY['contado','financiamiento','biess']::TEXT[]
    ),

    estado estado_proyecto_enum DEFAULT 'activo',

    fecha_inicio_obra DATE,
    fecha_entrega_estimada DATE,

    -- Amenidades del proyecto
    -- ["piscina","gimnasio","bbq","seguridad_24h","parqueadero_visitas"]
    amenidades JSONB,

    total_consultas INTEGER DEFAULT 0,
    sitio_web VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (provincia_id) REFERENCES provincias(id) ON DELETE SET NULL,
    FOREIGN KEY (ciudad_id) REFERENCES ciudades(id) ON DELETE SET NULL,
    FOREIGN KEY (sector_id) REFERENCES sectores(id) ON DELETE SET NULL
);

-- =========================
-- PROPIEDADES
-- =========================

CREATE TABLE propiedades (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    proyecto_id INTEGER,

    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,

    -- Ubicación referenciada
    provincia_id INTEGER,
    ciudad_id INTEGER,
    sector_id INTEGER,
    direccion TEXT,
    coordenadas JSONB,

    fotos JSONB,
    videos JSONB,
    tour_virtual_url TEXT,

    precio DECIMAL(12,2),
    precio_negociable BOOLEAN DEFAULT FALSE,

    tipo_operacion tipo_operacion_enum NOT NULL,
    tipo_propiedad tipo_propiedad_enum NOT NULL,

    -- Array de formas de pago aceptadas
    -- ["contado", "financiamiento", "biess"]
    tipo_pago TEXT[] NOT NULL DEFAULT '{}',
    CONSTRAINT check_tipo_pago_propiedad CHECK (
        tipo_pago <@ ARRAY['contado','financiamiento','biess']::TEXT[]
    ),

    estado estado_propiedad_enum DEFAULT 'disponible',

    -- =========================
    -- CARACTERÍSTICAS COMO JSONB
    -- Permite filtro por cualquier parámetro
    -- =========================

    -- Dimensiones y tamaño
    -- {
    --   "m2_construccion": 120,
    --   "m2_terreno": 200,
    --   "m2_total": 320,
    --   "pisos": 2,
    --   "piso_ubicacion": 4       (para depas)
    -- }
    dimensiones JSONB DEFAULT '{}'::jsonb,

    -- Ambientes
    -- {
    --   "habitaciones": 3,
    --   "banos": 2,
    --   "medios_banos": 1,
    --   "sala": true,
    --   "comedor": true,
    --   "cocina": true,
    --   "estudio": false,
    --   "cuarto_servicio": false
    -- }
    ambientes JSONB DEFAULT '{}'::jsonb,

    -- Espacios exteriores
    -- {
    --   "patio": true,
    --   "jardin": true,
    --   "terraza": false,
    --   "balcon": false,
    --   "piscina": false,
    --   "bbq": false
    -- }
    exteriores JSONB DEFAULT '{}'::jsonb,

    -- Estacionamiento
    -- {
    --   "estacionamientos": 2,
    --   "cubierto": true,
    --   "bodega": true
    -- }
    estacionamiento JSONB DEFAULT '{}'::jsonb,

    -- Servicios básicos
    -- {
    --   "agua": true,
    --   "luz": true,
    --   "gas": true,
    --   "alcantarillado": true,
    --   "internet": true,
    --   "tv_cable": false
    -- }
    servicios JSONB DEFAULT '{}'::jsonb,

    -- Seguridad
    -- {
    --   "guardianía": false,
    --   "camara_seguridad": false,
    --   "alarma": false,
    --   "cerca_electrica": false,
    --   "conjunto_cerrado": false
    -- }
    seguridad JSONB DEFAULT '{}'::jsonb,

    -- Extras / adicionales libres
    -- {
    --   "amoblado": false,
    --   "ascensor": false,
    --   "generador": false,
    --   "cisterna": false,
    --   "panel_solar": false,
    --   "topografia": "plano"    (para terrenos)
    -- }
    extras JSONB DEFAULT '{}'::jsonb,

    sitio_web VARCHAR(255),
    total_consultas INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE SET NULL,
    FOREIGN KEY (provincia_id) REFERENCES provincias(id) ON DELETE SET NULL,
    FOREIGN KEY (ciudad_id) REFERENCES ciudades(id) ON DELETE SET NULL,
    FOREIGN KEY (sector_id) REFERENCES sectores(id) ON DELETE SET NULL
);

-- =========================
-- LINKS
-- Un link único por tenant + propiedad/proyecto
-- =========================

CREATE TABLE links (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,

    tipo VARCHAR(20) NOT NULL CHECK (tipo IN (
        'propiedad',
        'proyecto',
        'catalogo'
    )),

    propiedad_id INTEGER,
    proyecto_id INTEGER,

    -- formato: {tipo}-{tenant_id}-{id}
    -- ejemplo: propiedad-1-4
    slug TEXT NOT NULL UNIQUE,

    parametros JSONB DEFAULT '{}'::jsonb,
    activo BOOLEAN DEFAULT TRUE,
    clicks INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (propiedad_id) REFERENCES propiedades(id) ON DELETE CASCADE,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,

    UNIQUE (tenant_id, propiedad_id),
    UNIQUE (tenant_id, proyecto_id)
);

-- =========================
-- HORARIOS DISPONIBLES
-- =========================

CREATE TABLE horarios_disponibles (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,

    propiedad_id INTEGER,
    proyecto_id INTEGER,

    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    disponible BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (propiedad_id) REFERENCES propiedades(id) ON DELETE CASCADE,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,

    CONSTRAINT check_horario_target CHECK (
        (propiedad_id IS NOT NULL AND proyecto_id IS NULL) OR
        (propiedad_id IS NULL AND proyecto_id IS NOT NULL)
    ),

    UNIQUE (propiedad_id, fecha, hora_inicio),
    UNIQUE (proyecto_id, fecha, hora_inicio)
);

-- =========================
-- RESERVAS
-- =========================

CREATE TABLE reservas (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    horario_id INTEGER,

    propiedad_id INTEGER,
    proyecto_id INTEGER,

    fecha TIMESTAMP NOT NULL,
    fecha_reserva TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado estado_reserva_enum DEFAULT 'pendiente',
    notas TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    CONSTRAINT check_reserva_target CHECK (
        (propiedad_id IS NOT NULL AND proyecto_id IS NULL) OR
        (propiedad_id IS NULL AND proyecto_id IS NOT NULL)
    ),

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (propiedad_id) REFERENCES propiedades(id) ON DELETE CASCADE,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
    FOREIGN KEY (horario_id) REFERENCES horarios_disponibles(id) ON DELETE SET NULL
);

-- =========================
-- CHAT SESIONES
-- =========================

CREATE TABLE chat_sesiones (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    cliente_id INTEGER,

    contenido JSONB NOT NULL DEFAULT '{"step": "inicio"}'::jsonb,
    modo modo_chat_enum DEFAULT 'automatico',
    agente_id INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    FOREIGN KEY (agente_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =========================
-- MENSAJES
-- =========================

CREATE TABLE mensajes (
    id SERIAL PRIMARY KEY,
    sesion_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,

    origen origen_mensaje_enum NOT NULL,
    contenido TEXT NOT NULL,
    whatsapp_message_id TEXT,
    leido BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (sesion_id) REFERENCES chat_sesiones(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- =========================
-- NOTIFICACIONES
-- =========================

CREATE TABLE notificaciones (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    sesion_id INTEGER NOT NULL,

    tipo tipo_notificacion_enum NOT NULL,
    mensaje TEXT,
    leida BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (sesion_id) REFERENCES chat_sesiones(id) ON DELETE CASCADE
);

-- =========================
-- BOT COMANDOS
-- =========================

CREATE TABLE bot_comandos (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,

    comando tipo_comando_enum NOT NULL,
    parametro TEXT,
    resultado TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================
-- INDEXES
-- =========================

-- Ubicación
CREATE INDEX idx_ciudades_provincia ON ciudades(provincia_id);
CREATE INDEX idx_sectores_ciudad ON sectores(ciudad_id);

-- Tenants
CREATE INDEX idx_tenants_activo ON tenants(activo);
CREATE INDEX idx_tenant_config_tenant ON tenant_config(tenant_id);

-- Clientes
CREATE INDEX idx_clientes_celular ON clientes(celular);
CREATE INDEX idx_clientes_celular_alt ON clientes(celular_alternativo);
CREATE INDEX idx_clientes_ruc ON clientes(ruc_ci);
CREATE INDEX idx_clientes_verificado ON clientes(verificado);
CREATE INDEX idx_clientes_bloqueado ON clientes(bloqueado);

-- Cliente_tenants
CREATE INDEX idx_cliente_tenants_cliente ON cliente_tenants(cliente_id);
CREATE INDEX idx_cliente_tenants_tenant ON cliente_tenants(tenant_id);
CREATE INDEX idx_cliente_tenants_ultimo ON cliente_tenants(ultimo_contacto DESC);

-- Proyectos
CREATE INDEX idx_proyectos_tenant ON proyectos(tenant_id);
CREATE INDEX idx_proyectos_provincia ON proyectos(provincia_id);
CREATE INDEX idx_proyectos_ciudad ON proyectos(ciudad_id);
CREATE INDEX idx_proyectos_sector ON proyectos(sector_id);
CREATE INDEX idx_proyectos_estado ON proyectos(estado);

-- Propiedades — filtros principales del chatbot
CREATE INDEX idx_propiedades_tenant ON propiedades(tenant_id);
CREATE INDEX idx_propiedades_proyecto ON propiedades(proyecto_id);
CREATE INDEX idx_propiedades_tipo ON propiedades(tipo_propiedad);
CREATE INDEX idx_propiedades_operacion ON propiedades(tipo_operacion);
CREATE INDEX idx_propiedades_estado ON propiedades(estado);
CREATE INDEX idx_propiedades_provincia ON propiedades(provincia_id);
CREATE INDEX idx_propiedades_ciudad ON propiedades(ciudad_id);
CREATE INDEX idx_propiedades_sector ON propiedades(sector_id);
CREATE INDEX idx_propiedades_precio ON propiedades(precio);

-- Indexes JSONB para filtros de características
CREATE INDEX idx_propiedades_dimensiones ON propiedades USING GIN (dimensiones);
CREATE INDEX idx_propiedades_ambientes ON propiedades USING GIN (ambientes);
CREATE INDEX idx_propiedades_exteriores ON propiedades USING GIN (exteriores);
CREATE INDEX idx_propiedades_estacionamiento ON propiedades USING GIN (estacionamiento);
CREATE INDEX idx_propiedades_servicios ON propiedades USING GIN (servicios);
CREATE INDEX idx_propiedades_seguridad ON propiedades USING GIN (seguridad);
CREATE INDEX idx_propiedades_extras ON propiedades USING GIN (extras);

-- Index para tipo_pago array
CREATE INDEX idx_propiedades_tipo_pago ON propiedades USING GIN (tipo_pago);
CREATE INDEX idx_proyectos_tipo_pago ON proyectos USING GIN (tipo_pago);

-- Links
CREATE INDEX idx_links_slug ON links(slug);
CREATE INDEX idx_links_tenant ON links(tenant_id);
CREATE INDEX idx_links_tipo ON links(tipo);

-- Horarios
CREATE INDEX idx_horarios_propiedad ON horarios_disponibles(propiedad_id);
CREATE INDEX idx_horarios_proyecto ON horarios_disponibles(proyecto_id);
CREATE INDEX idx_horarios_fecha ON horarios_disponibles(fecha);
CREATE INDEX idx_horarios_disponible ON horarios_disponibles(disponible);

-- Reservas
CREATE INDEX idx_reservas_tenant ON reservas(tenant_id);
CREATE INDEX idx_reservas_cliente ON reservas(cliente_id);
CREATE INDEX idx_reservas_propiedad ON reservas(propiedad_id);
CREATE INDEX idx_reservas_proyecto ON reservas(proyecto_id);
CREATE INDEX idx_reservas_fecha ON reservas(fecha);
CREATE INDEX idx_reservas_estado ON reservas(estado);

-- Chat sesiones
CREATE INDEX idx_chat_tenant ON chat_sesiones(tenant_id);
CREATE INDEX idx_chat_cliente ON chat_sesiones(cliente_id);
CREATE INDEX idx_chat_modo ON chat_sesiones(modo);
CREATE INDEX idx_chat_updated ON chat_sesiones(updated_at DESC);

-- Mensajes
CREATE INDEX idx_mensajes_sesion ON mensajes(sesion_id);
CREATE INDEX idx_mensajes_tenant ON mensajes(tenant_id);
CREATE INDEX idx_mensajes_cliente ON mensajes(cliente_id);
CREATE INDEX idx_mensajes_created ON mensajes(created_at DESC);
CREATE INDEX idx_mensajes_leido ON mensajes(leido);

-- Notificaciones
CREATE INDEX idx_notificaciones_tenant ON notificaciones(tenant_id);
CREATE INDEX idx_notificaciones_leida ON notificaciones(leida);
CREATE INDEX idx_notificaciones_created ON notificaciones(created_at DESC);

-- Soft delete indexes
CREATE INDEX idx_tenants_deleted ON tenants(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_clientes_deleted ON clientes(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_propiedades_deleted ON propiedades(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_proyectos_deleted ON proyectos(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_links_deleted ON links(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_chat_deleted ON chat_sesiones(deleted_at) WHERE deleted_at IS NULL;

-- =========================
-- TRIGGERS: updated_at
-- =========================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated
    BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tenant_config_updated
    BEFORE UPDATE ON tenant_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clientes_updated
    BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cliente_tenants_updated
    BEFORE UPDATE ON cliente_tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_proyectos_updated
    BEFORE UPDATE ON proyectos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_propiedades_updated
    BEFORE UPDATE ON propiedades FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_reservas_updated
    BEFORE UPDATE ON reservas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_chat_updated
    BEFORE UPDATE ON chat_sesiones FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_links_updated
    BEFORE UPDATE ON links FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =========================
-- TRIGGER: bloqueo por spam
-- =========================

CREATE OR REPLACE FUNCTION check_spam_block()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.spam_count >= 3 AND OLD.bloqueado = FALSE THEN
        NEW.bloqueado := TRUE;
        NEW.bloqueado_at := NOW();
        NEW.bloqueado_motivo := 'Bloqueado automáticamente por ' ||
            NEW.spam_count || ' reportes de spam';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_spam_block
    BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION check_spam_block();

-- =========================
-- FUNCIÓN: Obtener o crear link
-- =========================

CREATE OR REPLACE FUNCTION obtener_o_crear_link(
    p_tipo TEXT,
    p_tenant_id INTEGER,
    p_propiedad_id INTEGER DEFAULT NULL,
    p_proyecto_id INTEGER DEFAULT NULL,
    p_parametros JSONB DEFAULT '{}'::jsonb
)
RETURNS TEXT AS $$
DECLARE
    v_slug TEXT;
    v_existente TEXT;
BEGIN
    IF p_propiedad_id IS NOT NULL THEN
        SELECT slug INTO v_existente
        FROM links
        WHERE tenant_id = p_tenant_id
        AND propiedad_id = p_propiedad_id
        AND deleted_at IS NULL;
    ELSE
        SELECT slug INTO v_existente
        FROM links
        WHERE tenant_id = p_tenant_id
        AND proyecto_id = p_proyecto_id
        AND deleted_at IS NULL;
    END IF;

    IF v_existente IS NOT NULL THEN
        RETURN v_existente;
    END IF;

    v_slug := p_tipo || '-' || p_tenant_id || '-' ||
              COALESCE(p_propiedad_id::TEXT, p_proyecto_id::TEXT);

    INSERT INTO links (
        tenant_id, tipo,
        propiedad_id, proyecto_id,
        slug, parametros
    ) VALUES (
        p_tenant_id, p_tipo,
        p_propiedad_id, p_proyecto_id,
        v_slug, p_parametros
    );

    RETURN v_slug;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- FUNCIÓN: Resolver link
-- =========================

CREATE OR REPLACE FUNCTION resolver_link(p_slug TEXT)
RETURNS TABLE(
    valido BOOLEAN,
    tipo TEXT,
    tenant_id INTEGER,
    propiedad_id INTEGER,
    proyecto_id INTEGER,
    parametros JSONB
) AS $$
BEGIN
    RETURN QUERY
    UPDATE links
    SET clicks = clicks + 1
    WHERE slug = p_slug
    AND activo = TRUE
    AND deleted_at IS NULL
    RETURNING
        TRUE,
        links.tipo,
        links.tenant_id,
        links.propiedad_id,
        links.proyecto_id,
        links.parametros;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT FALSE, NULL::TEXT, NULL::INTEGER,
               NULL::INTEGER, NULL::INTEGER, NULL::JSONB;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- FUNCIÓN: Soft delete
-- =========================

CREATE OR REPLACE FUNCTION soft_delete(tabla TEXT, registro_id INTEGER)
RETURNS VOID AS $$
BEGIN
    EXECUTE format(
        'UPDATE %I SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
        tabla
    ) USING registro_id;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- FUNCIÓN: Restore
-- =========================

CREATE OR REPLACE FUNCTION restore(tabla TEXT, registro_id INTEGER)
RETURNS VOID AS $$
BEGIN
    EXECUTE format(
        'UPDATE %I SET deleted_at = NULL WHERE id = $1',
        tabla
    ) USING registro_id;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- FUNCIÓN: Buscar propiedades
-- Filtra por cualquier combinación de parámetros
-- =========================

CREATE OR REPLACE FUNCTION buscar_propiedades(
    p_tenant_id INTEGER,
    p_tipo_operacion TEXT DEFAULT NULL,
    p_tipo_propiedad TEXT DEFAULT NULL,
    p_provincia_id INTEGER DEFAULT NULL,
    p_ciudad_id INTEGER DEFAULT NULL,
    p_sector_id INTEGER DEFAULT NULL,
    p_precio_min DECIMAL DEFAULT NULL,
    p_precio_max DECIMAL DEFAULT NULL,
    p_tipo_pago TEXT DEFAULT NULL,
    p_habitaciones INTEGER DEFAULT NULL,
    p_banos INTEGER DEFAULT NULL,
    p_m2_min INTEGER DEFAULT NULL,
    p_m2_max INTEGER DEFAULT NULL,
    p_patio BOOLEAN DEFAULT NULL,
    p_jardin BOOLEAN DEFAULT NULL,
    p_piscina BOOLEAN DEFAULT NULL,
    p_estacionamientos INTEGER DEFAULT NULL,
    p_ascensor BOOLEAN DEFAULT NULL,
    p_amoblado BOOLEAN DEFAULT NULL,
    p_limite INTEGER DEFAULT 5
)
RETURNS TABLE(
    id INTEGER,
    nombre TEXT,
    descripcion TEXT,
    precio DECIMAL,
    tipo_operacion TEXT,
    tipo_propiedad TEXT,
    tipo_pago TEXT[],
    ciudad_nombre TEXT,
    sector_nombre TEXT,
    provincia_nombre TEXT,
    dimensiones JSONB,
    ambientes JSONB,
    exteriores JSONB,
    estacionamiento JSONB,
    extras JSONB,
    fotos JSONB,
    sitio_web TEXT,
    slug TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.nombre::TEXT,
        p.descripcion::TEXT,
        p.precio,
        p.tipo_operacion::TEXT,
        p.tipo_propiedad::TEXT,
        p.tipo_pago,
        c.nombre::TEXT AS ciudad_nombre,
        s.nombre::TEXT AS sector_nombre,
        pr.nombre::TEXT AS provincia_nombre,
        p.dimensiones,
        p.ambientes,
        p.exteriores,
        p.estacionamiento,
        p.extras,
        p.fotos,
        p.sitio_web::TEXT,
        l.slug::TEXT
    FROM propiedades p
    LEFT JOIN ciudades c ON c.id = p.ciudad_id
    LEFT JOIN sectores s ON s.id = p.sector_id
    LEFT JOIN provincias pr ON pr.id = p.provincia_id
    LEFT JOIN links l ON l.propiedad_id = p.id AND l.tenant_id = p.tenant_id
    WHERE p.tenant_id = p_tenant_id
    AND p.estado = 'disponible'
    AND p.deleted_at IS NULL
    AND p.proyecto_id IS NULL

    -- Filtros opcionales
    AND (p_tipo_operacion IS NULL OR p.tipo_operacion::TEXT = p_tipo_operacion)
    AND (p_tipo_propiedad IS NULL OR p.tipo_propiedad::TEXT = p_tipo_propiedad)
    AND (p_provincia_id IS NULL OR p.provincia_id = p_provincia_id)
    AND (p_ciudad_id IS NULL OR p.ciudad_id = p_ciudad_id)
    AND (p_sector_id IS NULL OR p.sector_id = p_sector_id)
    AND (p_precio_min IS NULL OR p.precio >= p_precio_min)
    AND (p_precio_max IS NULL OR p.precio <= p_precio_max)
    AND (p_tipo_pago IS NULL OR p.tipo_pago @> ARRAY[p_tipo_pago]::TEXT[])
    AND (p_habitaciones IS NULL OR (p.ambientes->>'habitaciones')::INTEGER >= p_habitaciones)
    AND (p_banos IS NULL OR (p.ambientes->>'banos')::INTEGER >= p_banos)
    AND (p_m2_min IS NULL OR
        COALESCE((p.dimensiones->>'m2_construccion')::INTEGER,
                 (p.dimensiones->>'m2_total')::INTEGER, 0) >= p_m2_min)
    AND (p_m2_max IS NULL OR
        COALESCE((p.dimensiones->>'m2_construccion')::INTEGER,
                 (p.dimensiones->>'m2_total')::INTEGER, 0) <= p_m2_max)
    AND (p_patio IS NULL OR (p.exteriores->>'patio')::BOOLEAN = p_patio)
    AND (p_jardin IS NULL OR (p.exteriores->>'jardin')::BOOLEAN = p_jardin)
    AND (p_piscina IS NULL OR (p.exteriores->>'piscina')::BOOLEAN = p_piscina)
    AND (p_estacionamientos IS NULL OR
        (p.estacionamiento->>'estacionamientos')::INTEGER >= p_estacionamientos)
    AND (p_ascensor IS NULL OR (p.extras->>'ascensor')::BOOLEAN = p_ascensor)
    AND (p_amoblado IS NULL OR (p.extras->>'amoblado')::BOOLEAN = p_amoblado)

    ORDER BY p.created_at DESC
    LIMIT p_limite;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- RLS — TODAS LAS TABLAS
-- =========================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE propiedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;
ALTER TABLE horarios_disponibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_comandos ENABLE ROW LEVEL SECURITY;
ALTER TABLE provincias ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciudades ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_tenants" ON tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_tenant_config" ON tenant_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_whatsapp_numbers" ON whatsapp_numbers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_users" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_clientes" ON clientes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_cliente_tenants" ON cliente_tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_proyectos" ON proyectos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_propiedades" ON propiedades FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_links" ON links FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_horarios" ON horarios_disponibles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_reservas" ON reservas FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_chat_sesiones" ON chat_sesiones FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_mensajes" ON mensajes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_notificaciones" ON notificaciones FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bot_comandos" ON bot_comandos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_provincias" ON provincias FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_ciudades" ON ciudades FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_sectores" ON sectores FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =========================
-- VISTAS
-- =========================

CREATE VIEW catalogo AS
SELECT
    'proyecto' AS tipo_catalogo,
    p.id,
    p.tenant_id,
    p.nombre,
    p.descripcion,
    prov.nombre AS provincia,
    c.nombre AS ciudad,
    s.nombre AS sector,
    p.estado::TEXT AS estado,
    p.precio_desde AS precio,
    p.precio_hasta,
    p.tipo_pago,
    p.fotos,
    p.sitio_web,
    p.total_consultas,
    NULL::INTEGER AS proyecto_id,
    l.slug
FROM proyectos p
LEFT JOIN provincias prov ON prov.id = p.provincia_id
LEFT JOIN ciudades c ON c.id = p.ciudad_id
LEFT JOIN sectores s ON s.id = p.sector_id
LEFT JOIN links l ON l.proyecto_id = p.id AND l.tenant_id = p.tenant_id
WHERE p.estado = 'activo'
AND p.deleted_at IS NULL

UNION ALL

SELECT
    'propiedad' AS tipo_catalogo,
    pr.id,
    pr.tenant_id,
    pr.nombre,
    pr.descripcion,
    prov.nombre AS provincia,
    c.nombre AS ciudad,
    s.nombre AS sector,
    pr.estado::TEXT AS estado,
    pr.precio,
    NULL::DECIMAL AS precio_hasta,
    pr.tipo_pago,
    pr.fotos,
    pr.sitio_web,
    pr.total_consultas,
    pr.proyecto_id,
    l.slug
FROM propiedades pr
LEFT JOIN provincias prov ON prov.id = pr.provincia_id
LEFT JOIN ciudades c ON c.id = pr.ciudad_id
LEFT JOIN sectores s ON s.id = pr.sector_id
LEFT JOIN links l ON l.propiedad_id = pr.id AND l.tenant_id = pr.tenant_id
WHERE pr.proyecto_id IS NULL
AND pr.estado = 'disponible'
AND pr.deleted_at IS NULL;

CREATE VIEW dashboard_resumen AS
SELECT
    t.id AS tenant_id,
    t.nombre AS tenant_nombre,

    COUNT(DISTINCT cs.id) FILTER (
        WHERE DATE(cs.created_at) = CURRENT_DATE
    ) AS conversaciones_hoy,

    COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.created_at >= CURRENT_DATE - INTERVAL '7 days'
    ) AS conversaciones_semana,

    COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.created_at >= DATE_TRUNC('month', CURRENT_DATE)
    ) AS conversaciones_mes,

    COUNT(DISTINCT ct.cliente_id) FILTER (
        WHERE DATE(ct.primer_contacto) = CURRENT_DATE
    ) AS leads_hoy,

    COUNT(DISTINCT ct.cliente_id) FILTER (
        WHERE ct.primer_contacto >= CURRENT_DATE - INTERVAL '7 days'
    ) AS leads_semana,

    COUNT(DISTINCT r.id) FILTER (
        WHERE r.fecha >= NOW() AND r.estado = 'pendiente'
    ) AS citas_pendientes,

    COUNT(DISTINCT r.id) FILTER (
        WHERE DATE(r.fecha) = CURRENT_DATE
    ) AS citas_hoy,

    COUNT(DISTINCT r.id) FILTER (
        WHERE r.estado = 'confirmada'
        AND r.fecha >= DATE_TRUNC('month', CURRENT_DATE)
    ) AS citas_confirmadas_mes,

    COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.modo = 'manual'
    ) AS chats_esperando_agente,

    COUNT(DISTINCT n.id) FILTER (
        WHERE n.leida = FALSE
    ) AS notificaciones_sin_leer,

    COUNT(DISTINCT m.id) FILTER (
        WHERE m.leido = FALSE AND m.origen = 'cliente'
    ) AS mensajes_sin_leer

FROM tenants t
LEFT JOIN chat_sesiones cs ON cs.tenant_id = t.id AND cs.deleted_at IS NULL
LEFT JOIN cliente_tenants ct ON ct.tenant_id = t.id AND ct.deleted_at IS NULL
LEFT JOIN reservas r ON r.tenant_id = t.id AND r.deleted_at IS NULL
LEFT JOIN notificaciones n ON n.tenant_id = t.id AND n.deleted_at IS NULL
LEFT JOIN mensajes m ON m.tenant_id = t.id AND m.deleted_at IS NULL
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.nombre;

CREATE VIEW conversaciones_activas AS
SELECT
    cs.id AS sesion_id,
    cs.tenant_id,
    cs.modo,
    cs.updated_at,
    cs.agente_id,
    c.id AS cliente_id,
    c.nombres_completos AS cliente_nombre,
    c.celular AS cliente_celular,
    c.verificado AS cliente_verificado,
    m.contenido AS ultimo_mensaje,
    m.origen AS ultimo_origen,
    m.created_at AS ultimo_mensaje_at,
    COUNT(m2.id) FILTER (
        WHERE m2.leido = FALSE AND m2.origen = 'cliente'
    ) AS mensajes_pendientes
FROM chat_sesiones cs
JOIN clientes c ON c.id = cs.cliente_id AND c.deleted_at IS NULL
LEFT JOIN LATERAL (
    SELECT contenido, origen, created_at
    FROM mensajes
    WHERE sesion_id = cs.id AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
) m ON TRUE
LEFT JOIN mensajes m2 ON m2.sesion_id = cs.id AND m2.deleted_at IS NULL
WHERE cs.deleted_at IS NULL
GROUP BY cs.id, cs.tenant_id, cs.modo, cs.updated_at, cs.agente_id,
         c.id, c.nombres_completos, c.celular, c.verificado,
         m.contenido, m.origen, m.created_at
ORDER BY cs.updated_at DESC;

-- =========================
-- DATA BASE: PROVINCIAS ECUADOR
-- =========================

INSERT INTO provincias (nombre, codigo) VALUES
('Azuay', '01'),('Bolívar', '02'),('Cañar', '03'),
('Carchi', '04'),('Chimborazo', '05'),('Cotopaxi', '06'),
('El Oro', '07'),('Esmeraldas', '08'),('Galápagos', '09'),
('Guayas', '10'),('Imbabura', '11'),('Loja', '12'),
('Los Ríos', '13'),('Manabí', '14'),('Morona Santiago', '15'),
('Napo', '16'),('Orellana', '17'),('Pastaza', '18'),
('Pichincha', '19'),('Santa Elena', '20'),('Santo Domingo', '21'),
('Sucumbíos', '22'),('Tungurahua', '23'),('Zamora Chinchipe', '24');

-- Ciudades principales por provincia
INSERT INTO ciudades (provincia_id, nombre) VALUES
-- Guayas (10)
(10,'Guayaquil'),(10,'Samborondón'),(10,'Daule'),(10,'Milagro'),
(10,'Durán'),(10,'Playas'),(10,'El Triunfo'),
-- Pichincha (19)
(19,'Quito'),(19,'Cayambe'),(19,'Mejía'),(19,'Rumiñahui'),
-- Azuay (01)
(1,'Cuenca'),(1,'Gualaceo'),(1,'Paute'),
-- Manabí (14)
(14,'Manta'),(14,'Portoviejo'),(14,'Bahía de Caráquez'),(14,'Montecristi'),
-- El Oro (07)
(7,'Machala'),(7,'Huaquillas'),(7,'Pasaje'),(7,'Santa Rosa'),
-- Tungurahua (23)
(23,'Ambato'),(23,'Baños'),(23,'Pelileo'),
-- Imbabura (11)
(11,'Ibarra'),(11,'Otavalo'),(11,'Cotacachi'),
-- Loja (12)
(12,'Loja'),(12,'Catamayo'),(12,'Cariamanga'),
-- Santo Domingo (21)
(21,'Santo Domingo'),
-- Santa Elena (20)
(20,'Santa Elena'),(20,'Salinas'),(20,'La Libertad');

-- Sectores de Guayaquil
INSERT INTO sectores (ciudad_id, nombre) VALUES
(1,'Norte'),(1,'Sur'),(1,'Centro'),(1,'Oeste'),(1,'Este'),
(1,'Urdesa'),(1,'Kennedy'),(1,'Alborada'),(1,'Ceibos'),
(1,'Mapasingue'),(1,'Sauces'),(1,'Garzota'),(1,'Miraflores'),
(1,'Guasmo'),(1,'Suburbio'),(1,'Puerto Lisa'),(1,'Vía a la Costa'),
(1,'Vía a Samborondón'),(1,'Isla Mocolí'),(1,'Ciudad Celeste');

-- Sectores de Quito
INSERT INTO sectores (ciudad_id, nombre) VALUES
(8,'Norte'),(8,'Sur'),(8,'Centro Histórico'),(8,'Cumbayá'),
(8,'Tumbaco'),(8,'Valle de los Chillos'),(8,'Calderón'),
(8,'Conocoto'),(8,'La Floresta'),(8,'La Mariscal'),
(8,'Nayón'),(8,'Pomasqui'),(8,'San Antonio');

-- Sectores de Cuenca
INSERT INTO sectores (ciudad_id, nombre) VALUES
(13,'Centro Histórico'),(13,'El Vergel'),(13,'Miraflores'),
(13,'Ricaurte'),(13,'Totoracocha'),(13,'Yanuncay');