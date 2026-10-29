//! Constructor de `fast_lane.ai` sintéticos para los tests de `core`.
//!
//! Todo se genera en memoria: no hay archivos binarios en el repo (principio 5).

/// Punto de la línea central, con sus semianchos opcionales.
#[derive(Debug, Clone, Copy)]
pub struct PuntoFixture {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// Arco acumulado declarado en el archivo (m).
    pub ns: f32,
    pub id: i32,
    /// Semiancho izquierdo del bloque de 72 B; `None` escribe `NaN` (inválido).
    pub semiancho_izq: Option<f32>,
    /// Semiancho derecho del bloque de 72 B; `None` escribe `NaN` (inválido).
    pub semiancho_der: Option<f32>,
}

impl Default for PuntoFixture {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            ns: 0.0,
            id: 0,
            semiancho_izq: None,
            semiancho_der: None,
        }
    }
}

impl PuntoFixture {
    pub fn nuevo(x: f32, z: f32, ns: f32) -> Self {
        Self {
            x,
            z,
            ns,
            ..Self::default()
        }
    }
}

/// Constructor parametrizable de un `fast_lane.ai` sintético.
#[derive(Debug, Clone)]
pub struct ConstructorPista {
    pub puntos: Vec<PuntoFixture>,
    /// Si viene, reemplaza la cantidad de puntos de la cabecera.
    pub n_declarado: Option<i32>,
    pub con_bloque_anchos: bool,
    /// Bytes de relleno al final (sobrantes que no forman otro registro).
    pub relleno_final: usize,
}

impl Default for ConstructorPista {
    fn default() -> Self {
        Self::recta(5)
    }
}

impl ConstructorPista {
    /// `cantidad` puntos cada 10 m sobre el eje X, con `ns` coherente.
    pub fn recta(cantidad: usize) -> Self {
        let cantidad = cantidad.max(1);
        let puntos = (0..cantidad)
            .map(|i| PuntoFixture {
                x: i as f32 * 10.0,
                y: 0.0,
                z: 0.0,
                ns: i as f32 * 10.0,
                id: i as i32,
                ..PuntoFixture::default()
            })
            .collect();
        Self {
            puntos,
            n_declarado: None,
            con_bloque_anchos: false,
            relleno_final: 0,
        }
    }

    /// Círculo de radio `radio` recorrido en sentido antihorario.
    ///
    /// El último punto no repite el primero: el cierre es implícito, como en un
    /// `fast_lane.ai` real.
    pub fn circular(radio: f32, cantidad: usize) -> Self {
        let cantidad = cantidad.max(3);
        let paso = std::f32::consts::TAU * radio / cantidad as f32;
        let puntos = (0..cantidad)
            .map(|i| {
                let angulo = std::f32::consts::TAU * i as f32 / cantidad as f32;
                PuntoFixture {
                    x: radio * angulo.cos(),
                    y: 0.0,
                    z: radio * angulo.sin(),
                    ns: paso * i as f32,
                    id: i as i32,
                    ..PuntoFixture::default()
                }
            })
            .collect();
        Self {
            puntos,
            n_declarado: None,
            con_bloque_anchos: false,
            relleno_final: 0,
        }
    }

    /// Pone el mismo par de semianchos en todos los puntos y activa el bloque.
    pub fn con_semianchos(mut self, izq: f32, der: f32) -> Self {
        for punto in &mut self.puntos {
            punto.semiancho_izq = Some(izq);
            punto.semiancho_der = Some(der);
        }
        self.con_bloque_anchos = true;
        self
    }

    /// Serializa la pista completa.
    pub fn bytes(&self) -> Vec<u8> {
        let mut salida = Vec::new();
        salida.extend_from_slice(&0i32.to_le_bytes());
        let n = self.n_declarado.unwrap_or(self.puntos.len() as i32);
        salida.extend_from_slice(&n.to_le_bytes());
        salida.extend_from_slice(&0i32.to_le_bytes());
        salida.extend_from_slice(&0i32.to_le_bytes());

        for punto in &self.puntos {
            salida.extend_from_slice(&punto.x.to_le_bytes());
            salida.extend_from_slice(&punto.y.to_le_bytes());
            salida.extend_from_slice(&punto.z.to_le_bytes());
            salida.extend_from_slice(&punto.ns.to_le_bytes());
            salida.extend_from_slice(&punto.id.to_le_bytes());
        }

        if self.con_bloque_anchos {
            for punto in &self.puntos {
                let mut registro = [0u8; 72];
                poner_f32(&mut registro, 24, punto.semiancho_izq.unwrap_or(f32::NAN));
                poner_f32(&mut registro, 28, punto.semiancho_der.unwrap_or(f32::NAN));
                salida.extend_from_slice(&registro);
            }
        }

        salida.resize(salida.len() + self.relleno_final, 0);
        salida
    }
}

fn poner_f32(bytes: &mut [u8], offset: usize, valor: f32) {
    bytes[offset..offset + 4].copy_from_slice(&valor.to_le_bytes());
}
