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

/// Sentido de un arco sintético.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SentidoFixture {
    Izquierda,
    Derecha,
}

/// Tramo de una pista sintética: recta o arco.
#[derive(Debug, Clone, Copy)]
pub enum TramoFixture {
    Recta { largo: f32 },
    Arco {
        radio: f32,
        sentido: SentidoFixture,
        grados: f32,
    },
}

impl TramoFixture {
    pub fn recta(largo: f32) -> Self {
        TramoFixture::Recta { largo }
    }

    pub fn arco(radio: f32, sentido: SentidoFixture, grados: f32) -> Self {
        TramoFixture::Arco {
            radio,
            sentido,
            grados,
        }
    }

    fn largo(&self) -> f32 {
        match *self {
            TramoFixture::Recta { largo } => largo,
            TramoFixture::Arco { radio, grados, .. } => {
                radio * grados.to_radians()
            }
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

    /// Arma una línea central a partir de rectas y arcos, a `paso` metros.
    ///
    /// Sirve para pistas abiertas (recta-curva-recta) y para circuitos cerrados
    /// (por ejemplo un óvalo de dos arcos de 180°). Si el último punto coincide
    /// con el primero se descarta, igual que en un `.ai` real.
    pub fn desde_tramos(tramos: &[TramoFixture], paso: f32) -> Self {
        let paso = paso.max(0.25);
        let mut x = 0.0f32;
        let mut z = 0.0f32;
        let mut rumbo = 0.0f32;
        let mut arco = 0.0f32;
        let mut puntos = vec![PuntoFixture::nuevo(x, z, arco)];

        for tramo in tramos {
            let largo = tramo.largo();
            let pasos = (largo / paso).ceil().max(1.0) as usize;
            let ds = largo / pasos as f32;
            for _ in 0..pasos {
                match *tramo {
                    TramoFixture::Recta { .. } => {
                        x += ds * rumbo.cos();
                        z += ds * rumbo.sin();
                    }
                    TramoFixture::Arco {
                        radio,
                        sentido,
                        ..
                    } => {
                        let signo = match sentido {
                            SentidoFixture::Derecha => 1.0,
                            SentidoFixture::Izquierda => -1.0,
                        };
                        let dtheta = signo * ds / radio.max(0.01);
                        let medio = rumbo + dtheta / 2.0;
                        x += ds * medio.cos();
                        z += ds * medio.sin();
                        rumbo += dtheta;
                    }
                }
                arco += ds;
                puntos.push(PuntoFixture::nuevo(x, z, arco));
            }
        }

        // Un `.ai` real no repite el primer punto como último.
        if puntos.len() > 3 {
            let ultimo = puntos.last().unwrap();
            let inicio = puntos[0];
            let cierre = ((ultimo.x - inicio.x).powi(2) + (ultimo.z - inicio.z).powi(2)).sqrt();
            if cierre < paso * 0.5 {
                puntos.pop();
            }
        }

        Self {
            puntos,
            n_declarado: None,
            con_bloque_anchos: false,
            relleno_final: 0,
        }
    }

    /// Rota la lista de puntos para que `s_objetivo` quede en el índice 0.
    pub fn rotar_a_s(mut self, s_objetivo: f32) -> Self {
        if self.puntos.is_empty() {
            return self;
        }
        let indice = self
            .puntos
            .iter()
            .enumerate()
            .min_by(|(_, a), (_, b)| {
                (a.ns - s_objetivo)
                    .abs()
                    .total_cmp(&(b.ns - s_objetivo).abs())
            })
            .map(|(indice, _)| indice)
            .unwrap_or(0);
        self.puntos.rotate_left(indice);
        self.recalcular_arco();
        self
    }

    /// Recalcula `ns` desde las posiciones, empezando en 0.
    fn recalcular_arco(&mut self) {
        if self.puntos.is_empty() {
            return;
        }
        self.puntos[0].ns = 0.0;
        for indice in 1..self.puntos.len() {
            let dx = self.puntos[indice].x - self.puntos[indice - 1].x;
            let dz = self.puntos[indice].z - self.puntos[indice - 1].z;
            let paso = (dx * dx + dz * dz).sqrt();
            self.puntos[indice].ns = self.puntos[indice - 1].ns + paso;
        }
    }

    /// Pone el mismo par de semianchos en todos los puntos y activa el bloque.
    pub fn con_semianchos(mut self, izq: f32, der: f32) -> Self {        for punto in &mut self.puntos {
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
