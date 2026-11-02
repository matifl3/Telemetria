//! Matemática de mapa (RF-011): bounds, transform 2D/3D, normal de la traza,
//! banda de pista y caché por vista.
//!
//! Todo se calcula en `core` (D-04) y sin estado global: el front solo recibe
//! puntos ya proyectados y aplica la transformación de pantalla. La proyección
//! 3D reproduce la de v1: rotación en el plano `x`/`z` y una elevación que
//! desplaza la altura sobre la pantalla.

use crate::pista::Pista;
use crate::vuelta::{Vuelta, VueltaId};

/// Punto en el plano del mapa (m antes de [`Vista2D`], px después).
pub type Punto = (f64, f64);

/// Punto del mundo con altura: `(x, y, z)` en metros.
pub type PuntoMundo = (f64, f64, f64);

/// Proyección del mundo a un plano 2D.
///
/// `rotacion_grados` gira la pista sobre su eje vertical y `elevacion` es el
/// factor que convierte la altura `y` en un desplazamiento vertical de pantalla.
/// Con [`Proyeccion::PLANA`] ambos son cero y la vista es cenital.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Proyeccion {
    pub rotacion_grados: f64,
    pub elevacion: f64,
}

impl Proyeccion {
    /// Vista cenital sin rotación (mini-mapas y thumbnails).
    pub const PLANA: Proyeccion = Proyeccion {
        rotacion_grados: 0.0,
        elevacion: 0.0,
    };

    /// Crea una proyección con rotación (grados) y elevación.
    ///
    /// Los valores no finitos se normalizan a cero para que la proyección sea
    /// siempre determinista.
    pub fn nueva(rotacion_grados: f64, elevacion: f64) -> Self {
        Self {
            rotacion_grados: si_finito(rotacion_grados, 0.0),
            elevacion: si_finito(elevacion, 0.0),
        }
    }

    /// Indica si la vista es cenital sin desplazamiento por altura.
    pub fn es_plana(&self) -> bool {
        self.rotacion_grados == 0.0 && self.elevacion == 0.0
    }

    /// Proyecta un punto del mundo `(x, y, z)` al plano del mapa.
    ///
    /// La rotación mantiene el sentido de v1 y la altura solo interviene cuando
    /// `elevacion` es distinta de cero.
    pub fn proyectar(&self, x: f64, y: f64, z: f64) -> Punto {
        let angulo = self.rotacion_grados.to_radians();
        let (seno, coseno) = angulo.sin_cos();
        let rx = x * coseno - z * seno;
        let rz = x * seno + z * coseno;
        (rx, rz - y * self.elevacion)
    }

    /// Proyecta un [`PuntoMundo`].
    pub fn proyectar_mundo(&self, punto: PuntoMundo) -> Punto {
        self.proyectar(punto.0, punto.1, punto.2)
    }
}

impl Default for Proyeccion {
    fn default() -> Self {
        Self::PLANA
    }
}

/// Caja envolvente en el plano del mapa.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Bounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
}

impl Bounds {
    /// Calcula los bounds de una secuencia de puntos, ignorando los no finitos.
    ///
    /// Devuelve `None` si no queda ningún punto válido.
    pub fn de_puntos(puntos: impl IntoIterator<Item = Punto>) -> Option<Self> {
        let mut bounds: Option<Self> = None;
        for (x, y) in puntos {
            if !x.is_finite() || !y.is_finite() {
                continue;
            }
            match &mut bounds {
                Some(actual) => actual.incluir((x, y)),
                None => {
                    bounds = Some(Self {
                        min_x: x,
                        max_x: x,
                        min_y: y,
                        max_y: y,
                    })
                }
            }
        }
        bounds
    }

    /// Agranda los bounds para incluir un punto finito.
    pub fn incluir(&mut self, (x, y): Punto) {
        if !x.is_finite() || !y.is_finite() {
            return;
        }
        self.min_x = self.min_x.min(x);
        self.max_x = self.max_x.max(x);
        self.min_y = self.min_y.min(y);
        self.max_y = self.max_y.max(y);
    }

    /// Une dos bounds.
    pub fn unir(mut self, otro: Self) -> Self {
        self.incluir((otro.min_x, otro.min_y));
        self.incluir((otro.max_x, otro.max_y));
        self
    }

    /// Ancho de la caja (m).
    pub fn ancho(&self) -> f64 {
        self.max_x - self.min_x
    }

    /// Alto de la caja (m).
    pub fn alto(&self) -> f64 {
        self.max_y - self.min_y
    }

    /// Centro de la caja en el plano del mapa.
    pub fn centro(&self) -> Punto {
        (
            (self.min_x + self.max_x) / 2.0,
            (self.min_y + self.max_y) / 2.0,
        )
    }

    /// Indica si un punto finito cae dentro de la caja (bordes incluidos).
    pub fn contiene(&self, (x, y): Punto) -> bool {
        x.is_finite()
            && y.is_finite()
            && x >= self.min_x
            && x <= self.max_x
            && y >= self.min_y
            && y <= self.max_y
    }
}

/// Transformación de mundo a píxeles para un canvas.
///
/// La escala base encaja los bounds completos con el margen pedido; `zoom` y
/// `pan_*` se aplican encima sin modificar los bounds originales.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vista2D {
    pub ancho_px: f64,
    pub alto_px: f64,
    pub margen_px: f64,
    pub zoom: f64,
    pub pan_x: f64,
    pub pan_y: f64,
    escala: f64,
    centro: Punto,
}

impl Vista2D {
    /// Construye la vista que encaja `bounds` en el canvas con el margen dado.
    pub fn nueva(bounds: Bounds, ancho_px: f64, alto_px: f64, margen_px: f64) -> Self {
        let ancho_px = si_positivo(ancho_px, 1.0);
        let alto_px = si_positivo(alto_px, 1.0);
        let margen_px = si_finito(margen_px, 0.0).max(0.0);
        let ancho_util = (ancho_px - 2.0 * margen_px).max(1e-6);
        let alto_util = (alto_px - 2.0 * margen_px).max(1e-6);
        let escala =
            (ancho_util / bounds.ancho().max(1e-6)).min(alto_util / bounds.alto().max(1e-6));

        Self {
            ancho_px,
            alto_px,
            margen_px,
            zoom: 1.0,
            pan_x: 0.0,
            pan_y: 0.0,
            escala,
            centro: bounds.centro(),
        }
    }

    /// Aplica zoom y paneo sobre la vista base.
    pub fn con_zoom(mut self, zoom: f64, pan_x: f64, pan_y: f64) -> Self {
        self.zoom = si_positivo(zoom, 1.0);
        self.pan_x = si_finito(pan_x, 0.0);
        self.pan_y = si_finito(pan_y, 0.0);
        self
    }

    /// Escala efectiva en px/m (base por zoom).
    pub fn escala(&self) -> f64 {
        self.escala * self.zoom
    }

    /// Centro de los bounds en el plano del mapa.
    pub fn centro(&self) -> Punto {
        self.centro
    }

    /// Lleva un punto del plano del mapa a coordenadas del canvas.
    pub fn a_pantalla(&self, (x, y): Punto) -> Punto {
        let escala = self.escala();
        (
            self.ancho_px / 2.0 + self.pan_x + (x - self.centro.0) * escala,
            self.alto_px / 2.0 + self.pan_y + (y - self.centro.1) * escala,
        )
    }
}

/// Traza de una vuelta ya proyectada al plano del mapa.
#[derive(Debug, Clone, PartialEq)]
pub struct TrazaProyectada {
    pub id: VueltaId,
    /// Puntos en el plano del mapa, en orden de recorrido.
    pub puntos: Vec<Punto>,
}

/// Banda de pista proyectada: borde izquierdo y derecho por punto.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct BandaProyectada {
    pub izquierda: Vec<Punto>,
    pub derecha: Vec<Punto>,
}

/// Pista y vueltas proyectadas para una vista, con sus bounds comunes.
#[derive(Debug, Clone, PartialEq)]
pub struct ProyeccionMapa {
    pub proyeccion: Proyeccion,
    pub trazas: Vec<TrazaProyectada>,
    pub banda: Option<BandaProyectada>,
    /// Caja que contiene trazas y banda; es la base de [`Vista2D`].
    pub bounds: Bounds,
}

/// Normal unitaria a la traza en el punto `indice` (plano `x`/`z`).
///
/// Usa los vecinos anterior y siguiente, recortando en los extremos como v1.
/// Devuelve `(0, 0)` si la traza es degenerada.
pub fn normal_traza(pista: &Pista, indice: usize) -> Punto {
    let n = pista.puntos();
    if n == 0 {
        return (0.0, 0.0);
    }

    let indice = indice.min(n - 1);
    let anterior = indice.saturating_sub(1);
    let siguiente = (indice + 1).min(n - 1);
    let dx = (pista.nx[siguiente] - pista.nx[anterior]) as f64;
    let dz = (pista.nz[siguiente] - pista.nz[anterior]) as f64;
    let modulo = (dx * dx + dz * dz).sqrt();
    if !modulo.is_finite() || modulo <= f64::EPSILON {
        return (0.0, 0.0);
    }
    (-dz / modulo, dx / modulo)
}

/// Banda de pista en el mundo, con la altura de cada punto.
///
/// El borde izquierdo se separa `wl` metros y el derecho `wr`, ambos sobre la
/// normal de la traza. Con semianchos iguales la banda es simétrica respecto de
/// la línea central.
pub fn banda_de_pista(pista: &Pista) -> (Vec<PuntoMundo>, Vec<PuntoMundo>) {
    let n = pista.puntos();
    let ancho = pista.ancho_m() as f64;
    let mut izquierda = Vec::with_capacity(n);
    let mut derecha = Vec::with_capacity(n);

    for indice in 0..n {
        let (nx, nz) = normal_traza(pista, indice);
        let x = pista.nx[indice] as f64;
        let y = pista.ny[indice] as f64;
        let z = pista.nz[indice] as f64;
        let wl = pista.wl.get(indice).map_or(ancho, |&valor| valor as f64);
        let wr = pista.wr.get(indice).map_or(ancho, |&valor| valor as f64);

        izquierda.push((x + nx * wl, y, z + nz * wl));
        derecha.push((x - nx * wr, y, z - nz * wr));
    }

    (izquierda, derecha)
}

/// Proyecta pista y vueltas para una vista dada.
///
/// Los bounds incluyen la banda completa del `.ai` (como v1) para que la pista
/// nunca quede recortada por el tamaño de las trazadas.
pub fn proyectar_vista(
    pista: Option<&Pista>,
    vueltas: &[&Vuelta],
    proyeccion: Proyeccion,
) -> ProyeccionMapa {
    let mut bounds: Option<Bounds> = None;
    let mut trazas = Vec::with_capacity(vueltas.len());

    for vuelta in vueltas {
        let series = &vuelta.muestras;
        let n = series.x.len().min(series.z.len());
        let mut puntos = Vec::with_capacity(n);
        for indice in 0..n {
            let y = series.y.get(indice).map_or(0.0, |&valor| valor as f64);
            let punto = proyeccion.proyectar(series.x[indice] as f64, y, series.z[indice] as f64);
            incluir_en(&mut bounds, punto);
            puntos.push(punto);
        }
        trazas.push(TrazaProyectada {
            id: vuelta.id,
            puntos,
        });
    }

    let banda = pista.map(|pista| {
        let (izquierda, derecha) = banda_de_pista(pista);
        let izquierda: Vec<Punto> = izquierda
            .into_iter()
            .map(|punto| proyeccion.proyectar_mundo(punto))
            .collect();
        let derecha: Vec<Punto> = derecha
            .into_iter()
            .map(|punto| proyeccion.proyectar_mundo(punto))
            .collect();
        for &punto in izquierda.iter().chain(derecha.iter()) {
            incluir_en(&mut bounds, punto);
        }
        BandaProyectada { izquierda, derecha }
    });

    ProyeccionMapa {
        proyeccion,
        trazas,
        banda,
        bounds: bounds.unwrap_or_default(),
    }
}

/// Clave de caché de una vista: vueltas visibles y parámetros de proyección.
///
/// El llamador debe invalidar la caché al reemplazar la pista, porque la clave
/// no incluye el contenido del `.ai`.
#[derive(Debug, Clone, PartialEq)]
pub struct ClaveVista {
    pub vueltas: Vec<VueltaId>,
    pub proyeccion: Proyeccion,
}

impl ClaveVista {
    /// Arma la clave con las vueltas visibles y la proyección actual.
    pub fn de_vueltas(vueltas: &[&Vuelta], proyeccion: Proyeccion) -> Self {
        Self {
            vueltas: vueltas.iter().map(|vuelta| vuelta.id).collect(),
            proyeccion,
        }
    }
}

/// Caché de una sola entrada para no reproyectar en cada frame de zoom/paneo.
///
/// Misma clave ⇒ mismo resultado sin recalcular. Un cambio de vueltas o de
/// proyección recalcula y reemplaza la entrada anterior.
#[derive(Debug, Clone, Default)]
pub struct CacheVista {
    clave: Option<ClaveVista>,
    resultado: Option<ProyeccionMapa>,
}

impl CacheVista {
    /// Caché vacía.
    pub fn nueva() -> Self {
        Self::default()
    }

    /// Clave guardada, si hay una entrada.
    pub fn clave(&self) -> Option<&ClaveVista> {
        self.clave.as_ref()
    }

    /// Resultado guardado, si hay una entrada.
    pub fn resultado(&self) -> Option<&ProyeccionMapa> {
        self.resultado.as_ref()
    }

    /// Devuelve el resultado de `clave`, calculándolo solo si cambió.
    pub fn obtener<F>(&mut self, clave: ClaveVista, calcular: F) -> &ProyeccionMapa
    where
        F: FnOnce() -> ProyeccionMapa,
    {
        if self.clave.as_ref() != Some(&clave) {
            self.resultado = Some(calcular());
            self.clave = Some(clave);
        }
        self.resultado
            .as_ref()
            .expect("la caché calcula el resultado antes de devolverlo")
    }

    /// Descarta la entrada actual.
    pub fn invalidar(&mut self) {
        self.clave = None;
        self.resultado = None;
    }
}

fn incluir_en(bounds: &mut Option<Bounds>, punto: Punto) {
    if !punto.0.is_finite() || !punto.1.is_finite() {
        return;
    }
    match bounds {
        Some(actual) => actual.incluir(punto),
        None => {
            *bounds = Some(Bounds {
                min_x: punto.0,
                max_x: punto.0,
                min_y: punto.1,
                max_y: punto.1,
            })
        }
    }
}

fn si_finito(valor: f64, por_defecto: f64) -> f64 {
    if valor.is_finite() {
        valor
    } else {
        por_defecto
    }
}

fn si_positivo(valor: f64, por_defecto: f64) -> f64 {
    if valor.is_finite() && valor > 0.0 {
        valor
    } else {
        por_defecto
    }
}
