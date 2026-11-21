//! Grilla común sobre el arco de pista `s` (RF-013, RF-014, RF-015, D-05).
//!
//! La grilla depende **solo** de la longitud de la pista: no de qué vueltas ni
//! autos estén visibles. Así el eje X no salta al mostrar u ocultar vueltas y
//! dos autos comparan el mismo punto físico.
//!
//! El remuestreo no extrapola: un punto de la grilla sin cobertura en la vuelta,
//! dentro de un hueco de proyección o con un valor no finito vale `None`.

/// Puntos máximos de la grilla.
pub const GRID_PUNTOS_MAX: usize = 10_000;
/// Paso mínimo entre puntos de la grilla (m).
pub const GRID_PASO_MIN: f64 = 0.1;
/// Tolerancia para considerar que el último punto ya cae en la longitud (m).
const TOLERANCIA_M: f64 = 1e-9;

/// Grilla de arcos de pista para alinear todas las vueltas.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Grilla {
    /// Arcos de la grilla (m), estrictamente crecientes; el primero es 0 y el
    /// último es la longitud de la pista.
    pub s: Vec<f64>,
    /// Paso nominal entre puntos (m). La última celda puede ser más corta (o algo
    /// más larga si el tope de puntos obliga a correr el último punto).
    pub paso_m: f64,
    /// Longitud de la pista usada para construir la grilla (m).
    pub longitud_m: f64,
}

impl Grilla {
    /// Cantidad de puntos de la grilla.
    pub fn puntos(&self) -> usize {
        self.s.len()
    }
}

/// Construye la grilla de una pista de `longitud_m` metros.
///
/// Respeta [`GRID_PUNTOS_MAX`] y [`GRID_PASO_MIN`], empieza en 0 y termina
/// exactamente en `longitud_m`. Con longitud no válida devuelve un único punto
/// en 0.
pub fn grilla_de_pista(longitud_m: f64) -> Grilla {
    if !longitud_m.is_finite() || longitud_m <= 0.0 {
        return Grilla {
            s: vec![0.0],
            paso_m: 0.0,
            longitud_m: 0.0,
        };
    }

    let paso_m = (longitud_m / (GRID_PUNTOS_MAX - 1) as f64).max(GRID_PASO_MIN);
    let cantidad = (longitud_m / paso_m).floor() as usize + 1;
    let mut s = Vec::with_capacity(cantidad + 1);
    for indice in 0..cantidad {
        s.push(indice as f64 * paso_m);
    }

    // El último punto tiene que caer en la longitud de la pista. Si el resto no
    // llena un paso completo se agrega un punto extra (la última celda queda más
    // corta); si ya no cabe otro punto, se corre el último.
    let ultimo = s[s.len() - 1];
    let indice_ultimo = s.len() - 1;
    if longitud_m - ultimo > TOLERANCIA_M && s.len() < GRID_PUNTOS_MAX {
        s.push(longitud_m);
    } else {
        s[indice_ultimo] = longitud_m;
    }

    Grilla {
        s,
        paso_m,
        longitud_m,
    }
}

/// Tipo de canal que puede remuestrearse linealmente.
pub trait Interpolable: Copy {
    /// Convierte el valor interpolado al tipo del canal.
    fn desde_f64(valor: f64) -> Self;
    /// Convierte el valor del canal a `f64` para interpolar.
    fn a_f64(self) -> f64;
}

impl Interpolable for f32 {
    fn desde_f64(valor: f64) -> Self {
        valor as f32
    }

    fn a_f64(self) -> f64 {
        self as f64
    }
}

impl Interpolable for f64 {
    fn desde_f64(valor: f64) -> Self {
        valor
    }

    fn a_f64(self) -> f64 {
        self
    }
}

impl Interpolable for u8 {
    fn desde_f64(valor: f64) -> Self {
        valor.round().clamp(0.0, u8::MAX as f64) as u8
    }

    fn a_f64(self) -> f64 {
        self as f64
    }
}

/// Remuestrea un canal continuo por interpolación lineal sobre `s`.
///
/// `s` es el arco de pista de la vuelta (monótono no decreciente, con `NaN` en
/// los huecos de proyección) y `valores` el canal del mismo largo. Devuelve un
/// valor por punto de la grilla; `None` donde no hay cobertura.
pub fn remuestrear_lineal<T: Interpolable>(
    s: &[f64],
    valores: &[T],
    grilla: &Grilla,
) -> Vec<Option<T>> {
    let tramos = tramos_validos(s, valores.len());
    let mut salida = Vec::with_capacity(grilla.s.len());
    let mut cursor = 0usize;
    let mut j = 0usize;

    for &g in &grilla.s {
        let Some(indice) = tramo_que_contiene(s, &tramos, g, &mut cursor) else {
            salida.push(None);
            continue;
        };
        let tramo = tramos[indice];
        if j < tramo.inicio || j >= tramo.fin {
            j = tramo.inicio;
        }
        while j + 1 < tramo.fin && s[j + 1] < g {
            j += 1;
        }

        let siguiente = (j + 1).min(tramo.fin - 1);
        let x0 = s[j];
        let x1 = s[siguiente];
        let y0 = valores[j].a_f64();
        let y1 = valores[siguiente].a_f64();

        let t = if x1 > x0 { (g - x0) / (x1 - x0) } else { 0.0 };
        let valor = if y0.is_finite() && y1.is_finite() {
            Some(T::desde_f64(y0 + (y1 - y0) * t))
        } else if t <= 0.0 && y0.is_finite() {
            // Coincide con la muestra izquierda: el valor es exacto aunque el
            // vecino sea un hueco.
            Some(T::desde_f64(y0))
        } else if t >= 1.0 && y1.is_finite() {
            Some(T::desde_f64(y1))
        } else {
            None
        };
        salida.push(valor);
    }

    salida
}

/// Remuestrea un canal discreto por vecino más cercano sobre `s`.
///
/// Se usa con la marcha y con cualquier canal que no deba interpolarse. En un
/// empate gana la muestra posterior, igual que v1.
pub fn remuestrear_vecino<T: Copy>(
    s: &[f64],
    valores: &[T],
    grilla: &Grilla,
) -> Vec<Option<T>> {
    let tramos = tramos_validos(s, valores.len());
    let mut salida = Vec::with_capacity(grilla.s.len());
    let mut cursor = 0usize;
    let mut j = 0usize;

    for &g in &grilla.s {
        let Some(indice) = tramo_que_contiene(s, &tramos, g, &mut cursor) else {
            salida.push(None);
            continue;
        };
        let tramo = tramos[indice];
        if j < tramo.inicio || j >= tramo.fin {
            j = tramo.inicio;
        }
        while j + 1 < tramo.fin && (s[j + 1] - g).abs() <= (s[j] - g).abs() {
            j += 1;
        }
        salida.push(Some(valores[j]));
    }

    salida
}

/// Tramo contiguo de muestras con `s` finito y no decreciente.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Tramo {
    /// Primera muestra del tramo.
    inicio: usize,
    /// Muestra posterior a la última (exclusivo).
    fin: usize,
}

/// Separa la serie en tramos válidos, cortando en los huecos (`NaN`).
///
/// Un valor finito menor que el anterior también abre un tramo nuevo: el
/// remuestreo nunca asume un orden que la entrada no tenga.
fn tramos_validos(s: &[f64], valores: usize) -> Vec<Tramo> {
    let total = s.len().min(valores);
    let mut tramos = Vec::new();
    let mut inicio = 0usize;
    let mut abierto = false;

    for indice in 0..total {
        let finito = s[indice].is_finite();
        if abierto && (!finito || s[indice] < s[indice - 1]) {
            tramos.push(Tramo { inicio, fin: indice });
            abierto = false;
        }
        if !abierto && finito {
            inicio = indice;
            abierto = true;
        }
    }

    if abierto {
        tramos.push(Tramo {
            inicio,
            fin: total,
        });
    }

    tramos
}

/// Tramo que contiene `g`, avanzando el cursor (la grilla es creciente).
fn tramo_que_contiene(
    s: &[f64],
    tramos: &[Tramo],
    g: f64,
    cursor: &mut usize,
) -> Option<usize> {
    while *cursor < tramos.len() && s[tramos[*cursor].fin - 1] < g {
        *cursor += 1;
    }

    let tramo = *tramos.get(*cursor)?;
    let inicio = s[tramo.inicio];
    let fin = s[tramo.fin - 1];
    (g >= inicio && g <= fin).then_some(*cursor)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn t49_grilla_sin_pista_queda_en_cero() {
        let grilla = grilla_de_pista(f64::NAN);
        assert_eq!(grilla.s, vec![0.0]);
        assert_eq!(grilla.paso_m, 0.0);
        assert_eq!(grilla.longitud_m, 0.0);
    }

    #[test]
    fn t52_huecos_y_tipos_no_finitos_son_none() {
        let s = [0.0, 1.0, 2.0];
        let valores = [1.0f32, f32::NAN, 3.0];
        let grilla = Grilla {
            s: vec![0.0, 0.5, 1.5, 2.0],
            paso_m: 0.5,
            longitud_m: 2.0,
        };
        let alineado = remuestrear_lineal(&s, &valores, &grilla);
        assert_eq!(alineado, vec![Some(1.0), None, None, Some(3.0)]);
    }
}
