//! Modelo de datos del replay.
//!
//! Unidades explícitas: posiciones y distancias en metros, velocidades en km/h,
//! tiempos en milisegundos tal como vienen en el archivo, ángulos en radianes.
//! El parseo guarda canales ya decodificados, no el frame crudo de 256 bytes
//! (D-03 del plan).

/// Metadatos del encabezado del `.acreplay`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MetaReplay {
    /// Versión del formato; debe ser 16.
    pub version: u32,
    /// Intervalo entre frames, en milisegundos.
    pub intervalo_ms: f64,
    pub clima: String,
    pub pista: String,
    pub config_pista: String,
    /// `current_recording_index`: índice del auto del jugador.
    pub indice_jugador: u32,
    /// `num_frames` del encabezado global.
    pub frames_globales: u32,
    /// `num_track_objects`: objetos de pista por frame.
    pub objetos_pista: u32,
}

/// Replay completo con todos sus autos, en el orden del archivo.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Replay {
    pub meta: MetaReplay,
    pub autos: Vec<Auto>,
    /// Auto de referencia sugerido por `current_recording_index` (si es válido).
    /// El fallback por vueltas analizables se resuelve al clasificar (fase 3).
    pub auto_referencia: Option<usize>,
}

/// Un auto del replay y sus canales decodificados.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Auto {
    pub indice: usize,
    pub car_id: String,
    pub piloto: String,
    pub nacion: String,
    pub equipo: String,
    pub skin: String,
    /// `num_frames` del encabezado del auto.
    pub frames: u32,
    /// `num_wings`: bloques de 4 bytes entre frames.
    pub wings: u32,
    pub muestras: MuestrasAuto,
}

/// Canales por frame de un auto. Todos los `Vec` tienen el mismo largo
/// (`Auto::frames`) y están en orden de recorrido.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MuestrasAuto {
    /// Posición del auto (m).
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub z: Vec<f32>,
    /// Velocidad lineal del frame (m/s), tal como viene en el archivo.
    pub vel_x: Vec<f32>,
    pub vel_y: Vec<f32>,
    pub vel_z: Vec<f32>,
    /// Módulo de la velocidad en km/h (derivado de `vel_*`).
    pub speed_kmh: Vec<f32>,
    /// Rotación en radianes. El archivo guarda Y-X-Z; se expone con nombres
    /// semánticos (`yaw` = Y, `pitch` = X, `roll` = Z).
    pub yaw: Vec<f32>,
    pub pitch: Vec<f32>,
    pub roll: Vec<f32>,
    pub rpm: Vec<f32>,
    /// Ángulo de volante en radianes.
    pub volante: Vec<f32>,
    /// Pedales crudos 0–255; la normalización a 0..1 es de la capa de vueltas.
    pub gas: Vec<u8>,
    pub freno: Vec<u8>,
    pub marcha: Vec<u8>,
    /// `current_lap` tal como viene (u8, se repite tras 255 vueltas).
    pub vuelta: Vec<u8>,
    /// Tiempos del frame, en milisegundos.
    pub tiempo_vuelta_ms: Vec<u32>,
    pub ultima_vuelta_ms: Vec<u32>,
    pub mejor_vuelta_ms: Vec<u32>,
    /// Combustible y consumo por vuelta, en las unidades del juego.
    pub gasolina: Vec<u8>,
    pub gasolina_por_vuelta: Vec<u8>,
    /// Carga por rueda (N), orden FL, FR, RL, RR.
    pub carga: [Vec<f32>; 4],
    /// `slip_ratio` por rueda, orden FL, FR, RL, RR.
    pub slip_ratio: [Vec<f32>; 4],
    /// `slip_angle` por rueda, orden FL, FR, RL, RR.
    pub slip_angle: [Vec<f32>; 4],
    pub estado: Vec<u16>,
    pub boost: Vec<u8>,
}

impl MuestrasAuto {
    /// Reserva capacidad para `frames` muestras en todos los canales.
    pub fn con_capacidad(frames: usize) -> Self {
        let mut muestras = Self::default();
        muestras.x.reserve(frames);
        muestras.y.reserve(frames);
        muestras.z.reserve(frames);
        muestras.vel_x.reserve(frames);
        muestras.vel_y.reserve(frames);
        muestras.vel_z.reserve(frames);
        muestras.speed_kmh.reserve(frames);
        muestras.yaw.reserve(frames);
        muestras.pitch.reserve(frames);
        muestras.roll.reserve(frames);
        muestras.rpm.reserve(frames);
        muestras.volante.reserve(frames);
        muestras.gas.reserve(frames);
        muestras.freno.reserve(frames);
        muestras.marcha.reserve(frames);
        muestras.vuelta.reserve(frames);
        muestras.tiempo_vuelta_ms.reserve(frames);
        muestras.ultima_vuelta_ms.reserve(frames);
        muestras.mejor_vuelta_ms.reserve(frames);
        muestras.gasolina.reserve(frames);
        muestras.gasolina_por_vuelta.reserve(frames);
        for rueda in 0..4 {
            muestras.carga[rueda].reserve(frames);
            muestras.slip_ratio[rueda].reserve(frames);
            muestras.slip_angle[rueda].reserve(frames);
        }
        muestras.estado.reserve(frames);
        muestras.boost.reserve(frames);
        muestras
    }

    /// Cantidad de muestras (largo común de los canales).
    pub fn largo(&self) -> usize {
        self.x.len()
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn t13_structs_se_construyen_con_unidades_documentadas() {
        let meta = MetaReplay {
            version: 16,
            intervalo_ms: 33.3,
            clima: "3_clear".to_string(),
            pista: "monza".to_string(),
            config_pista: String::new(),
            indice_jugador: 1,
            frames_globales: 2,
            objetos_pista: 0,
        };
        let auto = Auto {
            indice: 1,
            car_id: "ks_ferrari_458".to_string(),
            piloto: "Piloto".to_string(),
            nacion: "AR".to_string(),
            equipo: "Equipo".to_string(),
            skin: "skin".to_string(),
            frames: 2,
            wings: 0,
            muestras: MuestrasAuto::con_capacidad(2),
        };
        let replay = Replay {
            meta,
            autos: vec![auto],
            auto_referencia: Some(1),
        };
        assert_eq!(replay.meta.version, 16);
        assert_eq!(replay.meta.intervalo_ms, 33.3);
        assert_eq!(replay.autos[0].muestras.largo(), 0);
    }
}
