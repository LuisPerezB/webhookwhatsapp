-- =========================
-- ENUMS
-- =========================

CREATE TYPE tipo_operacion_enum AS ENUM ('venta', 'alquiler');

CREATE TYPE tipo_pago_enum AS ENUM ('contado', 'financiamiento', 'biees');

CREATE TYPE tipo_propiedad_enum AS ENUM ('casa', 'departamento', 'terreno', 'comercial', 'oficina', 'proyecto_inmobiliario');

CREATE TYPE estado_reserva_enum AS ENUM ('pendiente', 'confirmada', 'cancelada');

CREATE TYPE estado_propiedad_enum AS ENUM ('disponible', 'pendiente', 'vendida');

CREATE TYPE modo_chat_enum AS ENUM ('automatico', 'manual', 'pausado');

CREATE TYPE origen_mensaje_enum AS ENUM ('cliente', 'bot', 'agente');

CREATE TYPE tipo_notificacion_enum AS ENUM ('modo_manual', 'bot_no_entendio', 'cita_nueva', 'cita_cancelada', 'lead_nuevo');

CREATE TYPE tipo_comando_enum AS ENUM ('modo_manual', 'modo_auto', 'citas_hoy', 'leads_hoy', 'pausar', 'reanudar');


-- =========================
-- TENANTS (INMOBILIARIAS)
-- =========================

CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- TENANT CONFIG
-- Configuración completa del bot por inmobiliaria
-- =========================

CREATE TABLE tenant_config (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL UNIQUE,

    -- Config como JSONB flexible
    -- Estructura esperada:
    -- {
    --   "dias_max_cita": 7,
    --   "saludo": "Hola, soy el asistente de ...",
    --   "modo_global": "automatico",
    --   "bot_control_numbers": ["593964090970"],
    --   "notificar_lead_nuevo": true,
    --   "notificar_cita_nueva": true,
    --   "horario_atencion": {
    --     "inicio": "08:00",
    --     "fin": "18:00",
    --     "dias": ["lunes","martes","miercoles","jueves","viernes"]
    --   }
    -- }
    config JSONB DEFAULT '{
        "dias_max_cita": 7,
        "saludo": "Hola, bienvenido. ¿En qué puedo ayudarte?",
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

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- =========================
-- USERS (AGENTES / ADMINS)
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

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,

    UNIQUE (tenant_id, username),
    UNIQUE (tenant_id, email),
    UNIQUE (tenant_id, ruc_ci)
);

-- =========================
-- CLIENTES (LEADS)
-- =========================

CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    nombres_completos VARCHAR(255) NOT NULL,
    ruc_ci VARCHAR(20),
    celular VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    verificado BOOLEAN DEFAULT FALSE,
    reporta_spam BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,

    UNIQUE (tenant_id, celular),
    UNIQUE (tenant_id, ruc_ci),
    UNIQUE (tenant_id, email)
);

-- =========================
-- PROPIEDADES
-- =========================

CREATE TABLE propiedades (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,

    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,

    caracteristicas JSONB,

    ---EJEMPLO DE PROPIEDADES RELACIONADAS:
    propiedades_relacionadas JSONB,

    ciudad VARCHAR(100) NOT NULL,
    sector VARCHAR(100) NOT NULL,
    direccion TEXT,

    fotos JSONB,
    videos JSONB,

    precio DECIMAL(12,2),

    tipo_operacion tipo_operacion_enum NOT NULL,
    tipo_pago tipo_pago_enum NOT NULL,
    tipo_propiedad tipo_propiedad_enum NOT NULL,

    estado estado_propiedad_enum DEFAULT 'disponible',

    sitio_web VARCHAR(255),

    -- Contador de consultas recibidas por el chatbot
    total_consultas INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- =========================
-- HORARIOS DISPONIBLES
-- =========================

CREATE TABLE horarios_disponibles (
    id SERIAL PRIMARY KEY,
    propiedad_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,

    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,

    disponible BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (propiedad_id) REFERENCES propiedades(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,

    UNIQUE (propiedad_id, fecha, hora_inicio)
);

-- =========================
-- RESERVAS
-- =========================

CREATE TABLE reservas (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    propiedad_id INTEGER NOT NULL,
    horario_id INTEGER,

    fecha TIMESTAMP NOT NULL,
    fecha_reserva TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    estado estado_reserva_enum DEFAULT 'pendiente',

    notas TEXT,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (propiedad_id) REFERENCES propiedades(id) ON DELETE CASCADE,
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

    -- Agente asignado cuando está en modo manual
    agente_id INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    FOREIGN KEY (agente_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =========================
-- MENSAJES
-- Historial completo de conversaciones
-- =========================

CREATE TABLE mensajes (
    id SERIAL PRIMARY KEY,
    sesion_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,

    origen origen_mensaje_enum NOT NULL,
    contenido TEXT NOT NULL,

    -- ID del mensaje de WhatsApp (para referencias cruzadas con Meta)
    whatsapp_message_id TEXT,

    leido BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sesion_id) REFERENCES chat_sesiones(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- =========================
-- NOTIFICACIONES
-- Alertas para el agente en el dashboard
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

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (sesion_id) REFERENCES chat_sesiones(id) ON DELETE CASCADE
);

-- =========================
-- BOT COMANDOS
-- Registro de comandos enviados por agentes
-- via WhatsApp al bot de control
-- =========================

CREATE TABLE bot_comandos (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,

    comando tipo_comando_enum NOT NULL,
    parametro TEXT,
    resultado TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================
-- INDEXES
-- =========================

-- Propiedades
CREATE INDEX idx_propiedades_tenant ON propiedades(tenant_id);
CREATE INDEX idx_propiedades_tipo ON propiedades(tipo_propiedad);
CREATE INDEX idx_propiedades_ciudad ON propiedades(ciudad);
CREATE INDEX idx_propiedades_sector ON propiedades(sector);
CREATE INDEX idx_propiedades_estado ON propiedades(estado);
CREATE INDEX idx_propiedades_caracteristicas ON propiedades USING GIN (caracteristicas);

-- Reservas
CREATE INDEX idx_reservas_fecha ON reservas(fecha);
CREATE INDEX idx_reservas_propiedad ON reservas(propiedad_id);
CREATE INDEX idx_reservas_cliente ON reservas(cliente_id);
CREATE INDEX idx_reservas_estado ON reservas(estado);

-- Clientes
CREATE INDEX idx_clientes_tenant ON clientes(tenant_id);
CREATE INDEX idx_clientes_celular ON clientes(celular);

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

-- Horarios
CREATE INDEX idx_horarios_propiedad ON horarios_disponibles(propiedad_id);
CREATE INDEX idx_horarios_fecha ON horarios_disponibles(fecha);
CREATE INDEX idx_horarios_disponible ON horarios_disponibles(disponible);

-- =========================
-- VISTA: DASHBOARD RESUMEN
-- Carga el home del dashboard en una sola query
-- =========================

CREATE VIEW dashboard_resumen AS
SELECT
    t.id AS tenant_id,
    t.nombre AS tenant_nombre,

    -- Conversaciones
    COUNT(DISTINCT cs.id) FILTER (
        WHERE DATE(cs.created_at) = CURRENT_DATE
    ) AS conversaciones_hoy,

    COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.created_at >= CURRENT_DATE - INTERVAL '7 days'
    ) AS conversaciones_semana,

    COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.created_at >= DATE_TRUNC('month', CURRENT_DATE)
    ) AS conversaciones_mes,

    -- Leads
    COUNT(DISTINCT c.id) FILTER (
        WHERE DATE(c.created_at) = CURRENT_DATE
    ) AS leads_hoy,

    COUNT(DISTINCT c.id) FILTER (
        WHERE c.created_at >= CURRENT_DATE - INTERVAL '7 days'
    ) AS leads_semana,

    -- Citas
    COUNT(DISTINCT r.id) FILTER (
        WHERE r.fecha >= NOW()
        AND r.estado = 'pendiente'
    ) AS citas_pendientes,

    COUNT(DISTINCT r.id) FILTER (
        WHERE DATE(r.fecha) = CURRENT_DATE
    ) AS citas_hoy,

    COUNT(DISTINCT r.id) FILTER (
        WHERE r.estado = 'confirmada'
        AND r.fecha >= DATE_TRUNC('month', CURRENT_DATE)
    ) AS citas_confirmadas_mes,

    -- Chats esperando agente
    COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.modo = 'manual'
    ) AS chats_esperando_agente,

    -- Notificaciones sin leer
    COUNT(DISTINCT n.id) FILTER (
        WHERE n.leida = FALSE
    ) AS notificaciones_sin_leer,

    -- Mensajes no leídos de clientes
    COUNT(DISTINCT m.id) FILTER (
        WHERE m.leido = FALSE
        AND m.origen = 'cliente'
    ) AS mensajes_sin_leer

FROM tenants t
LEFT JOIN chat_sesiones cs ON cs.tenant_id = t.id
LEFT JOIN clientes c ON c.tenant_id = t.id
LEFT JOIN reservas r ON r.tenant_id = t.id
LEFT JOIN notificaciones n ON n.tenant_id = t.id
LEFT JOIN mensajes m ON m.tenant_id = t.id
GROUP BY t.id, t.nombre;

-- =========================
-- VISTA: CONVERSACIONES ACTIVAS
-- Para la sección de conversaciones del dashboard
-- =========================

CREATE VIEW conversaciones_activas AS
SELECT
    cs.id AS sesion_id,
    cs.tenant_id,
    cs.modo,
    cs.updated_at,
    cs.agente_id,

    -- Cliente
    c.id AS cliente_id,
    c.nombres_completos AS cliente_nombre,
    c.celular AS cliente_celular,

    -- Último mensaje
    m.contenido AS ultimo_mensaje,
    m.origen AS ultimo_origen,
    m.created_at AS ultimo_mensaje_at,

    -- Mensajes sin leer
    COUNT(m2.id) FILTER (
        WHERE m2.leido = FALSE AND m2.origen = 'cliente'
    ) AS mensajes_pendientes

FROM chat_sesiones cs
JOIN clientes c ON c.id = cs.cliente_id
LEFT JOIN LATERAL (
    SELECT contenido, origen, created_at
    FROM mensajes
    WHERE sesion_id = cs.id
    ORDER BY created_at DESC
    LIMIT 1
) m ON TRUE
LEFT JOIN mensajes m2 ON m2.sesion_id = cs.id
GROUP BY cs.id, cs.tenant_id, cs.modo, cs.updated_at, cs.agente_id,
         c.id, c.nombres_completos, c.celular,
         m.contenido, m.origen, m.created_at
ORDER BY cs.updated_at DESC;