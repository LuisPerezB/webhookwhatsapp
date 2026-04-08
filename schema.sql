-- =========================
-- ENUMS
-- =========================

CREATE TYPE tipo_operacion_enum AS ENUM ('venta', 'alquiler');
CREATE TYPE tipo_pago_enum AS ENUM ('efectivo', 'financiamiento');
CREATE TYPE tipo_propiedad_enum AS ENUM ('casa', 'departamento', 'terreno', 'comercial', 'oficina', 'proyecto_inmobiliario');
CREATE TYPE estado_reserva_enum AS ENUM ('pendiente', 'confirmada', 'cancelada');
CREATE TYPE estado_propiedad_enum AS ENUM ('disponible', 'pendiente', 'vendida');

-- =========================
-- TENANTS (INMOBILIARIAS)
-- =========================

CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tenant_config (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  config JSONB,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);


CREATE TABLE whatsapp_numbers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  phone_number_id TEXT NOT NULL UNIQUE,
  numero TEXT,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
-- =========================
-- USERS (USUARIOS DEL SISTEMA)
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

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,

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

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- =========================
-- HORARIOS DISPONIBLES (CLAVE)
-- =========================

CREATE TABLE horarios_disponibles (
    id SERIAL PRIMARY KEY,
    propiedad_id INTEGER NOT NULL,

    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,

    disponible BOOLEAN DEFAULT TRUE,

    FOREIGN KEY (propiedad_id) REFERENCES propiedades(id) ON DELETE CASCADE
);

-- =========================
-- RESERVAS
-- =========================

CREATE TABLE reservas (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    propiedad_id INTEGER NOT NULL,

    fecha TIMESTAMP NOT NULL,
    fecha_reserva TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    estado estado_reserva_enum DEFAULT 'pendiente',

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (propiedad_id) REFERENCES propiedades(id) ON DELETE CASCADE
);

-- =========================
-- CHAT SESIONES
-- =========================

CREATE TABLE chat_sesiones (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    cliente_id INTEGER,

    contenido JSONB NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
);

-- =========================
-- INDEXES (RENDIMIENTO)
-- =========================

CREATE INDEX idx_propiedades_tenant ON propiedades(tenant_id);
CREATE INDEX idx_propiedades_tipo ON propiedades(tipo_propiedad);
CREATE INDEX idx_propiedades_ciudad ON propiedades(ciudad);
CREATE INDEX idx_propiedades_sector ON propiedades(sector);

CREATE INDEX idx_reservas_fecha ON reservas(fecha);
CREATE INDEX idx_reservas_propiedad ON reservas(propiedad_id);

CREATE INDEX idx_clientes_tenant ON clientes(tenant_id);

CREATE INDEX idx_chat_tenant ON chat_sesiones(tenant_id);

-- =========================
-- JSONB INDEX (PRO)
-- =========================

CREATE INDEX idx_propiedades_caracteristicas ON propiedades USING GIN (caracteristicas);