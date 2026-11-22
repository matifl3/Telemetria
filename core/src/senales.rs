//! Herramientas de señal sobre la grilla común de `s` (ING05–ING09).
//!
//! Todo trabaja con canales ya alineados (`Vec<Option<_>>`): un `None` es un
//! hueco y nunca se rellena. Las funciones no envuelven por la meta: los
//! canales de una vuelta empiezan y terminan en la línea de llegada y el
//! tiempo salta ahí.
//!
//! Para ventanas que cruzan la meta (aproximación a la primera curva, curva que
//! cruza la meta) se usan coordenadas **extendidas**: un `s` puede ser negativo
//! o mayor que la longitud y [`puntos_de_tramo`] lo traduce a índices de la
//! grilla en orden de recorrido.

use crate::alineado::VueltaAlineada;

/// Ventana de suavizado de la tasa de yaw y de la curvatura (m).
pub const VENTANA_SUAVIZADO_GIRO_M: f64 = 10.0;
/// Distancia mínima entre dos posiciones para estimar un rumbo (m).
const DISTANCIA_RUMBO_MIN: f64 = 0.05;

/// Media móvil centrada de `ventana_m` metros.
///
/// No promedia a través de huecos: la ventana se corta en el primer `None` a
/// cada lado. Un punto `None` sigue siendo `None`.
pub fn suavizar(canal: &[Option<f64>], s: &[f64], ventana_m: f64) -> Vec<Option<f64>> {
    let n = canal.len().min(s.len());
    let medio = ventana_m.max(0.0) / 2.0;
    let mut salida = vec![None; canal.len()];
    for i in 0..n {
        let Some(centro) = canal[i] else {
            continue;
        };
        let mut suma = centro;
        let mut cuenta = 1.0;
        let mut j = i;
        while j > 0 && s[i] - s[j - 1] <= medio + 1e-9 {
            let Some(valor) = canal[j - 1] else {
                break;
            };
            suma += valor;
            cuenta += 1.0;
            j -= 1;
        }
        let mut j = i + 1;
        while j < n && s[j] - s[i] <= medio + 1e-9 {
            let Some(valor) = canal[j] else {
                break;
            };
            suma += valor;
            cuenta += 1.0;
            j += 1;
        }
        salida[i] = Some(suma / cuenta);
    }
    salida
}

/// Derivada de `canal` respecto de `x` (diferencia centrada).
///
/// En los bordes y junto a un hueco usa la diferencia hacia el vecino que
/// exista; sin vecinos válidos queda `None`.
pub fn derivada(canal: &[Option<f64>], x: &[Option<f64>]) -> Vec<Option<f64>> {
    let n = canal.len().min(x.len());
    let par = |i: usize| -> Option<(f64, f64)> { Some((x[i]?, canal[i]?)) };
    let mut salida = vec![None; canal.len()];
    for i in 0..n {
        let Some(actual) = par(i) else {
            continue;
        };
        let anterior = if i > 0 { par(i - 1) } else { None };
        let siguiente = if i + 1 < n { par(i + 1) } else { None };
        let (a, b) = match (anterior, siguiente) {
            (Some(a), Some(b)) => (a, b),
            (Some(a), None) => (a, actual),
            (None, Some(b)) => (actual, b),
            (None, None) => continue,
        };
        let dx = b.0 - a.0;
        if dx.abs() > 1e-12 {
            let valor = (b.1 - a.1) / dx;
            if valor.is_finite() {
                salida[i] = Some(valor);
            }
        }
    }
    salida
}

/// Derivada respecto del arco de pista `s`.
pub fn derivada_en_s(canal: &[Option<f64>], s: &[f64]) -> Vec<Option<f64>> {
    let x: Vec<Option<f64>> = s.iter().map(|&valor| Some(valor)).collect();
    derivada(canal, &x)
}

/// Derivada respecto del tiempo de la vuelta.
pub fn derivada_en_t(canal: &[Option<f64>], tiempo: &[Option<f64>]) -> Vec<Option<f64>> {
    derivada(canal, tiempo)
}

/// Pasa un canal `f32` alineado a `f64`.
pub fn a_f64(canal: &[Option<f32>]) -> Vec<Option<f64>> {
    canal
        .iter()
        .map(|valor| {
            valor
                .map(|valor| valor as f64)
                .filter(|valor| valor.is_finite())
        })
        .collect()
}

/// Tasa de yaw (rad/s), suavizada.
pub fn tasa_de_yaw(vuelta: &VueltaAlineada) -> Vec<Option<f64>> {
    let yaw = a_f64(&vuelta.yaw);
    let tasa = derivada_en_t(&yaw, &vuelta.tiempo);
    suavizar(&tasa, &vuelta.s, VENTANA_SUAVIZADO_GIRO_M)
}

/// Rumbo de la trayectoria real del auto en el plano `x`/`z`, desenrollado.
///
/// Usa la misma convención que [`crate::vuelta::rumbo_de_posiciones`]:
/// `atan2(dx, dz)`.
pub fn rumbo_trayectoria(vuelta: &VueltaAlineada) -> Vec<Option<f64>> {
    let n = vuelta.x.len().min(vuelta.z.len());
    let posicion = |i: usize| -> Option<(f64, f64)> {
        let x = vuelta.x[i]? as f64;
        let z = vuelta.z[i]? as f64;
        (x.is_finite() && z.is_finite()).then_some((x, z))
    };
    let mut crudo = vec![None; n];
    for i in 0..n {
        let a = if i > 0 { posicion(i - 1) } else { None };
        let b = if i + 1 < n { posicion(i + 1) } else { None };
        let actual = posicion(i);
        let (a, b) = match (a, actual, b) {
            (Some(a), _, Some(b)) => (a, b),
            (Some(a), Some(c), None) => (a, c),
            (None, Some(c), Some(b)) => (c, b),
            _ => continue,
        };
        let dx = b.0 - a.0;
        let dz = b.1 - a.1;
        if (dx * dx + dz * dz).sqrt() >= DISTANCIA_RUMBO_MIN {
            crudo[i] = Some(dx.atan2(dz));
        }
    }
    desenrollar(&crudo)
}

/// Curvatura con signo de la trayectoria real (1/m), suavizada.
///
/// Es el giro del rumbo de la trayectoria por metro recorrido por el auto.
pub fn curvatura_trayectoria(vuelta: &VueltaAlineada) -> Vec<Option<f64>> {
    let rumbo = rumbo_trayectoria(vuelta);
    let n = rumbo.len();
    let mut recorrido = vec![None; n];
    let mut acumulado = 0.0;
    let mut anterior: Option<(f64, f64)> = None;
    for i in 0..n {
        let (Some(x), Some(z)) = (vuelta.x[i], vuelta.z[i]) else {
            anterior = None;
            continue;
        };
        let actual = (x as f64, z as f64);
        if let Some(previo) = anterior {
            acumulado += ((actual.0 - previo.0).powi(2) + (actual.1 - previo.1).powi(2)).sqrt();
        }
        recorrido[i] = Some(acumulado);
        anterior = Some(actual);
    }
    let curvatura = derivada(&rumbo, &recorrido);
    suavizar(&curvatura, &vuelta.s, VENTANA_SUAVIZADO_GIRO_M)
}

/// Quita los saltos de ±π de un ángulo, respetando los huecos.
pub fn desenrollar(angulo: &[Option<f64>]) -> Vec<Option<f64>> {
    let mut salida = vec![None; angulo.len()];
    let mut previo: Option<(f64, f64)> = None;
    for (i, valor) in angulo.iter().enumerate() {
        let Some(valor) = *valor else {
            continue;
        };
        let continuo = match previo {
            Some((crudo, acumulado)) => acumulado + envolver_pi(valor - crudo),
            None => valor,
        };
        salida[i] = Some(continuo);
        previo = Some((valor, continuo));
    }
    salida
}

/// Lleva un ángulo a `(-π, π]`.
pub fn envolver_pi(angulo: f64) -> f64 {
    let mut valor = angulo % std::f64::consts::TAU;
    if valor > std::f64::consts::PI {
        valor -= std::f64::consts::TAU;
    } else if valor <= -std::f64::consts::PI {
        valor += std::f64::consts::TAU;
    }
    valor
}

/// Lleva una distancia sobre la pista a `(-L/2, L/2]`.
pub fn envolver_distancia(valor: f64, longitud: f64) -> f64 {
    if !valor.is_finite() || longitud <= 0.0 {
        return valor;
    }
    let mut resto = valor % longitud;
    if resto > longitud / 2.0 {
        resto -= longitud;
    } else if resto <= -longitud / 2.0 {
        resto += longitud;
    }
    resto
}

/// Lleva un `s` extendido a `[0, L]`.
pub fn s_en_pista(s: f64, longitud: f64) -> f64 {
    if !s.is_finite() || longitud <= 0.0 {
        return s;
    }
    let resto = s.rem_euclid(longitud);
    // El último punto de la grilla vale exactamente L: se conserva.
    if resto == 0.0 && s > 0.0 {
        longitud
    } else {
        resto
    }
}

/// Punto de la grilla dentro de un tramo extendido.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PuntoTramo {
    /// Índice en la grilla.
    pub indice: usize,
    /// Arco extendido (puede ser < 0 o > L).
    pub s: f64,
}

/// Índices de la grilla que cubren el tramo extendido `[a, b]`, en orden de
/// recorrido (ING09).
///
/// Si el tramo cruza la meta se parte en dos rangos. El último punto de la
/// grilla (`s = L`) y el primero (`s = 0`) son el mismo lugar físico: aparecen
/// los dos, con el mismo `s` extendido, para que el tiempo no salte.
pub fn puntos_de_tramo(s: &[f64], a: f64, b: f64) -> Vec<PuntoTramo> {
    let n = s.len();
    if n == 0 || !a.is_finite() || !b.is_finite() || b < a {
        return Vec::new();
    }
    let longitud = s[n - 1];
    if longitud <= 0.0 {
        return Vec::new();
    }
    let mut salida = Vec::new();
    // Se recorre vuelta por vuelta de la pista (k = desplazamiento en L).
    let k_ini = (a / longitud).floor() as i64;
    let k_fin = (b / longitud).floor() as i64;
    for k in k_ini..=k_fin {
        let base = k as f64 * longitud;
        let desde = (a - base).max(0.0);
        let hasta = (b - base).min(longitud);
        if hasta < desde {
            continue;
        }
        let i0 = s.partition_point(|&valor| valor < desde - 1e-9);
        let i1 = s.partition_point(|&valor| valor <= hasta + 1e-9);
        for indice in i0..i1 {
            salida.push(PuntoTramo {
                indice,
                s: s[indice] + base,
            });
        }
    }
    salida
}

/// Valor de un canal en un índice, como `f64` finito.
pub fn valor(canal: &[Option<f32>], indice: usize) -> Option<f64> {
    canal
        .get(indice)
        .copied()
        .flatten()
        .map(|valor| valor as f64)
        .filter(|valor| valor.is_finite())
}

/// Tiempo transcurrido entre dos puntos de un tramo (s).
///
/// Suma los pasos entre puntos consecutivos con avance positivo; el par
/// `L → 0` de la meta no avanza y no suma. Si falta un tiempo devuelve `NaN`.
pub fn tiempo_en_tramo(
    puntos: &[PuntoTramo],
    tiempo: &[Option<f64>],
    desde: usize,
    hasta: usize,
) -> f64 {
    if hasta <= desde || hasta >= puntos.len() {
        return if hasta == desde { 0.0 } else { f64::NAN };
    }
    let mut total = 0.0;
    for par in puntos[desde..=hasta].windows(2) {
        if par[1].s - par[0].s <= 0.0 {
            continue;
        }
        let (Some(t0), Some(t1)) = (
            tiempo.get(par[0].indice).copied().flatten(),
            tiempo.get(par[1].indice).copied().flatten(),
        ) else {
            return f64::NAN;
        };
        total += t1 - t0;
    }
    total
}

/// Mediana de una lista (descarta no finitos). `NaN` si queda vacía.
pub fn mediana(valores: &mut Vec<f64>) -> f64 {
    valores.retain(|valor| valor.is_finite());
    if valores.is_empty() {
        return f64::NAN;
    }
    valores.sort_by(f64::total_cmp);
    let n = valores.len();
    if n % 2 == 1 {
        valores[n / 2]
    } else {
        (valores[n / 2 - 1] + valores[n / 2]) / 2.0
    }
}

/// Desvío estándar muestral. `NaN` con menos de dos valores finitos.
pub fn desvio_estandar(valores: &[f64]) -> f64 {
    let finitos: Vec<f64> = valores.iter().copied().filter(|v| v.is_finite()).collect();
    if finitos.len() < 2 {
        return f64::NAN;
    }
    let media = finitos.iter().sum::<f64>() / finitos.len() as f64;
    let suma: f64 = finitos.iter().map(|v| (v - media).powi(2)).sum();
    (suma / (finitos.len() - 1) as f64).sqrt()
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn grilla(n: usize, paso: f64) -> Vec<f64> {
        (0..n).map(|i| i as f64 * paso).collect()
    }

    #[test]
    fn suavizado_no_cruza_huecos() {
        let s = grilla(7, 1.0);
        let canal = vec![
            Some(0.0),
            Some(0.0),
            Some(0.0),
            None,
            Some(9.0),
            Some(9.0),
            Some(9.0),
        ];
        let suave = suavizar(&canal, &s, 4.0);
        assert_eq!(suave[3], None);
        assert_eq!(suave[2], Some(0.0));
        assert_eq!(suave[4], Some(9.0));
    }

    #[test]
    fn suavizado_promedia_dentro_de_la_ventana() {
        let s = grilla(5, 1.0);
        let canal = vec![Some(0.0), Some(0.0), Some(3.0), Some(0.0), Some(0.0)];
        let suave = suavizar(&canal, &s, 2.0);
        assert!((suave[2].unwrap() - 1.0).abs() < 1e-12);
        assert!((suave[1].unwrap() - 1.0).abs() < 1e-12);
        assert_eq!(suave[0], Some(0.0));
    }

    #[test]
    fn derivada_de_rampa_es_exacta() {
        let s = grilla(10, 0.5);
        let canal: Vec<Option<f64>> = s.iter().map(|&x| Some(3.0 * x + 1.0)).collect();
        for valor in derivada_en_s(&canal, &s) {
            assert!((valor.unwrap() - 3.0).abs() < 1e-6);
        }
    }

    #[test]
    fn derivada_sin_vecinos_es_none() {
        let s = grilla(3, 1.0);
        let canal = vec![None, Some(1.0), None];
        assert_eq!(derivada_en_s(&canal, &s), vec![None, None, None]);
    }

    #[test]
    fn tramo_que_cruza_la_meta_se_parte() {
        let s = grilla(11, 10.0); // L = 100
        let puntos = puntos_de_tramo(&s, 80.0, 120.0);
        let indices: Vec<usize> = puntos.iter().map(|p| p.indice).collect();
        assert_eq!(indices, vec![8, 9, 10, 0, 1, 2]);
        let arcos: Vec<f64> = puntos.iter().map(|p| p.s).collect();
        assert_eq!(arcos, vec![80.0, 90.0, 100.0, 100.0, 110.0, 120.0]);
    }

    #[test]
    fn tramo_con_inicio_negativo() {
        let s = grilla(11, 10.0);
        let indices: Vec<usize> = puntos_de_tramo(&s, -15.0, 10.0)
            .iter()
            .map(|p| p.indice)
            .collect();
        assert_eq!(indices, vec![9, 10, 0, 1]);
    }

    #[test]
    fn tiempo_en_tramo_no_salta_en_la_meta() {
        let s = grilla(11, 10.0);
        // 1 s cada 10 m; la vuelta dura 10 s.
        let tiempo: Vec<Option<f64>> = (0..11).map(|i| Some(i as f64)).collect();
        let puntos = puntos_de_tramo(&s, 80.0, 120.0);
        let total = tiempo_en_tramo(&puntos, &tiempo, 0, puntos.len() - 1);
        assert!((total - 4.0).abs() < 1e-9);
    }

    #[test]
    fn distancias_y_angulos_se_envuelven() {
        assert!((envolver_distancia(95.0, 100.0) + 5.0).abs() < 1e-9);
        assert!((envolver_pi(3.0 * std::f64::consts::PI) - std::f64::consts::PI).abs() < 1e-9);
        assert_eq!(s_en_pista(-10.0, 100.0), 90.0);
        assert_eq!(s_en_pista(110.0, 100.0), 10.0);
    }

    #[test]
    fn desvio_y_mediana() {
        assert!((desvio_estandar(&[1.0, 2.0, 3.0]) - 1.0).abs() < 1e-12);
        assert!(desvio_estandar(&[1.0]).is_nan());
        assert_eq!(mediana(&mut vec![3.0, 1.0, f64::NAN, 2.0]), 2.0);
    }
}
