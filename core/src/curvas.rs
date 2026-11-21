//! Detección de curvas sobre `fast_lane.ai` y métricas por curva (RF-011, RF-015).
//!
//! Hay **una sola** implementación (D-02): la curvatura se calcula una vez al
//! cargar la pista y el resultado queda cacheado en [`Pista::curvas`]. La
//! numeración `C1..Cn` depende solo de la geometría, no de la vuelta ni del auto
//! (D-01).
//!
//! A diferencia de v1 la ventana de curvatura es cíclica cuando la pista cierra
//! (el último punto queda a un paso del primero): una curva que cruza la meta se
//! detecta como un solo arco con `s_fin > longitud_m` (R-09). Una pista abierta
//! (fixture sintético sin cierre) se analiza sin envolver.
//!
//! Las métricas y el delta trabajan sobre canales ya alineados a la grilla común
//! de `s` (fase 5); un valor ausente (`None`) no se inventa, queda `NaN`.

use crate::pista::Pista;

/// Radio a partir del cual se considera que empieza una curva (m).
pub const R_CURVA: f64 = 300.0;
/// Radio a partir del cual se considera que la curva terminó (m). La diferencia
/// con [`R_CURVA`] es la histéresis que evita arcos partidos por ruido.
pub const R_RECTA: f64 = 1200.0;
/// Largo mínimo de un arco para conservarlo (m).
pub const CURVA_LARGO_MIN: f64 = 20.0;
/// Separación máxima entre dos arcos del mismo sentido para unirlos (m).
pub const CURVA_GAP: f64 = 10.0;
/// Giro mínimo acumulado de un arco para conservarlo (rad).
pub const CURVA_GIRO_MIN: f64 = 0.1;
/// Puntos a cada lado usados para estimar la curvatura.
pub const VENTANA_CURVATURA: usize = 6;

/// Primer valor de freno que marca el inicio de la frenada.
pub const FRENO_UMBRAL: f32 = 0.45;
/// Primer valor de acelerador que marca la reaceleración.
pub const GAS_UMBRAL: f32 = 0.9;

/// Sentido de giro de una curva.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sentido {
    Izquierda,
    Derecha,
}

impl Sentido {
    /// Texto en español para la UI.
    pub fn etiqueta(&self) -> &'static str {
        match self {
            Sentido::Izquierda => "izquierda",
            Sentido::Derecha => "derecha",
        }
    }
}

/// Curva canónica de la pista, expresada en `s`.
///
/// `s_fin` puede superar [`Pista::longitud_m`] cuando el arco cruza la meta
/// (R-09). El `largo` y el `giro` ya están filtrados y el sentido usa la
/// convención de v1: giro positivo → derecha.
#[derive(Debug, Clone, PartialEq)]
pub struct CurvaPista {
    /// Número estable `1..n` (el nombre visible es `C{n}`).
    pub n: usize,
    /// Nombre visible, por ejemplo `C3`.
    pub nombre: String,
    pub s_ini: f64,
    pub s_apex: f64,
    pub s_fin: f64,
    /// Largo del arco (m): `s_fin - s_ini`.
    pub largo: f64,
    /// Radio mínimo dentro del arco (m).
    pub radio_min: f64,
    /// Giro acumulado en valor absoluto (rad).
    pub giro: f64,
    pub sentido: Sentido,
}

/// Curvatura con signo de cada punto de la línea central (1/m).
///
/// Es la única fuente de curvatura de la app. La ventana es de
/// [`VENTANA_CURVATURA`] puntos a cada lado y, si la pista cierra, envuelve por
/// la meta.
pub fn curvatura(pista: &Pista) -> Vec<f64> {
    geometria(pista).kappa
}

/// Geometría auxiliar compartida por la curvatura y la detección.
struct Geometria {
    s: Vec<f64>,
    kappa: Vec<f64>,
    /// Rumbo desenrollado en cada punto (rad).
    theta: Vec<f64>,
    /// Giro de una vuelta completa; 0 en pistas abiertas.
    giro_total: f64,
    /// Largo del ciclo si la pista cierra; `None` si está abierta.
    periodo: Option<f64>,
}

fn geometria(pista: &Pista) -> Geometria {
    let s = arco_de_pista(pista);
    let n = s.len();
    if n < 3 {
        return Geometria {
            kappa: vec![0.0; n],
            theta: vec![0.0; n],
            giro_total: 0.0,
            periodo: None,
            s,
        };
    }

    let periodo = periodo_ciclico(pista, &s);
    if let Some(periodo) = periodo {
        let (kappa, theta, giro_total) = curvatura_cerrada(pista, &s, periodo);
        Geometria {
            s,
            kappa,
            theta,
            giro_total,
            periodo: Some(periodo),
        }
    } else {
        let (kappa, theta) = curvatura_abierta(pista, &s);
        Geometria {
            s,
            kappa,
            theta,
            giro_total: 0.0,
            periodo: None,
        }
    }
}

/// Arco acumulado sobre la línea central, normalizado para empezar en 0.
fn arco_de_pista(pista: &Pista) -> Vec<f64> {
    let n = pista.puntos();
    let mut s = Vec::with_capacity(n);
    if n == 0 {
        return s;
    }

    let usable = n >= 2
        && pista.ns[0].is_finite()
        && (1..n).all(|i| pista.ns[i].is_finite() && pista.ns[i] > pista.ns[i - 1])
        && pista.ns[n - 1] > 0.0;

    if usable {
        s.extend(pista.ns.iter().map(|&v| v as f64));
    } else {
        s.push(0.0);
        for i in 1..n {
            s.push(s[i - 1] + distancia(pista, i - 1, i));
        }
    }

    let base = s[0];
    if base != 0.0 {
        for valor in &mut s {
            *valor -= base;
        }
    }
    s
}

fn distancia(pista: &Pista, a: usize, b: usize) -> f64 {
    let dx = (pista.nx[b] - pista.nx[a]) as f64;
    let dz = (pista.nz[b] - pista.nz[a]) as f64;
    (dx * dx + dz * dz).sqrt()
}

/// Largo del ciclo si el último punto queda a un paso del primero.
///
/// Un `fast_lane.ai` real es una vuelta cerrada. Los fixtures abiertos (una
/// recta, una recta-curva-recta) tienen un cierre enorme: en ese caso no se
/// envuelve, para no inventar una curva en el borde artificial.
fn periodo_ciclico(pista: &Pista, s: &[f64]) -> Option<f64> {
    let n = s.len();
    if n < 3 {
        return None;
    }
    let cierre = distancia(pista, n - 1, 0);
    let mut pasos: Vec<f64> = s
        .windows(2)
        .map(|par| par[1] - par[0])
        .filter(|paso| paso.is_finite() && *paso > 0.0)
        .collect();
    if pasos.is_empty() {
        return None;
    }
    pasos.sort_by(f64::total_cmp);
    let mediana = pasos[pasos.len() / 2];
    let cerrada = cierre.is_finite() && cierre <= (mediana * 5.0).max(2.0);
    cerrada.then_some(s[n - 1] + cierre)
}

/// Rumbo y curvatura con ventana cíclica (pista cerrada).
fn curvatura_cerrada(
    pista: &Pista,
    s: &[f64],
    periodo: f64,
) -> (Vec<f64>, Vec<f64>, f64) {
    let n = s.len();
    let kw = VENTANA_CURVATURA;
    let largo = n + 2 * kw + 1;

    let mut x = Vec::with_capacity(largo);
    let mut z = Vec::with_capacity(largo);
    let mut sa = Vec::with_capacity(largo);
    for j in 0..largo {
        let rel = j as isize - kw as isize;
        let k = rel.rem_euclid(n as isize) as usize;
        let vueltas = if rel < 0 {
            -1.0
        } else if rel >= n as isize {
            1.0
        } else {
            0.0
        };
        x.push(pista.nx[k] as f64);
        z.push(pista.nz[k] as f64);
        sa.push(s[k] + vueltas * periodo);
    }

    // Rumbo por segmento (punto j → j+1), desenrollado en orden cíclico.
    let mut theta = Vec::with_capacity(largo - 1);
    let mut previo = 0.0;
    for j in 0..largo - 1 {
        let crudo = (z[j + 1] - z[j]).atan2(x[j + 1] - x[j]);
        if j == 0 {
            theta.push(crudo);
            previo = crudo;
        } else {
            previo += envolver(crudo - previo);
            theta.push(previo);
        }
    }

    let mut kappa = vec![0.0; n];
    let mut theta_punto = Vec::with_capacity(n);
    for k in 0..n {
        let a = k;
        let b = k + 2 * kw;
        let ds = sa[b] - sa[a];
        kappa[k] = if ds > 0.5 {
            (theta[b] - theta[a]) / ds
        } else {
            0.0
        };
        theta_punto.push(theta[k + kw]);
    }

    let giro_total = theta[kw + n] - theta[kw];
    (kappa, theta_punto, giro_total)
}

/// Rumbo y curvatura sin envolver (pista abierta).
fn curvatura_abierta(pista: &Pista, s: &[f64]) -> (Vec<f64>, Vec<f64>) {
    let n = s.len();
    let mut theta = Vec::with_capacity(n);
    let mut previo = 0.0;
    for i in 0..n - 1 {
        let crudo =
            ((pista.nz[i + 1] - pista.nz[i]) as f64).atan2((pista.nx[i + 1] - pista.nx[i]) as f64);
        if i == 0 {
            theta.push(crudo);
        } else {
            previo += envolver(crudo - previo);
            theta.push(previo);
        }
        previo = *theta.last().unwrap();
    }
    // El último punto no tiene segmento propio: se repite el rumbo anterior.
    if let Some(&ultimo) = theta.last() {
        theta.push(ultimo);
    }

    let kw = VENTANA_CURVATURA;
    let mut kappa = vec![0.0; n];
    for (i, valor) in kappa.iter_mut().enumerate() {
        let a = i.saturating_sub(kw);
        let b = (i + kw).min(n - 1);
        let ds = s[b] - s[a];
        *valor = if ds > 0.5 {
            (theta[b] - theta[a]) / ds
        } else {
            0.0
        };
    }
    (kappa, theta)
}

fn envolver(angulo: f64) -> f64 {
    let tau = std::f64::consts::TAU;
    angulo - tau * (angulo / tau).round()
}

/// Arco intermedio antes de filtrar y numerar.
#[derive(Debug, Clone, Copy)]
struct ArcoDetectado {
    s_ini: f64,
    s_apex: f64,
    s_fin: f64,
    radio_min: f64,
    /// Giro con signo (rad).
    giro: f64,
}

impl ArcoDetectado {
    fn a_curva(self) -> CurvaPista {
        CurvaPista {
            n: 0,
            nombre: String::new(),
            s_ini: self.s_ini,
            s_apex: self.s_apex,
            s_fin: self.s_fin,
            largo: self.s_fin - self.s_ini,
            radio_min: self.radio_min,
            giro: self.giro.abs(),
            sentido: if self.giro >= 0.0 {
                Sentido::Derecha
            } else {
                Sentido::Izquierda
            },
        }
    }
}

/// Detecta y numera las curvas de la pista (RF-011).
pub fn detectar_curvas(pista: &Pista) -> Vec<CurvaPista> {
    let geometria = geometria(pista);
    let n = geometria.s.len();
    if n < 3 {
        return Vec::new();
    }

    let radios: Vec<f64> = geometria
        .kappa
        .iter()
        .map(|&k| {
            if k.abs() > 1e-6 {
                1.0 / k.abs()
            } else {
                f64::INFINITY
            }
        })
        .collect();

    let arcos = match geometria.periodo {
        Some(periodo) => detectar_ciclico(
            &geometria.s,
            &radios,
            &geometria.kappa,
            &geometria.theta,
            geometria.giro_total,
            periodo,
        ),
        None => detectar_abierto(
            &geometria.s,
            &radios,
            &geometria.kappa,
            &geometria.theta,
        ),
    };

    let mut curvas: Vec<CurvaPista> = arcos.into_iter().map(ArcoDetectado::a_curva).collect();
    curvas.sort_by(|a, b| a.s_ini.total_cmp(&b.s_ini));
    curvas = unir_dobles_apices(curvas, geometria.periodo);

    let mut salida: Vec<CurvaPista> = curvas
        .into_iter()
        .filter(|c| c.largo >= CURVA_LARGO_MIN && c.giro >= CURVA_GIRO_MIN)
        .collect();
    for (indice, curva) in salida.iter_mut().enumerate() {
        curva.n = indice + 1;
        curva.nombre = format!("C{}", indice + 1);
    }
    salida
}

fn detectar_abierto(
    s: &[f64],
    radios: &[f64],
    kappa: &[f64],
    theta: &[f64],
) -> Vec<ArcoDetectado> {
    let n = s.len();
    let mut arcos = Vec::new();
    let mut dentro = false;
    let mut ini = 0usize;
    let mut apex = 0usize;
    let mut radio_min = f64::INFINITY;
    let mut theta_ini = 0.0;
    let mut signo = 0.0;

    for i in 0..n {
        if !dentro {
            if radios[i] < R_CURVA {
                dentro = true;
                ini = i;
                apex = i;
                radio_min = radios[i];
                theta_ini = theta[i];
                signo = kappa[i].signum();
            }
            continue;
        }

        if radios[i] < radio_min {
            radio_min = radios[i];
            apex = i;
        }

        let signo_actual = kappa[i].signum();
        if radios[i] > R_RECTA {
            arcos.push(ArcoDetectado {
                s_ini: s[ini],
                s_apex: s[apex],
                s_fin: s[i],
                radio_min,
                giro: theta[i] - theta_ini,
            });
            dentro = false;
        } else if signo_actual != 0.0
            && signo != 0.0
            && signo_actual != signo
            && radios[i] < R_CURVA
        {
            // Chicane: cierra el arco y abre el siguiente en el mismo punto.
            arcos.push(ArcoDetectado {
                s_ini: s[ini],
                s_apex: s[apex],
                s_fin: s[i],
                radio_min,
                giro: theta[i] - theta_ini,
            });
            ini = i;
            apex = i;
            radio_min = radios[i];
            theta_ini = theta[i];
            signo = signo_actual;
        }
    }

    if dentro {
        let i = n - 1;
        arcos.push(ArcoDetectado {
            s_ini: s[ini],
            s_apex: s[apex],
            s_fin: s[i],
            radio_min,
            giro: theta[i] - theta_ini,
        });
    }
    arcos
}

fn detectar_ciclico(
    s: &[f64],
    radios: &[f64],
    kappa: &[f64],
    theta: &[f64],
    giro_total: f64,
    periodo: f64,
) -> Vec<ArcoDetectado> {
    let n = s.len();

    // Se arranca en el punto menos curvado para no partir una curva en el corte.
    let mut inicio = 0usize;
    for i in 1..n {
        if radios[i] > radios[inicio] {
            inicio = i;
        }
    }

    if radios[inicio] < R_CURVA {
        // Toda la vuelta es curva: un único arco que cruza la meta.
        let mut apex = 0usize;
        for i in 1..n {
            if radios[i] < radios[apex] {
                apex = i;
            }
        }
        return vec![ArcoDetectado {
            s_ini: 0.0,
            s_apex: s[apex],
            s_fin: periodo,
            radio_min: radios[apex],
            giro: giro_total,
        }];
    }

    let longitud = s[n - 1];
    let mut arcos = Vec::new();
    let mut dentro = false;
    let mut ini_s = 0.0;
    let mut apex_s = 0.0;
    let mut radio_min = f64::INFINITY;
    let mut theta_ini = 0.0;
    let mut signo = 0.0;

    for t in 0..n {
        let pos = inicio + t;
        let k = pos % n;
        let vueltas = (pos / n) as f64;
        let sc = s[k] + vueltas * periodo;
        let tc = theta[k] + vueltas * giro_total;

        if !dentro {
            if radios[k] < R_CURVA {
                dentro = true;
                ini_s = sc;
                apex_s = sc;
                radio_min = radios[k];
                theta_ini = tc;
                signo = kappa[k].signum();
            }
            continue;
        }

        if radios[k] < radio_min {
            radio_min = radios[k];
            apex_s = sc;
        }

        let signo_actual = kappa[k].signum();
        if radios[k] > R_RECTA {
            arcos.push(ArcoDetectado {
                s_ini: ini_s,
                s_apex: apex_s,
                s_fin: sc,
                radio_min,
                giro: tc - theta_ini,
            });
            dentro = false;
        } else if signo_actual != 0.0
            && signo != 0.0
            && signo_actual != signo
            && radios[k] < R_CURVA
        {
            arcos.push(ArcoDetectado {
                s_ini: ini_s,
                s_apex: apex_s,
                s_fin: sc,
                radio_min,
                giro: tc - theta_ini,
            });
            ini_s = sc;
            apex_s = sc;
            radio_min = radios[k];
            theta_ini = tc;
            signo = signo_actual;
        }
    }

    if dentro {
        let pos = inicio + n - 1;
        let k = pos % n;
        let vueltas = (pos / n) as f64;
        arcos.push(ArcoDetectado {
            s_ini: ini_s,
            s_apex: apex_s,
            s_fin: s[k] + vueltas * periodo,
            radio_min,
            giro: theta[k] + vueltas * giro_total - theta_ini,
        });
    }

    // Lleva cada arco a `s_ini ∈ [0, longitud)`, conservando `s_fin > longitud`
    // cuando cruza la meta.
    for arco in &mut arcos {
        let vueltas = (arco.s_ini / periodo).floor();
        arco.s_ini -= vueltas * periodo;
        arco.s_apex -= vueltas * periodo;
        arco.s_fin -= vueltas * periodo;
        if arco.s_ini >= longitud {
            arco.s_ini -= longitud;
            arco.s_apex -= longitud;
            arco.s_fin -= longitud;
        }
    }

    arcos
}

/// Une arcos del mismo sentido separados por [`CURVA_GAP`] o menos (dobles
/// ápices), incluido el par que cruza la meta.
fn unir_dobles_apices(curvas: Vec<CurvaPista>, periodo: Option<f64>) -> Vec<CurvaPista> {
    if curvas.len() < 2 {
        return curvas;
    }

    let mut salida: Vec<CurvaPista> = Vec::with_capacity(curvas.len());
    for curva in curvas {
        let fusionar = salida.last().is_some_and(|prev: &CurvaPista| {
            let hueco = curva.s_ini - prev.s_fin;
            prev.sentido == curva.sentido && (-1e-9..=CURVA_GAP).contains(&hueco)
        });
        if fusionar {
            let prev = salida.last_mut().unwrap();
            fusionar_arcos(prev, &curva, 0.0);
        } else {
            salida.push(curva);
        }
    }

    if let Some(periodo) = periodo {
        if salida.len() >= 2 {
            let primero = salida[0].clone();
            let hueco = primero.s_ini + periodo - salida.last().unwrap().s_fin;
            if salida.last().unwrap().sentido == primero.sentido
                && (-1e-9..=CURVA_GAP).contains(&hueco)
            {
                let ultimo = salida.last_mut().unwrap();
                fusionar_arcos(ultimo, &primero, periodo);
                salida.remove(0);
            }
        }
    }
    salida
}

/// Extiende `destino` con `origen`, sumando `desplazamiento` a las `s` del
/// origen (para el cruce de meta).
fn fusionar_arcos(destino: &mut CurvaPista, origen: &CurvaPista, desplazamiento: f64) {
    destino.s_fin = origen.s_fin + desplazamiento;
    destino.largo = destino.s_fin - destino.s_ini;
    destino.giro += origen.giro;
    if origen.radio_min < destino.radio_min {
        destino.radio_min = origen.radio_min;
        destino.s_apex = origen.s_apex + desplazamiento;
    }
}

/// Canales de una vuelta ya remuestreados a la grilla común de `s`.
///
/// `s` es la grilla (creciente) y cada canal tiene el mismo largo. Un `None`
/// representa un hueco: la métrica correspondiente queda `NaN`.
pub struct CanalesAlineados<'a> {
    pub s: &'a [f64],
    pub velocidad: &'a [Option<f32>],
    pub freno: &'a [Option<f32>],
    pub gas: &'a [Option<f32>],
    pub tiempo: &'a [Option<f64>],
}

/// Métricas de una vuelta dentro de una curva (RF-011).
///
/// No hay `Option`: igual que v1, lo que no se puede calcular queda `NaN`.
#[derive(Debug, Clone, PartialEq)]
pub struct MetricasCurva {
    pub v_min: f64,
    pub v_ini: f64,
    pub v_apex: f64,
    pub v_fin: f64,
    pub t_curva: f64,
    pub d_fren: f64,
    pub d_acel: f64,
}

impl MetricasCurva {
    fn vacia() -> Self {
        Self {
            v_min: f64::NAN,
            v_ini: f64::NAN,
            v_apex: f64::NAN,
            v_fin: f64::NAN,
            t_curva: f64::NAN,
            d_fren: f64::NAN,
            d_acel: f64::NAN,
        }
    }
}

/// Calcula las métricas de una curva sobre los canales alineados de una vuelta.
pub fn metricas_curva(canales: &CanalesAlineados<'_>, curva: &CurvaPista) -> MetricasCurva {
    let indices = indices_de_curva(canales.s, curva);
    let Some(&primero) = indices.first() else {
        return MetricasCurva::vacia();
    };
    let ultimo = *indices.last().unwrap();

    let v_ini = valor_f32(canales.velocidad, primero);
    let v_fin = valor_f32(canales.velocidad, ultimo);

    let mut v_min = f64::INFINITY;
    let mut pos_min = None;
    for (posicion, &indice) in indices.iter().enumerate() {
        if let Some(valor) = opcion_f32(canales.velocidad, indice) {
            if valor < v_min {
                v_min = valor;
                pos_min = Some(posicion);
            }
        }
    }
    let v_apex = pos_min
        .map(|posicion| valor_f32(canales.velocidad, indices[posicion]))
        .unwrap_or(f64::NAN);

    let d_fren = indices
        .iter()
        .find(|&&indice| {
            canales
                .freno
                .get(indice)
                .copied()
                .flatten()
                .is_some_and(|valor| valor > FRENO_UMBRAL)
        })
        .map(|&indice| canales.s[indice])
        .unwrap_or(f64::NAN);

    let d_acel = pos_min
        .and_then(|posicion| {
            indices[posicion..].iter().find_map(|&indice| {
                canales
                    .gas
                    .get(indice)
                    .copied()
                    .flatten()
                    .filter(|&valor| valor > GAS_UMBRAL)
                    .map(|_| canales.s[indice])
            })
        })
        .unwrap_or(f64::NAN);

    MetricasCurva {
        v_min: if v_min.is_finite() { v_min } else { f64::NAN },
        v_ini,
        v_apex,
        v_fin,
        t_curva: tiempo_de_curva(canales, curva, primero, ultimo),
        d_fren,
        d_acel,
    }
}

/// Índices de la grilla que cubren la curva, en orden de recorrido.
///
/// Un arco que cruza la meta se parte en dos rangos: primero el final de la
/// vuelta y después el principio.
fn indices_de_curva(s: &[f64], curva: &CurvaPista) -> Vec<usize> {
    let n = s.len();
    if n == 0 {
        return Vec::new();
    }
    let longitud = s[n - 1];
    let i0 = s.partition_point(|&valor| valor < curva.s_ini);
    if i0 >= n {
        return Vec::new();
    }

    if curva.s_fin <= longitud + 1e-9 {
        let i1 = s
            .partition_point(|&valor| valor <= curva.s_fin + 1e-9)
            .saturating_sub(1);
        return if i1 < i0 {
            Vec::new()
        } else {
            (i0..=i1).collect()
        };
    }

    let resto = curva.s_fin - longitud;
    let i1 = s
        .partition_point(|&valor| valor <= resto + 1e-9)
        .saturating_sub(1);
    let mut indices: Vec<usize> = (i0..n).collect();
    if i1 < n {
        indices.extend(0..=i1);
    }
    indices
}

fn valor_f32(canal: &[Option<f32>], indice: usize) -> f64 {
    opcion_f32(canal, indice).unwrap_or(f64::NAN)
}

fn opcion_f32(canal: &[Option<f32>], indice: usize) -> Option<f64> {
    canal
        .get(indice)
        .copied()
        .flatten()
        .map(|valor| valor as f64)
}

fn tiempo_de_curva(
    canales: &CanalesAlineados<'_>,
    curva: &CurvaPista,
    primero: usize,
    ultimo: usize,
) -> f64 {
    let t0 = canales
        .tiempo
        .get(primero)
        .copied()
        .flatten()
        .unwrap_or(f64::NAN);
    let t1 = canales
        .tiempo
        .get(ultimo)
        .copied()
        .flatten()
        .unwrap_or(f64::NAN);
    let mut delta = t1 - t0;
    let longitud = canales.s.last().copied().unwrap_or(0.0);
    if curva.s_fin > longitud + 1e-9 && delta < 0.0 {
        // El arco cruza la meta: la parte inicial de la vuelta ocurre después
        // del final. Se completa con la duración de la vuelta.
        if let Some(duracion) = canales.tiempo.iter().rev().find_map(|valor| *valor) {
            delta += duracion;
        }
    }
    if delta.is_finite() && delta >= 0.0 {
        delta
    } else {
        f64::NAN
    }
}

/// Diferencia por curva entre dos vueltas A y B (RF-015).
///
/// Ventana = el arco de la curva, igual que `t_curva`. Por eso la suma de
/// `d_t` no coincide con el delta de vuelta. Positivo = A más lento (o con más
/// velocidad, según la métrica), como en v1.
#[derive(Debug, Clone, PartialEq)]
pub struct DeltaCurva {
    pub n: usize,
    pub nombre: String,
    pub d_t: f64,
    pub d_v_min: f64,
    pub d_v_apex: f64,
    pub d_fren: f64,
    pub d_acel: f64,
}

/// Compara A contra B curva por curva.
pub fn delta_curvas(
    curvas: &[CurvaPista],
    a: &CanalesAlineados<'_>,
    b: &CanalesAlineados<'_>,
) -> Vec<DeltaCurva> {
    curvas
        .iter()
        .map(|curva| {
            let ma = metricas_curva(a, curva);
            let mb = metricas_curva(b, curva);
            DeltaCurva {
                n: curva.n,
                nombre: curva.nombre.clone(),
                d_t: ma.t_curva - mb.t_curva,
                d_v_min: ma.v_min - mb.v_min,
                d_v_apex: ma.v_apex - mb.v_apex,
                d_fren: diferencia(ma.d_fren, mb.d_fren),
                d_acel: diferencia(ma.d_acel, mb.d_acel),
            }
        })
        .collect()
}

fn diferencia(a: f64, b: f64) -> f64 {
    if a.is_finite() && b.is_finite() {
        a - b
    } else {
        f64::NAN
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn curva(s_ini: f64, s_fin: f64, sentido: Sentido) -> CurvaPista {
        CurvaPista {
            n: 0,
            nombre: String::new(),
            s_ini,
            s_apex: (s_ini + s_fin) / 2.0,
            s_fin,
            largo: s_fin - s_ini,
            radio_min: 50.0,
            giro: 1.0,
            sentido,
        }
    }

    #[test]
    fn t56_une_dos_arcos_del_mismo_sentido_a_10_m() {
        let unidas = unir_dobles_apices(
            vec![
                curva(0.0, 50.0, Sentido::Derecha),
                curva(60.0, 110.0, Sentido::Derecha),
            ],
            None,
        );
        assert_eq!(unidas.len(), 1);
        assert_eq!(unidas[0].s_ini, 0.0);
        assert_eq!(unidas[0].s_fin, 110.0);

        let separadas = unir_dobles_apices(
            vec![
                curva(0.0, 50.0, Sentido::Derecha),
                curva(60.1, 110.0, Sentido::Derecha),
            ],
            None,
        );
        assert_eq!(separadas.len(), 2);
    }

    #[test]
    fn t56_no_une_sentidos_distintos() {
        let curvas = unir_dobles_apices(
            vec![
                curva(0.0, 50.0, Sentido::Derecha),
                curva(55.0, 110.0, Sentido::Izquierda),
            ],
            None,
        );
        assert_eq!(curvas.len(), 2);
    }

    #[test]
    fn t59_une_el_par_que_cruza_la_meta() {
        let curvas = unir_dobles_apices(
            vec![
                curva(3.0, 20.0, Sentido::Derecha),
                curva(480.0, 505.0, Sentido::Derecha),
            ],
            Some(510.0),
        );
        assert_eq!(curvas.len(), 1);
        assert_eq!(curvas[0].s_ini, 480.0);
        assert_eq!(curvas[0].s_fin, 530.0);
    }
}
