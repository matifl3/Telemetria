mod soporte;

use acreplay_core::mapa::{
    banda_de_pista, normal_traza, proyectar_vista, Bounds, CacheVista, ClaveVista, Proyeccion,
    Vista2D,
};
use acreplay_core::pista::{parsear_pista, Pista};
use acreplay_core::vuelta::{Series, Vuelta, VueltaId};
use soporte::pista::ConstructorPista;

const TOLERANCIA: f64 = 1e-6;

fn cerca(a: f64, b: f64, tolerancia: f64) -> bool {
    (a - b).abs() <= tolerancia
}

fn pista_de(constructor: &ConstructorPista) -> Pista {
    parsear_pista(&constructor.bytes(), "fast_lane.ai").expect("pista sintética válida")
}

fn vuelta_de(auto: usize, local: usize, x: Vec<f32>, z: Vec<f32>) -> Vuelta {
    let n = x.len();
    Vuelta {
        id: VueltaId {
            auto,
            numero_local: local,
        },
        etiqueta: format!("Auto {auto} · V{local}"),
        muestras: Series {
            x,
            z,
            y: vec![0.0; n],
            ..Default::default()
        },
        ..Default::default()
    }
}

#[test]
fn t77_bounds_y_transform_2d_enmarcan_los_extremos_con_margen() {
    let pista = pista_de(&ConstructorPista::circular(120.0, 128).con_semianchos(6.0, 6.0));
    let vuelta = vuelta_de(
        0,
        0,
        vec![-40.0, 40.0, 40.0, -40.0],
        vec![-30.0, -30.0, 30.0, 30.0],
    );

    let resultados = proyectar_vista(Some(&pista), &[&vuelta], Proyeccion::PLANA);
    let bounds = resultados.bounds;

    for punto in resultados
        .trazas
        .iter()
        .flat_map(|traza| traza.puntos.iter().copied())
    {
        assert!(bounds.contiene(punto), "la traza queda fuera: {punto:?}");
    }
    let banda = resultados.banda.as_ref().expect("la pista tiene banda");
    for punto in banda.izquierda.iter().chain(banda.derecha.iter()) {
        assert!(bounds.contiene(*punto), "la banda queda fuera: {punto:?}");
    }

    let ancho = 800.0;
    let alto = 600.0;
    let margen = 30.0;
    let vista = Vista2D::nueva(bounds, ancho, alto, margen);
    let esquinas = [
        (bounds.min_x, bounds.min_y),
        (bounds.min_x, bounds.max_y),
        (bounds.max_x, bounds.min_y),
        (bounds.max_x, bounds.max_y),
    ];
    for esquina in esquinas {
        let (px, py) = vista.a_pantalla(esquina);
        assert!(
            px >= margen - TOLERANCIA && px <= ancho - margen + TOLERANCIA,
            "x={px} fuera de [{margen}, {}]",
            ancho - margen
        );
        assert!(
            py >= margen - TOLERANCIA && py <= alto - margen + TOLERANCIA,
            "y={py} fuera de [{margen}, {}]",
            alto - margen
        );
    }

    let (cx, cy) = vista.a_pantalla(bounds.centro());
    assert!(cerca(cx, ancho / 2.0, TOLERANCIA));
    assert!(cerca(cy, alto / 2.0, TOLERANCIA));

    let con_zoom = vista.con_zoom(2.0, 10.0, -5.0);
    let (zx, zy) = con_zoom.a_pantalla(bounds.centro());
    assert!(cerca(zx, ancho / 2.0 + 10.0, TOLERANCIA));
    assert!(cerca(zy, alto / 2.0 - 5.0, TOLERANCIA));
    assert!(cerca(con_zoom.escala(), vista.escala() * 2.0, TOLERANCIA));
}

#[test]
fn t78_transform_3d_es_determinista_y_cambia_al_rotar() {
    let plana = Proyeccion::PLANA;
    let rotada = Proyeccion::nueva(90.0, 0.0);

    let primero = rotada.proyectar(1.0, 0.0, 0.0);
    let segundo = rotada.proyectar(1.0, 0.0, 0.0);
    assert_eq!(primero, segundo);
    assert!(cerca(primero.0, 0.0, TOLERANCIA), "{primero:?}");
    assert!(cerca(primero.1, 1.0, TOLERANCIA), "{primero:?}");
    assert_ne!(primero, plana.proyectar(1.0, 0.0, 0.0));

    let con_altura = Proyeccion::nueva(0.0, 0.5);
    let proyectado = con_altura.proyectar(10.0, 4.0, 0.0);
    assert!(cerca(proyectado.0, 10.0, TOLERANCIA), "{proyectado:?}");
    assert!(cerca(proyectado.1, -2.0, TOLERANCIA), "{proyectado:?}");

    let sin_altura = Proyeccion::nueva(0.0, 0.0).proyectar(10.0, 4.0, 0.0);
    assert!(cerca(sin_altura.1, 0.0, TOLERANCIA), "{sin_altura:?}");
}

#[test]
fn t79_banda_simetrica_respecto_de_la_linea_central() {
    let pista = pista_de(&ConstructorPista::recta(6).con_semianchos(5.0, 5.0));
    assert!(cerca(pista.ancho_m() as f64, 5.0, TOLERANCIA));

    let (izquierda, derecha) = banda_de_pista(&pista);
    assert_eq!(izquierda.len(), pista.puntos());
    assert_eq!(derecha.len(), pista.puntos());

    for indice in 0..pista.puntos() {
        let centro = (
            pista.nx[indice] as f64,
            pista.ny[indice] as f64,
            pista.nz[indice] as f64,
        );
        let (ix, iy, iz) = izquierda[indice];
        let (dx, dy, dz) = derecha[indice];
        let medio = ((ix + dx) / 2.0, (iy + dy) / 2.0, (iz + dz) / 2.0);

        assert!(cerca(medio.0, centro.0, TOLERANCIA), "punto {indice}");
        assert!(cerca(medio.1, centro.1, TOLERANCIA), "punto {indice}");
        assert!(cerca(medio.2, centro.2, TOLERANCIA), "punto {indice}");

        let distancia_izq = ((ix - centro.0).powi(2) + (iz - centro.2).powi(2)).sqrt();
        let distancia_der = ((dx - centro.0).powi(2) + (dz - centro.2).powi(2)).sqrt();
        assert!(cerca(distancia_izq, 5.0, TOLERANCIA), "punto {indice}");
        assert!(cerca(distancia_der, 5.0, TOLERANCIA), "punto {indice}");
    }

    let (nx, nz) = normal_traza(&pista, 2);
    assert!(cerca(nx, 0.0, TOLERANCIA), "{nx}");
    assert!(cerca(nz, 1.0, TOLERANCIA), "{nz}");

    let proyeccion = Proyeccion::nueva(35.0, 0.3);
    let resultado = proyectar_vista(Some(&pista), &[], proyeccion);
    let banda = resultado.banda.expect("banda proyectada");
    for indice in 0..pista.puntos() {
        let centro = proyeccion.proyectar(
            pista.nx[indice] as f64,
            pista.ny[indice] as f64,
            pista.nz[indice] as f64,
        );
        let izquierda = banda.izquierda[indice];
        let derecha = banda.derecha[indice];
        let medio = (
            (izquierda.0 + derecha.0) / 2.0,
            (izquierda.1 + derecha.1) / 2.0,
        );
        assert!(cerca(medio.0, centro.0, TOLERANCIA), "punto {indice}");
        assert!(cerca(medio.1, centro.1, TOLERANCIA), "punto {indice}");
    }
}

#[test]
fn t80_cache_por_vista_reutiliza_e_invalida() {
    let pista = pista_de(&ConstructorPista::circular(100.0, 64).con_semianchos(6.0, 6.0));
    let a = vuelta_de(0, 0, vec![50.0, 60.0, 70.0], vec![0.0, 10.0, 20.0]);
    let b = vuelta_de(1, 0, vec![-50.0, -60.0, -70.0], vec![0.0, -10.0, -20.0]);
    let visibles = [&a, &b];

    let mut cache = CacheVista::nueva();
    let mut calculos = 0;
    let clave = ClaveVista::de_vueltas(&visibles, Proyeccion::PLANA);

    let primera = cache
        .obtener(clave.clone(), || {
            calculos += 1;
            proyectar_vista(Some(&pista), &visibles, Proyeccion::PLANA)
        })
        .clone();
    assert_eq!(primera.trazas.len(), 2);
    assert_eq!(calculos, 1);

    let segunda = cache
        .obtener(clave.clone(), || {
            calculos += 1;
            panic!("no debe recalcular con la misma clave");
        })
        .clone();
    assert_eq!(primera, segunda);
    assert_eq!(calculos, 1);

    let otra = ClaveVista::de_vueltas(&visibles, Proyeccion::nueva(45.0, 0.2));
    let tercera = cache
        .obtener(otra, || {
            calculos += 1;
            proyectar_vista(Some(&pista), &visibles, Proyeccion::nueva(45.0, 0.2))
        })
        .clone();
    assert_eq!(calculos, 2);
    assert_ne!(primera, tercera);

    cache.invalidar();
    assert!(cache.clave().is_none());
    assert!(cache.resultado().is_none());

    let _ = cache.obtener(clave, || {
        calculos += 1;
        proyectar_vista(Some(&pista), &visibles, Proyeccion::PLANA)
    });
    assert_eq!(calculos, 3);
}

#[test]
fn bounds_ignora_puntos_no_finitos() {
    let bounds = Bounds::de_puntos([(0.0, 0.0), (f64::NAN, 5.0), (10.0, -2.0)]);
    let bounds = bounds.expect("hay dos puntos válidos");
    assert_eq!(bounds.min_x, 0.0);
    assert_eq!(bounds.max_x, 10.0);
    assert_eq!(bounds.min_y, -2.0);
    assert_eq!(bounds.max_y, 0.0);
    assert!(Bounds::de_puntos([(f64::INFINITY, 0.0)]).is_none());
}
