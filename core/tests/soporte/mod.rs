//! Constructores de fixtures binarios para los tests de `core`.
//!
//! Todo se genera en memoria: no hay archivos binarios en el repo (principio 5).

// Cada binario de test usa solo una parte del soporte (replay o pista).
#![allow(dead_code)]

use acreplay_core::acreplay::MAGIC_CSP;

pub mod pista;

/// Especificación de un frame con valores ya decodificados.
#[derive(Debug, Clone)]
pub struct FrameFixture {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub roll: f32,
    pub vel_x: f32,
    pub vel_y: f32,
    pub vel_z: f32,
    pub rpm: f32,
    pub volante: f32,
    pub gas: u8,
    pub freno: u8,
    pub marcha: u8,
    pub vuelta: u8,
    pub tiempo_vuelta_ms: u32,
    pub ultima_vuelta_ms: u32,
    pub mejor_vuelta_ms: u32,
    pub gasolina: u8,
    pub gasolina_por_vuelta: u8,
    pub carga: [f32; 4],
    pub slip_ratio: [f32; 4],
    pub slip_angle: [f32; 4],
    pub estado: u16,
    pub boost: u8,
}

impl Default for FrameFixture {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            yaw: 0.0,
            pitch: 0.0,
            roll: 0.0,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            rpm: 0.0,
            volante: 0.0,
            gas: 0,
            freno: 0,
            marcha: 0,
            vuelta: 1,
            tiempo_vuelta_ms: 0,
            ultima_vuelta_ms: 0,
            mejor_vuelta_ms: 0,
            gasolina: 0,
            gasolina_por_vuelta: 0,
            carga: [0.0; 4],
            slip_ratio: [0.0; 4],
            slip_angle: [0.0; 4],
            estado: 0,
            boost: 0,
        }
    }
}

/// Especificación de un auto.
#[derive(Debug, Clone)]
pub struct AutoFixture {
    pub car_id: String,
    pub piloto: String,
    pub nacion: String,
    pub equipo: String,
    pub skin: String,
    pub wings: u32,
    pub extra_count: u32,
    pub frames: Vec<FrameFixture>,
}

impl AutoFixture {
    pub fn nuevo(car_id: impl Into<String>, piloto: impl Into<String>, frames: usize) -> Self {
        Self {
            car_id: car_id.into(),
            piloto: piloto.into(),
            nacion: "AR".to_string(),
            equipo: "Equipo".to_string(),
            skin: "skin".to_string(),
            wings: 0,
            extra_count: 0,
            frames: vec![FrameFixture::default(); frames],
        }
    }
}

/// Constructor parametrizable de un `.acreplay` v16 sintético.
#[derive(Debug, Clone)]
pub struct ConstructorReplay {
    pub version: u32,
    pub intervalo_ms: f64,
    pub clima: String,
    pub pista: String,
    pub config_pista: String,
    pub indice_jugador: u32,
    pub objetos_pista: u32,
    pub autos: Vec<AutoFixture>,
    pub con_pie_csp: bool,
}

impl Default for ConstructorReplay {
    fn default() -> Self {
        Self {
            version: 16,
            intervalo_ms: 33.3,
            clima: "3_clear".to_string(),
            pista: "monza".to_string(),
            config_pista: String::new(),
            indice_jugador: 0,
            objetos_pista: 0,
            autos: vec![AutoFixture::nuevo("auto_0", "Piloto 0", 2)],
            con_pie_csp: false,
        }
    }
}

impl ConstructorReplay {
    /// Replay mínimo: un auto, dos frames, sin wings ni CSP.
    pub fn minimo() -> Self {
        Self::default()
    }

    /// Varios autos, todos con la misma cantidad de frames.
    pub fn con_autos(cantidad: usize, frames_por_auto: usize) -> Self {
        let mut constructor = Self::default();
        constructor.autos = (0..cantidad)
            .map(|i| {
                AutoFixture::nuevo(
                    format!("auto_{i}"),
                    format!("Piloto {i}"),
                    frames_por_auto,
                )
            })
            .collect();
        constructor
    }

    /// `frames_globales` se deriva del primer auto para simplificar.
    pub fn frames_globales(&self) -> u32 {
        self.autos.first().map(|a| a.frames.len() as u32).unwrap_or(0)
    }

    /// Serializa el replay completo.
    pub fn bytes(&self) -> Vec<u8> {
        let mut salida = Vec::new();
        salida.extend_from_slice(&self.version.to_le_bytes());
        salida.extend_from_slice(&self.intervalo_ms.to_le_bytes());
        escribir_cadena(&mut salida, &self.clima);
        escribir_cadena(&mut salida, &self.pista);
        escribir_cadena(&mut salida, &self.config_pista);
        salida.extend_from_slice(&(self.autos.len() as u32).to_le_bytes());
        salida.extend_from_slice(&self.indice_jugador.to_le_bytes());
        salida.extend_from_slice(&self.frames_globales().to_le_bytes());
        salida.extend_from_slice(&self.objetos_pista.to_le_bytes());

        let bytes_objetos =
            (4 + 12 * self.objetos_pista as usize) * self.frames_globales() as usize;
        salida.resize(salida.len() + bytes_objetos, 0);

        for auto in &self.autos {
            escribir_cadena(&mut salida, &auto.car_id);
            escribir_cadena(&mut salida, &auto.piloto);
            escribir_cadena(&mut salida, &auto.nacion);
            escribir_cadena(&mut salida, &auto.equipo);
            escribir_cadena(&mut salida, &auto.skin);
            salida.extend_from_slice(&(auto.frames.len() as u32).to_le_bytes());
            salida.extend_from_slice(&auto.wings.to_le_bytes());
            salida.resize(salida.len() + 20, 0);

            for (i, frame) in auto.frames.iter().enumerate() {
                escribir_frame(&mut salida, frame);
                if i + 1 < auto.frames.len() {
                    salida.resize(salida.len() + 20 + auto.wings as usize * 4, 0);
                }
            }

            salida.resize(salida.len() + auto.wings as usize * 4, 0);
            salida.extend_from_slice(&auto.extra_count.to_le_bytes());
            salida.resize(salida.len() + auto.extra_count as usize * 8, 0);
        }

        if self.con_pie_csp {
            salida.extend_from_slice(MAGIC_CSP);
            salida.extend_from_slice(&0u32.to_le_bytes());
            salida.extend_from_slice(&1u32.to_le_bytes());
        }

        salida
    }
}

fn escribir_cadena(salida: &mut Vec<u8>, texto: &str) {
    salida.extend_from_slice(&(texto.len() as u32).to_le_bytes());
    salida.extend_from_slice(texto.as_bytes());
}

fn escribir_frame(salida: &mut Vec<u8>, frame: &FrameFixture) {
    let mut bytes = [0u8; 256];
    poner_f32(&mut bytes, 0, frame.x);
    poner_f32(&mut bytes, 4, frame.y);
    poner_f32(&mut bytes, 8, frame.z);
    poner_f16(&mut bytes, 12, frame.yaw);
    poner_f16(&mut bytes, 14, frame.pitch);
    poner_f16(&mut bytes, 16, frame.roll);
    poner_f16(&mut bytes, 164, frame.vel_x);
    poner_f16(&mut bytes, 166, frame.vel_y);
    poner_f16(&mut bytes, 168, frame.vel_z);
    poner_f16(&mut bytes, 170, frame.rpm);
    for rueda in 0..4 {
        let base = rueda * 2;
        poner_f16(&mut bytes, 180 + base, frame.slip_angle[rueda]);
        poner_f16(&mut bytes, 188 + base, frame.slip_ratio[rueda]);
        poner_f16(&mut bytes, 204 + base, frame.carga[rueda]);
    }
    poner_f16(&mut bytes, 212, frame.volante);
    poner_u32(&mut bytes, 220, frame.tiempo_vuelta_ms);
    poner_u32(&mut bytes, 224, frame.ultima_vuelta_ms);
    poner_u32(&mut bytes, 228, frame.mejor_vuelta_ms);
    bytes[232] = frame.gasolina;
    bytes[233] = frame.gasolina_por_vuelta;
    bytes[234] = frame.marcha;
    bytes[244] = frame.gas;
    bytes[245] = frame.freno;
    bytes[246] = frame.vuelta;
    poner_u16(&mut bytes, 248, frame.estado);
    bytes[254] = frame.boost;
    salida.extend_from_slice(&bytes);
}

fn poner_f32(bytes: &mut [u8], offset: usize, valor: f32) {
    bytes[offset..offset + 4].copy_from_slice(&valor.to_le_bytes());
}

fn poner_u32(bytes: &mut [u8], offset: usize, valor: u32) {
    bytes[offset..offset + 4].copy_from_slice(&valor.to_le_bytes());
}

fn poner_u16(bytes: &mut [u8], offset: usize, valor: u16) {
    bytes[offset..offset + 2].copy_from_slice(&valor.to_le_bytes());
}

fn poner_f16(bytes: &mut [u8], offset: usize, valor: f32) {
    bytes[offset..offset + 2].copy_from_slice(&f32_a_medio(valor).to_le_bytes());
}

/// Conversión `f32 → f16` suficiente para los fixtures (redondeo al más cercano).
fn f32_a_medio(valor: f32) -> u16 {
    if valor.is_nan() {
        return 0x7e00;
    }
    if valor.is_infinite() {
        return if valor > 0.0 { 0x7c00 } else { 0xfc00 };
    }
    if valor == 0.0 {
        return if valor.is_sign_negative() { 0x8000 } else { 0 };
    }

    let signo: u16 = if valor < 0.0 { 0x8000 } else { 0 };
    let absoluto = valor.abs();

    if absoluto < 2f32.powi(-14) {
        let mantisa = (absoluto / 2f32.powi(-24)).round() as u16;
        return signo | mantisa;
    }

    let exponente = absoluto.log2().floor() as i32;
    let exp_bits = (exponente + 15) as u16;
    if exp_bits >= 31 {
        return signo | 0x7c00;
    }
    let mantisa = ((absoluto / 2f32.powi(exponente) - 1.0) * 1024.0).round() as u16;
    if mantisa >= 1024 {
        let exp_bits = exp_bits + 1;
        if exp_bits >= 31 {
            return signo | 0x7c00;
        }
        return signo | (exp_bits << 10);
    }
    signo | (exp_bits << 10) | mantisa
}
