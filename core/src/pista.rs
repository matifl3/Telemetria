//! Parser de `fast_lane.ai`: línea central de la pista.
//!
//! Offsets y validaciones en `doc/FormatoTelemetria.md` §3. El ancho se usa
//! constante, igual que v1: se calcula un único semiancho (mediana de los puntos
//! válidos) y se repite en `wl`/`wr` para toda la pista.

use crate::error::{ErrorFormato, Motivo, Resultado};
use crate::lector::Lector;

/// Semiancho usado cuando el archivo no trae un bloque de anchos utilizable.
pub const SEMIANCHO_POR_DEFECTO: f32 = 6.0;

/// Cantidad mínima de puntos de una pista válida (§3.4).
pub const PUNTOS_MIN: i32 = 3;
/// Cantidad máxima de puntos aceptada (§3.4).
pub const PUNTOS_MAX: i32 = 5_000_000;

/// Bytes por punto del bloque obligatorio.
pub const BYTES_PUNTO: usize = 20;
/// Bytes por registro del bloque opcional de anchos.
pub const BYTES_BLOQUE_ANCHOS: usize = 72;
/// Offset del semiancho izquierdo dentro del registro de 72 B.
pub const OFFSET_SEMIANCHO_IZQ: usize = 24;
/// Offset del semiancho derecho dentro del registro de 72 B.
pub const OFFSET_SEMIANCHO_DER: usize = 28;
/// Tope exclusivo de un semiancho válido, en metros: `(0, 200)`.
pub const SEMIANCHO_VALIDO_MAX: f32 = 200.0;

/// Pista cargada desde `fast_lane.ai`.
///
/// Todos los `Vec` tienen el mismo largo y están en orden de recorrido.
#[derive(Debug, Clone, PartialEq)]
pub struct Pista {
    /// Coordenada X de la línea central (m).
    pub nx: Vec<f32>,
    /// Altura de la línea central (m). No se usa para el arco de pista.
    pub ny: Vec<f32>,
    /// Coordenada Z de la línea central (m).
    pub nz: Vec<f32>,
    /// Arco acumulado sobre la línea central (m); estrictamente creciente.
    pub ns: Vec<f32>,
    /// Semiancho izquierdo (m). Constante en toda la pista (D-01 de v1).
    pub wl: Vec<f32>,
    /// Semiancho derecho (m). Constante en toda la pista (D-01 de v1).
    pub wr: Vec<f32>,
    /// Largo total de la pista (m): último valor de `ns`.
    pub longitud_m: f64,
}

impl Pista {
    /// Cantidad de puntos de la línea central.
    pub fn puntos(&self) -> usize {
        self.nx.len()
    }

    /// Semiancho de la banda de pista (m), igual para todos los puntos.
    pub fn ancho_m(&self) -> f32 {
        self.wl
            .first()
            .copied()
            .unwrap_or(SEMIANCHO_POR_DEFECTO)
    }
}

/// Parsea `fast_lane.ai` desde bytes. `archivo` solo se usa en los mensajes.
pub fn parsear_pista(bytes: &[u8], archivo: &str) -> Resultado<Pista> {
    let mut lector = Lector::nuevo(bytes, archivo);

    let n = leer_cantidad(&mut lector)?;
    let mut pista = leer_puntos(&mut lector, n)?;

    let ancho = leer_semiancho(&mut lector, n)?;
    pista.wl = vec![ancho; n];
    pista.wr = vec![ancho; n];

    completar_arco(&mut pista);
    Ok(pista)
}

/// Lee la cabecera de cuatro `i32` y valida la cantidad de puntos.
fn leer_cantidad(lector: &mut Lector<'_>) -> Resultado<usize> {
    // Solo el segundo `i32` (offset 4) es la cantidad de puntos; el resto es
    // reservado y se lee únicamente para avanzar.
    let _reservado = lector.i32()?;
    let cantidad = lector.i32()?;
    let _reservado = lector.i32()?;
    let _reservado = lector.i32()?;

    if !(PUNTOS_MIN..=PUNTOS_MAX).contains(&cantidad) {
        return Err(ErrorFormato::en_offset(
            lector.archivo(),
            Motivo::PistaInvalida {
                detalle: format!(
                    "cantidad de puntos fuera de rango ({cantidad}); \
                     se esperan entre {PUNTOS_MIN} y {PUNTOS_MAX}"
                ),
            },
            4,
        ));
    }

    Ok(cantidad as usize)
}

/// Lee los `n` puntos de 20 bytes (x, y, z, ns) y descarta el id.
fn leer_puntos(lector: &mut Lector<'_>, n: usize) -> Resultado<Pista> {
    // Nunca reservar por un `n` no confiable: cada punto necesita 20 bytes.
    let capacidad = n.min(lector.restante() / BYTES_PUNTO);
    let mut pista = Pista {
        nx: Vec::with_capacity(capacidad),
        ny: Vec::with_capacity(capacidad),
        nz: Vec::with_capacity(capacidad),
        ns: Vec::with_capacity(capacidad),
        wl: Vec::new(),
        wr: Vec::new(),
        longitud_m: 0.0,
    };

    for indice in 0..n {
        let offset = lector.pos();
        let x = lector.f32()?;
        let y = lector.f32()?;
        let z = lector.f32()?;
        let ns = lector.f32()?;
        // El id se lee para avanzar; ninguna capacidad de la app lo usa.
        let _id = lector.i32()?;

        if !x.is_finite() || !y.is_finite() || !z.is_finite() {
            return Err(ErrorFormato::en_offset(
                lector.archivo(),
                Motivo::PistaInvalida {
                    detalle: format!("el punto {indice} tiene coordenadas no finitas"),
                },
                offset,
            ));
        }

        pista.nx.push(x);
        pista.ny.push(y);
        pista.nz.push(z);
        pista.ns.push(ns);
    }

    Ok(pista)
}

/// Calcula el semiancho constante a partir del bloque opcional de 72 B.
///
/// Si el bloque no está completo se usa [`SEMIANCHO_POR_DEFECTO`]; los bytes
/// sobrantes que no alcanzan para otro registro se ignoran (§3.3).
fn leer_semiancho(lector: &mut Lector<'_>, n: usize) -> Resultado<f32> {
    let necesario = n.saturating_mul(BYTES_BLOQUE_ANCHOS);
    if lector.restante() < necesario {
        return Ok(SEMIANCHO_POR_DEFECTO);
    }

    let bloque = lector.tomar(necesario)?;
    let mut sumas = Vec::with_capacity(n);
    for indice in 0..n {
        let base = indice * BYTES_BLOQUE_ANCHOS;
        let izq = f32_en(bloque, base + OFFSET_SEMIANCHO_IZQ);
        let der = f32_en(bloque, base + OFFSET_SEMIANCHO_DER);
        // Igual que v1: el punto cuenta solo si ambos lados son válidos.
        if semiancho_valido(izq) && semiancho_valido(der) {
            sumas.push(izq + der);
        }
    }

    if sumas.is_empty() {
        return Ok(SEMIANCHO_POR_DEFECTO);
    }

    Ok(mediana(&mut sumas) / 2.0)
}

/// Un semiancho sirve si es finito y está en `(0, 200)` m.
fn semiancho_valido(valor: f32) -> bool {
    valor.is_finite() && valor > 0.0 && valor < SEMIANCHO_VALIDO_MAX
}

/// Mediana verdadera: con cantidad par, promedio de los dos valores centrales.
///
/// v1 tomaba el central superior (`sumas[largo >> 1]`); la diferencia es de
/// centímetros y el documento manda (§3.3).
fn mediana(valores: &mut [f32]) -> f32 {
    valores.sort_by(|a, b| a.total_cmp(b));
    let medio = valores.len() / 2;
    if valores.len() % 2 == 0 {
        (valores[medio - 1] + valores[medio]) / 2.0
    } else {
        valores[medio]
    }
}

fn f32_en(bytes: &[u8], offset: usize) -> f32 {
    let mut trozo = [0u8; 4];
    trozo.copy_from_slice(&bytes[offset..offset + 4]);
    f32::from_le_bytes(trozo)
}

/// Recalcula `ns` si el archivo no trae un arco usable y fija `longitud_m`.
///
/// El arco del archivo sirve si es finito, estrictamente creciente y termina en
/// un valor positivo (mismo criterio que v1). El recálculo suma distancias en el
/// plano `x`/`z`, que es donde vive la pista; `y` no interviene.
fn completar_arco(pista: &mut Pista) {
    let n = pista.nx.len();
    if n == 0 {
        pista.longitud_m = 0.0;
        return;
    }

    let usable = n >= 2
        && pista.ns[0].is_finite()
        && (1..n).all(|i| pista.ns[i].is_finite() && pista.ns[i] > pista.ns[i - 1])
        && pista.ns[n - 1] > 0.0;

    if !usable {
        let mut acumulado = 0.0f64;
        pista.ns[0] = 0.0;
        for i in 1..n {
            let dx = (pista.nx[i] - pista.nx[i - 1]) as f64;
            let dz = (pista.nz[i] - pista.nz[i - 1]) as f64;
            acumulado += (dx * dx + dz * dz).sqrt();
            pista.ns[i] = acumulado as f32;
        }
    }

    pista.longitud_m = pista.ns[n - 1] as f64;
}
