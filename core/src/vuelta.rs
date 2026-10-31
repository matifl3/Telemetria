//! Segmentación por vuelta y series derivadas (RF-004, RF-005, RF-011).
//!
//! v1 construía estas series en `crearLap` (JS); acá viven en `core` para poder
//! testearlas (D-04) y para que la UI solo dibuje datos ya calculados.
//!
//! El arco de pista `s` se recibe ya proyectado (fase 4): este módulo solo lo
//! recorta por vuelta. Sin proyección, `s` queda vacío, la cobertura es `NaN` y
//! la clasificación no puede usar longitudes hasta que la fase 4 la complete.

use crate::modelo::{Auto, MuestrasAuto};

/// `dt` usado cuando el tiempo del frame no sirve (s).
pub const DT_POR_DEFECTO: f64 = 0.12;
/// Salto de tiempo igual o mayor que se descarta como hueco (s).
pub const DT_MAXIMO: f64 = 2.0;
/// Gravedad estándar (m/s²).
pub const G: f32 = 9.80665;
/// Tope de aceleración aceptada, en múltiplos de `G`.
pub const MAX_G: f32 = 4.0;
/// Umbral de yaw distinto de cero para confiar en el canal del archivo.
pub const YAW_UMBRAL: f32 = 0.001;

/// Identificador estable de una vuelta durante la sesión.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct VueltaId {
    /// Índice del auto en el orden del archivo.
    pub auto: usize,
    /// Orden de la vuelta dentro del auto (0 = primera).
    pub numero_local: usize,
}

/// Motivo por el que una vuelta no entra al análisis.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum MotivoVuelta {
    /// La vuelta es analizable.
    #[default]
    Ninguno,
    /// Primera vuelta: incluye la largada desde boxes.
    Salida,
    /// Última vuelta: incluye la entrada a pits.
    Entrada,
    /// Recorrido menor al 90 % de la mediana del auto.
    Cortada,
    /// Vuelta de borde y cortada a la vez.
    Incompleta,
}

impl MotivoVuelta {
    /// Texto en español para la lista de vueltas.
    pub fn etiqueta(&self) -> &'static str {
        match self {
            MotivoVuelta::Ninguno => "",
            MotivoVuelta::Salida => "salida",
            MotivoVuelta::Entrada => "entrada",
            MotivoVuelta::Cortada => "cortada",
            MotivoVuelta::Incompleta => "incompleta",
        }
    }
}

/// Tramo contiguo de frames que comparten `current_lap`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SegmentoVuelta {
    /// `current_lap` tal como viene en el archivo.
    pub numero: u8,
    /// Primer frame del tramo (índice dentro del auto).
    pub inicio: usize,
    /// Frame posterior al último del tramo (exclusivo).
    pub fin: usize,
}

impl SegmentoVuelta {
    /// Cantidad de frames del tramo.
    pub fn largo(&self) -> usize {
        self.fin.saturating_sub(self.inicio)
    }
}

/// Canales de una vuelta. Todos los `Vec` tienen el mismo largo, salvo `s`,
/// que hasta la fase 4 queda vacío.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Series {
    /// Arco de pista ya proyectado y recortado a la vuelta (m).
    pub s: Vec<f64>,
    /// Tiempo relativo al primer frame de la vuelta (s).
    pub t_rel: Vec<f64>,
    /// `dt` robusto por frame (s); siempre positivo.
    pub dt: Vec<f64>,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub z: Vec<f32>,
    pub speed_kmh: Vec<f32>,
    pub rpm: Vec<f32>,
    /// Ángulo de volante en radianes.
    pub volante: Vec<f32>,
    /// Yaw continuo (sin saltos de ±π) y con respaldo por posiciones.
    pub yaw: Vec<f32>,
    /// Acelerador normalizado 0..1.
    pub gas: Vec<f32>,
    /// Freno normalizado 0..1.
    pub freno: Vec<f32>,
    pub marcha: Vec<u8>,
    /// Aceleración longitudinal (m/s²), recortada a ±[`MAX_G`]·[`G`].
    pub acc_long: Vec<f32>,
    /// Aceleración lateral (m/s²), recortada a ±[`MAX_G`]·[`G`].
    pub acc_lat: Vec<f32>,
    /// Módulo de la aceleración total (m/s²), sin recortar.
    pub acc_total: Vec<f32>,
    /// Carga por rueda (N), orden FL, FR, RL, RR.
    pub carga: [Vec<f32>; 4],
    pub slip_ratio: [Vec<f32>; 4],
    pub slip_angle: [Vec<f32>; 4],
    /// Combustible en las unidades del juego.
    pub gasolina: Vec<f32>,
}

impl Series {
    /// Cantidad de muestras (largo de `t_rel`).
    pub fn largo(&self) -> usize {
        self.t_rel.len()
    }
}

/// Una vuelta lista para clasificar y analizar.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Vuelta {
    pub id: VueltaId,
    /// `current_lap` tal como viene en el archivo.
    pub numero: u8,
    /// Etiqueta visible `piloto · car_id · Vn`.
    pub etiqueta: String,
    pub valida: bool,
    pub motivo: MotivoVuelta,
    /// Solo las vueltas válidas se pueden seleccionar (RF-016).
    pub seleccionable: bool,
    /// Duración de la vuelta: último `t_rel` válido (s).
    pub tiempo_s: f64,
    /// Máximo arco de pista alcanzado en la vuelta (m).
    pub cobertura_s_m: f64,
    /// Cobertura dividida por la duración (m/s); 0 si no se puede calcular.
    pub vel_media_mps: f64,
    pub muestras: Series,
    /// Muestras descartadas por estar fuera de pista (fase 4).
    pub errores_proyeccion: usize,
}

/// Segmenta los frames de un auto por tramos contiguos de `current_lap`.
///
/// Un mismo número en dos tramos separados produce dos segmentos: no se
/// unifican (R-06, `current_lap` se repite tras 255 vueltas).
pub fn segmentar_vueltas(numeros: &[u8]) -> Vec<SegmentoVuelta> {
    let mut salida = Vec::new();
    if numeros.is_empty() {
        return salida;
    }

    let mut inicio = 0usize;
    for fin in 1..=numeros.len() {
        if fin == numeros.len() || numeros[fin] != numeros[inicio] {
            salida.push(SegmentoVuelta {
                numero: numeros[inicio],
                inicio,
                fin,
            });
            inicio = fin;
        }
    }
    salida
}

/// Construye las series de un segmento, recortando todos los canales.
///
/// `s_por_frame` es el arco de pista de todo el auto; si su largo no coincide
/// con las muestras se ignora y `s` queda vacío (todavía sin proyección).
pub fn construir_series(
    muestras: &MuestrasAuto,
    s_por_frame: &[f64],
    segmento: &SegmentoVuelta,
) -> Series {
    let total = muestras.largo();
    let inicio = segmento.inicio.min(total);
    let fin = segmento.fin.min(total).max(inicio);

    let t_rel = tiempo_relativo(&muestras.tiempo_vuelta_ms[inicio..fin]);
    let dt = calcular_dt(&t_rel);
    let gas = normalizar_pedal(&muestras.gas[inicio..fin]);
    let freno = normalizar_pedal(&muestras.freno[inicio..fin]);
    let yaw = calcular_yaw(
        &muestras.x[inicio..fin],
        &muestras.z[inicio..fin],
        &muestras.yaw[inicio..fin],
    );
    let (acc_long, acc_lat, acc_total) = aceleraciones(&muestras.speed_kmh[inicio..fin], &yaw, &dt);

    let s = if s_por_frame.len() == total {
        s_por_frame[inicio..fin].to_vec()
    } else {
        Vec::new()
    };

    let mut carga = [Vec::new(), Vec::new(), Vec::new(), Vec::new()];
    let mut slip_ratio = [Vec::new(), Vec::new(), Vec::new(), Vec::new()];
    let mut slip_angle = [Vec::new(), Vec::new(), Vec::new(), Vec::new()];
    for rueda in 0..4 {
        carga[rueda] = muestras.carga[rueda][inicio..fin].to_vec();
        slip_ratio[rueda] = muestras.slip_ratio[rueda][inicio..fin].to_vec();
        slip_angle[rueda] = muestras.slip_angle[rueda][inicio..fin].to_vec();
    }

    Series {
        s,
        t_rel,
        dt,
        x: muestras.x[inicio..fin].to_vec(),
        y: muestras.y[inicio..fin].to_vec(),
        z: muestras.z[inicio..fin].to_vec(),
        speed_kmh: muestras.speed_kmh[inicio..fin].to_vec(),
        rpm: muestras.rpm[inicio..fin].to_vec(),
        volante: muestras.volante[inicio..fin].to_vec(),
        yaw,
        gas,
        freno,
        marcha: muestras.marcha[inicio..fin].to_vec(),
        acc_long,
        acc_lat,
        acc_total,
        carga,
        slip_ratio,
        slip_angle,
        gasolina: muestras.gasolina[inicio..fin]
            .iter()
            .map(|&v| v as f32)
            .collect(),
    }
}

/// Construye una vuelta a partir de un segmento.
///
/// `numero_local` es el orden de la vuelta dentro del auto, estable durante la
/// sesión y distinto de `current_lap`.
pub fn construir_vuelta(
    auto: &Auto,
    numero_local: usize,
    s_por_frame: &[f64],
    segmento: &SegmentoVuelta,
) -> Vuelta {
    let mut vuelta = Vuelta {
        id: VueltaId {
            auto: auto.indice,
            numero_local,
        },
        numero: segmento.numero,
        etiqueta: etiqueta_vuelta(&auto.piloto, &auto.car_id, segmento.numero),
        valida: true,
        motivo: MotivoVuelta::Ninguno,
        seleccionable: true,
        tiempo_s: f64::NAN,
        cobertura_s_m: f64::NAN,
        vel_media_mps: 0.0,
        muestras: construir_series(&auto.muestras, s_por_frame, segmento),
        errores_proyeccion: 0,
    };
    recalcular_metricas(&mut vuelta);
    vuelta
}

/// Segmenta y construye todas las vueltas de un auto.
///
/// Se descartan los tramos de menos de dos frames, igual que v1: no alcanzan
/// para calcular tiempos ni aceleraciones.
pub fn construir_vueltas(auto: &Auto, s_por_frame: &[f64]) -> Vec<Vuelta> {
    segmentar_vueltas(&auto.muestras.vuelta)
        .into_iter()
        .filter(|segmento| segmento.largo() >= 2)
        .enumerate()
        .map(|(numero_local, segmento)| {
            construir_vuelta(auto, numero_local, s_por_frame, &segmento)
        })
        .collect()
}

/// Etiqueta visible `piloto · car_id · Vn` (RF-005).
pub fn etiqueta_vuelta(piloto: &str, car_id: &str, numero: u8) -> String {
    format!("{piloto} · {car_id} · V{numero}")
}

/// Tiempo relativo al primer frame del segmento (s); `t_rel[0] == 0`.
fn tiempo_relativo(tiempos_ms: &[u32]) -> Vec<f64> {
    let Some(primero) = tiempos_ms.first() else {
        return Vec::new();
    };
    let base = *primero as f64 / 1000.0;
    tiempos_ms
        .iter()
        .map(|&ms| ms as f64 / 1000.0 - base)
        .collect()
}

/// `dt` por frame con respaldo: siempre positivo y acotado (v1).
///
/// Un salto no finito, no positivo o de 2 s o más se reemplaza por el `dt`
/// anterior; el primer frame usa [`DT_POR_DEFECTO`].
pub fn calcular_dt(t_rel: &[f64]) -> Vec<f64> {
    let mut salida = vec![DT_POR_DEFECTO; t_rel.len()];
    for i in 1..t_rel.len() {
        let diferencia = t_rel[i] - t_rel[i - 1];
        salida[i] = if diferencia.is_finite() && diferencia > 0.0 && diferencia < DT_MAXIMO {
            diferencia
        } else {
            salida[i - 1]
        };
    }
    salida
}

/// Yaw continuo con respaldo por posiciones.
///
/// Se usa el canal del archivo si tiene al menos un valor finito distinto de
/// cero; si no, el rumbo se calcula con `x`/`z` (v1).
pub fn calcular_yaw(x: &[f32], z: &[f32], yaw: &[f32]) -> Vec<f32> {
    let canal_util = yaw.iter().any(|v| v.is_finite() && v.abs() > YAW_UMBRAL);
    if canal_util {
        unwrap_yaw(yaw)
    } else {
        rumbo_de_posiciones(x, z)
    }
}

/// Elimina los saltos de ±π del yaw.
///
/// Un valor no finito repite el último yaw válido; si el primero no sirve,
/// arranca en 0 (v1).
pub fn unwrap_yaw(yaw: &[f32]) -> Vec<f32> {
    let mut salida = vec![0.0; yaw.len()];
    if yaw.is_empty() {
        return salida;
    }

    salida[0] = if yaw[0].is_finite() { yaw[0] } else { 0.0 };
    for i in 1..yaw.len() {
        let mut diferencia = yaw[i] - yaw[i - 1];
        if !diferencia.is_finite() {
            salida[i] = salida[i - 1];
            continue;
        }
        while diferencia > std::f32::consts::PI {
            diferencia -= std::f32::consts::TAU;
        }
        while diferencia < -std::f32::consts::PI {
            diferencia += std::f32::consts::TAU;
        }
        salida[i] = salida[i - 1] + diferencia;
    }
    salida
}

/// Rumbo en el plano `x`/`z` a partir de posiciones consecutivas (rad).
pub fn rumbo_de_posiciones(x: &[f32], z: &[f32]) -> Vec<f32> {
    let mut salida = vec![0.0; x.len()];
    for i in 1..x.len() {
        let (Some(x0), Some(x1), Some(z0), Some(z1)) =
            (x.get(i - 1), x.get(i), z.get(i - 1), z.get(i))
        else {
            salida[i] = salida[i - 1];
            continue;
        };
        if !x0.is_finite() || !x1.is_finite() || !z0.is_finite() || !z1.is_finite() {
            salida[i] = salida[i - 1];
            continue;
        }
        salida[i] = (x1 - x0).atan2(z1 - z0);
    }
    salida
}

/// Normaliza pedales crudos 0–255 a 0..1.
///
/// El archivo de este juego viene en 0–255, pero v1 aceptaba también 0–1 y
/// 0–100; se conserva esa tolerancia para fixtures y formatos intermedios.
pub fn normalizar_pedal(valores: &[u8]) -> Vec<f32> {
    let maximo = valores.iter().copied().max().unwrap_or(0) as f32;
    let escala = if maximo <= 1.001 {
        1.0
    } else if maximo <= 100.5 {
        100.0
    } else {
        255.0
    };
    valores
        .iter()
        .map(|&valor| (valor as f32 / escala).clamp(0.0, 1.0))
        .collect()
}

/// Aceleraciones longitudinal, lateral y total por frame.
///
/// `acc_long` y `acc_lat` se recortan a ±[`MAX_G`]·[`G`]; `acc_total` es el
/// módulo con los valores sin recortar y usa 0 para los no finitos (v1).
pub fn aceleraciones(
    velocidad_kmh: &[f32],
    yaw: &[f32],
    dt: &[f64],
) -> (Vec<f32>, Vec<f32>, Vec<f32>) {
    let n = velocidad_kmh.len().min(yaw.len()).min(dt.len());
    let mut acc_long = vec![0.0; n];
    let mut acc_lat = vec![0.0; n];
    let mut acc_total = vec![0.0; n];
    let limite = MAX_G * G;

    for i in 1..n {
        let paso = dt[i];
        let v0 = velocidad_kmh[i - 1] / 3.6;
        let v1 = velocidad_kmh[i] / 3.6;
        let dv = v1 - v0;
        let dyaw = yaw[i] - yaw[i - 1];

        let (ax, ay) = if paso.is_finite() && paso > 0.0 {
            let inv = 1.0 / paso as f32;
            (
                if dv.is_finite() { dv * inv } else { f32::NAN },
                if v1.is_finite() && dyaw.is_finite() {
                    v1 * dyaw * inv
                } else {
                    f32::NAN
                },
            )
        } else {
            (f32::NAN, f32::NAN)
        };

        acc_long[i] = ax.clamp(-limite, limite);
        acc_lat[i] = ay.clamp(-limite, limite);
        let a = if ax.is_finite() { ax } else { 0.0 };
        let b = if ay.is_finite() { ay } else { 0.0 };
        acc_total[i] = (a * a + b * b).sqrt();
    }

    (acc_long, acc_lat, acc_total)
}

/// Último tiempo relativo válido de una vuelta (s).
///
/// Si no hay ninguno devuelve `NaN`; ese valor es la duración porque
/// `t_rel[0] == 0`.
pub fn tiempo_de_vuelta(t_rel: &[f64]) -> f64 {
    t_rel
        .iter()
        .rev()
        .copied()
        .find(|valor| valor.is_finite())
        .unwrap_or(f64::NAN)
}

/// Mayor arco de pista alcanzado en la vuelta (m).
///
/// Devuelve `NaN` si todavía no hay proyección (fase 4) o si ningún valor es
/// finito.
pub fn cobertura_s_m(s: &[f64]) -> f64 {
    s.iter()
        .copied()
        .filter(|valor| valor.is_finite())
        .reduce(f64::max)
        .unwrap_or(f64::NAN)
}

/// Recalcula duración, cobertura y velocidad media de una vuelta.
///
/// La fase 4 llama a esta función después de completar `muestras.s`.
pub fn recalcular_metricas(vuelta: &mut Vuelta) {
    let tiempo = tiempo_de_vuelta(&vuelta.muestras.t_rel);
    let cobertura = cobertura_s_m(&vuelta.muestras.s);
    vuelta.tiempo_s = tiempo;
    vuelta.cobertura_s_m = cobertura;
    vuelta.vel_media_mps = if tiempo.is_finite() && tiempo > 0.0 && cobertura.is_finite() {
        cobertura / tiempo
    } else {
        0.0
    };
}
