use acreplay_core::agregados::{
    BINS_VELOCIDAD, conjunto, consumos, desvio_lateral, envolvente_velocidad, histograma_marchas,
    histograma_velocidad, tabla_resumen, tiempos_ordenados, velocidad_media_max, velocidades,
};
use acreplay_core::comparacion::{
    delta_acumulado, delta_pedales, delta_por_sector, delta_velocidad,
};
use acreplay_core::grilla::Grilla;
use acreplay_core::sectores::{sectores_de_vuelta, tiempos_por_sector, vuelta_teorica};
use acreplay_core::vuelta::{G, MotivoVuelta, Series, Vuelta, VueltaId};

fn cerca(a: f64, b: f64, tolerancia: f64) -> bool {
    (a - b).abs() <= tolerancia
}

fn grilla_prueba() -> Grilla {
    let s: Vec<f64> = (0..=30).map(|i| i as f64 * 10.0).collect();
    Grilla {
        s,
        paso_m: 10.0,
        longitud_m: 300.0,
    }
}

fn tiempos_con_ritmo(ritmos: [f64; 3]) -> Vec<f64> {
    let mut tiempos = vec![0.0; 31];
    for i in 1..tiempos.len() {
        let tramo = ((i - 1) / 10).min(2);
        tiempos[i] = tiempos[i - 1] + 10.0 * ritmos[tramo];
    }
    tiempos
}

fn crear_vuelta(auto: usize, local: usize, tiempos: Vec<f64>) -> Vuelta {
    let s: Vec<f64> = (0..tiempos.len()).map(|i| i as f64 * 10.0).collect();
    crear_vuelta_con_s(auto, local, s, tiempos)
}

fn crear_vuelta_con_s(auto: usize, local: usize, s: Vec<f64>, tiempos: Vec<f64>) -> Vuelta {
    assert_eq!(s.len(), tiempos.len(), "s y tiempos deben coincidir");
    let n = s.len();
    let tiempo_s = tiempos.last().copied().unwrap_or(f64::NAN);
    let cobertura_s_m = s.last().copied().unwrap_or(f64::NAN);
    let vel_media_mps = if tiempo_s.is_finite() && tiempo_s > 0.0 && cobertura_s_m.is_finite() {
        cobertura_s_m / tiempo_s
    } else {
        0.0
    };

    Vuelta {
        id: VueltaId {
            auto,
            numero_local: local,
        },
        numero: local as u8 + 1,
        etiqueta: format!("Auto {auto} · V{}", local + 1),
        valida: true,
        motivo: MotivoVuelta::Ninguno,
        seleccionable: true,
        tiempo_s,
        cobertura_s_m,
        vel_media_mps,
        muestras: Series {
            s: s.clone(),
            t_rel: tiempos,
            speed_kmh: vec![100.0; n],
            gas: vec![0.5; n],
            freno: vec![0.0; n],
            rpm: vec![3000.0; n],
            acc_lat: vec![0.0; n],
            x: vec![0.0; n],
            z: s.iter().map(|&valor| valor as f32).collect(),
            gasolina: vec![50.0; n],
            marcha: vec![1; n],
            ..Default::default()
        },
        errores_proyeccion: 0,
    }
}

fn combustible(desde: f32, hasta: f32) -> Vec<f32> {
    (0..=30)
        .map(|i| desde + (hasta - desde) * i as f32 / 30.0)
        .collect()
}

#[test]
fn t65_los_tres_sectores_suman_el_tiempo_de_vuelta() {
    let grilla = grilla_prueba();
    let vuelta = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));

    let sectores = sectores_de_vuelta(&vuelta, &grilla);
    assert_eq!(sectores.len(), 3);
    assert_eq!(sectores[0].s_ini, 0.0);
    assert_eq!(sectores[0].s_fin, 100.0);
    assert_eq!(sectores[1].s_ini, 100.0);
    assert_eq!(sectores[1].s_fin, 200.0);
    assert_eq!(sectores[2].s_ini, 200.0);
    assert_eq!(sectores[2].s_fin, 300.0);

    let suma: f64 = sectores.iter().map(|sector| sector.tiempo_s).sum();
    assert!(
        cerca(suma, vuelta.tiempo_s, 1e-9),
        "{suma} vs {}",
        vuelta.tiempo_s
    );
    assert_eq!(tiempos_por_sector(&vuelta, &grilla), vec![10.0, 10.0, 10.0]);
}

#[test]
fn t66_vuelta_teorica_combina_el_mejor_sector_y_calcula_el_potencial() {
    let grilla = grilla_prueba();
    let a = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    let b = crear_vuelta(0, 1, tiempos_con_ritmo([0.12, 0.12, 0.12]));
    let c = crear_vuelta(0, 2, tiempos_con_ritmo([0.08, 0.13, 0.11]));

    let teorica = vuelta_teorica(&[&a, &b, &c], &grilla);
    assert!(
        cerca(teorica.sectores[0], 8.0, 1e-9),
        "{:?}",
        teorica.sectores
    );
    assert!(
        cerca(teorica.sectores[1], 10.0, 1e-9),
        "{:?}",
        teorica.sectores
    );
    assert!(
        cerca(teorica.sectores[2], 10.0, 1e-9),
        "{:?}",
        teorica.sectores
    );
    assert!(
        cerca(teorica.total_s, 28.0, 1e-9),
        "total {}",
        teorica.total_s
    );
    assert!(cerca(teorica.mejor_real_s, 30.0, 1e-9));
    assert!(cerca(teorica.potencial_s, 2.0, 1e-9));
}

#[test]
fn t67_tiempos_ordenados_de_mejor_a_peor_con_delta() {
    let a = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    let b = crear_vuelta(0, 1, tiempos_con_ritmo([0.12, 0.12, 0.12]));
    let c = crear_vuelta(0, 2, tiempos_con_ritmo([0.11, 0.1, 0.11]));

    let orden = tiempos_ordenados(&[&c, &a, &b]);
    assert_eq!(orden.len(), 3);
    assert_eq!(orden[0].id, a.id);
    assert_eq!(orden[1].id, c.id);
    assert_eq!(orden[2].id, b.id);
    assert!(cerca(orden[0].tiempo_s, 30.0, 1e-9));
    assert!(cerca(orden[1].tiempo_s, 32.0, 1e-9));
    assert!(cerca(orden[2].tiempo_s, 36.0, 1e-9));
    assert!(cerca(orden[0].delta_s, 0.0, 1e-9));
    assert!(cerca(orden[1].delta_s, 2.0, 1e-9));
    assert!(cerca(orden[2].delta_s, 6.0, 1e-9));
}

#[test]
fn t68_velocidad_media_maxima_y_envolvente_por_punto() {
    let grilla = grilla_prueba();
    let mut a = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    let mut b = crear_vuelta(0, 1, tiempos_con_ritmo([0.12, 0.12, 0.12]));
    a.muestras.speed_kmh = vec![120.0; 31];
    b.muestras.speed_kmh = vec![100.0; 31];

    let media_a = velocidad_media_max(&a, &grilla);
    let media_b = velocidad_media_max(&b, &grilla);
    assert!(cerca(media_a.media_kmh, 120.0, 1e-9));
    assert!(cerca(media_a.maxima_kmh, 120.0, 1e-9));
    assert!(cerca(media_b.media_kmh, 100.0, 1e-9));
    assert!(cerca(media_b.maxima_kmh, 100.0, 1e-9));

    let medias = velocidades(&[&a, &b], &grilla);
    assert_eq!(medias.len(), 2);
    assert_eq!(medias[0].id, a.id);
    assert_eq!(medias[1].id, b.id);

    let envolvente = envolvente_velocidad(&[&a, &b], &grilla);
    assert_eq!(envolvente.s, grilla.s);
    assert_eq!(envolvente.minimo.len(), grilla.puntos());
    for i in 0..grilla.puntos() {
        assert_eq!(envolvente.minimo[i], Some(100.0));
        assert_eq!(envolvente.promedio[i], Some(110.0));
        assert_eq!(envolvente.maximo[i], Some(120.0));
    }
}

#[test]
fn t69_histogramas_contabilizan_todas_las_muestras_validas() {
    let mut a = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    let mut b = crear_vuelta(0, 1, tiempos_con_ritmo([0.12, 0.12, 0.12]));
    a.muestras.speed_kmh = vec![120.0; 31];
    b.muestras.speed_kmh = vec![100.0; 31];
    a.muestras.marcha = (0..31).map(|i| if i % 2 == 0 { 3 } else { 4 }).collect();
    b.muestras.marcha = vec![2; 31];

    let velocidades = histograma_velocidad(&[&a, &b]);
    assert_eq!(velocidades.conteos.len(), BINS_VELOCIDAD);
    assert_eq!(velocidades.total, 62);
    assert_eq!(velocidades.conteos.iter().sum::<usize>(), 62);
    assert_eq!(velocidades.conteos[BINS_VELOCIDAD - 1], 31);
    assert_eq!(velocidades.conteos[25], 31);

    let marchas = histograma_marchas(&[&a, &b]);
    assert_eq!(marchas.total, 62);
    assert_eq!(marchas.conteos.iter().sum::<usize>(), 62);
    assert_eq!(marchas.minima, 2);
    assert_eq!(marchas.maxima, 4);
    assert_eq!(marchas.conteos, vec![31, 16, 15]);
}

#[test]
fn t70_consumo_por_vuelta_y_desvio_lateral_contra_la_ref() {
    let grilla = grilla_prueba();
    let mut a = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    let mut b = crear_vuelta(0, 1, tiempos_con_ritmo([0.12, 0.12, 0.12]));
    let mut c = crear_vuelta(0, 2, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    a.muestras.gasolina = combustible(50.0, 40.0);
    b.muestras.gasolina = combustible(50.0, 42.0);
    a.muestras.x = vec![0.0; 31];
    b.muestras.x = vec![3.0; 31];
    c.muestras.x = vec![4.0; 31];

    let consumos = consumos(&[&a, &b]);
    assert!(cerca(consumos[0].consumo, 10.0, 1e-5));
    assert!(cerca(consumos[1].consumo, 8.0, 1e-5));

    let desvios = desvio_lateral(&a, &[&a, &b, &c], &grilla);
    assert_eq!(desvios.len(), 2);
    assert_eq!(desvios[0].id, b.id);
    assert_eq!(desvios[1].id, c.id);
    for valor in &desvios[0].valores {
        assert_eq!(*valor, Some(3.0));
    }
    for valor in &desvios[1].valores {
        assert_eq!(*valor, Some(4.0));
    }
}

#[test]
fn t71_tabla_resumen_tiene_las_columnas_de_v1_y_delta_al_mejor() {
    let grilla = grilla_prueba();
    let mut a = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    let mut b = crear_vuelta(0, 1, tiempos_con_ritmo([0.12, 0.12, 0.12]));
    a.muestras.speed_kmh = vec![100.0; 31];
    a.muestras.gas = vec![0.5; 31];
    a.muestras.freno = vec![0.25; 31];
    a.muestras.rpm = vec![5000.0; 31];
    a.muestras.acc_lat = vec![5.0; 31];
    a.muestras.gasolina = combustible(50.0, 40.0);
    b.muestras.speed_kmh = vec![120.0; 31];
    b.muestras.gas = vec![0.75; 31];
    b.muestras.freno = vec![0.0; 31];
    b.muestras.rpm = vec![6000.0; 31];
    b.muestras.acc_lat = vec![-10.0; 31];
    b.muestras.gasolina = combustible(50.0, 42.0);

    let filas = tabla_resumen(&[&b, &a], &grilla);
    assert_eq!(filas.len(), 2);
    assert_eq!(filas[0].id, b.id);
    assert_eq!(filas[1].id, a.id);

    assert!(cerca(filas[0].tiempo_s, 36.0, 1e-9));
    assert!(cerca(filas[0].delta_mejor_s, 6.0, 1e-9));
    assert!(cerca(filas[0].velocidad_media_kmh, 120.0, 1e-9));
    assert!(cerca(filas[0].velocidad_maxima_kmh, 120.0, 1e-9));
    assert!(cerca(filas[0].gas_medio, 0.75, 1e-9));
    assert!(cerca(filas[0].freno_medio, 0.0, 1e-9));
    assert!(cerca(filas[0].g_lat_max, 10.0 / G as f64, 1e-9));
    assert!(cerca(filas[0].rpm_medio, 6000.0, 1e-9));
    assert!(cerca(filas[0].combustible_usado, 8.0, 1e-5));

    assert!(cerca(filas[1].tiempo_s, 30.0, 1e-9));
    assert!(cerca(filas[1].delta_mejor_s, 0.0, 1e-9));
    assert!(cerca(filas[1].velocidad_media_kmh, 100.0, 1e-9));
    assert!(cerca(filas[1].velocidad_maxima_kmh, 100.0, 1e-9));
    assert!(cerca(filas[1].gas_medio, 0.5, 1e-9));
    assert!(cerca(filas[1].freno_medio, 0.25, 1e-9));
    assert!(cerca(filas[1].g_lat_max, 5.0 / G as f64, 1e-9));
    assert!(cerca(filas[1].rpm_medio, 5000.0, 1e-9));
    assert!(cerca(filas[1].combustible_usado, 10.0, 1e-5));
}

#[test]
fn t72_conjunto_solo_mezcla_vueltas_validas_del_auto_de_la_ref() {
    let a = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    let b = crear_vuelta(0, 1, tiempos_con_ritmo([0.11, 0.11, 0.11]));
    let c = crear_vuelta(1, 0, tiempos_con_ritmo([0.12, 0.12, 0.12]));
    let d = crear_vuelta(1, 1, tiempos_con_ritmo([0.13, 0.13, 0.13]));
    let mut e = crear_vuelta(1, 2, tiempos_con_ritmo([0.09, 0.09, 0.09]));
    e.valida = false;
    e.seleccionable = false;
    e.motivo = MotivoVuelta::Cortada;
    let vueltas = vec![a, b, c, d, e];

    let de_c = conjunto(&vueltas, vueltas[2].id);
    assert_eq!(de_c.len(), 2);
    assert!(de_c.iter().all(|vuelta| vuelta.id.auto == 1));
    assert!(de_c.iter().any(|vuelta| vuelta.id == vueltas[2].id));
    assert!(de_c.iter().any(|vuelta| vuelta.id == vueltas[3].id));
    assert!(!de_c.iter().any(|vuelta| vuelta.id == vueltas[4].id));

    let de_a = conjunto(&vueltas, vueltas[0].id);
    assert_eq!(de_a.len(), 2);
    assert!(de_a.iter().all(|vuelta| vuelta.id.auto == 0));
    assert!(
        conjunto(
            &vueltas,
            VueltaId {
                auto: 9,
                numero_local: 0
            }
        )
        .is_empty()
    );
}

#[test]
fn t73_delta_acumulado_cero_contra_si_misma_y_signo_correcto() {
    let grilla = grilla_prueba();
    let a = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    let b = crear_vuelta(0, 1, tiempos_con_ritmo([0.12, 0.12, 0.12]));

    let mismo = delta_acumulado(&a, &a, &grilla);
    assert!(mismo.iter().all(|valor| *valor == Some(0.0)));

    let delta = delta_acumulado(&a, &b, &grilla);
    assert_eq!(delta.len(), grilla.puntos());
    assert_eq!(delta[0], Some(0.0));
    assert!(cerca(delta[15].unwrap(), -3.0, 1e-9));
    assert!(cerca(delta[30].unwrap(), -6.0, 1e-9));

    let inverso = delta_acumulado(&b, &a, &grilla);
    assert!(cerca(inverso[30].unwrap(), 6.0, 1e-9));
}

#[test]
fn t74_deltas_de_velocidad_y_pedales_coinciden_con_el_caso_manual() {
    let grilla = grilla_prueba();
    let mut a = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    let mut b = crear_vuelta(1, 0, tiempos_con_ritmo([0.12, 0.12, 0.12]));
    a.muestras.speed_kmh = vec![100.0; 31];
    b.muestras.speed_kmh = vec![120.0; 31];
    a.muestras.gas = vec![0.5; 31];
    b.muestras.gas = vec![0.75; 31];
    a.muestras.freno = vec![0.25; 31];
    b.muestras.freno = vec![0.0; 31];

    let velocidad = delta_velocidad(&a, &b, &grilla);
    assert_eq!(velocidad[0], Some(-20.0));
    assert_eq!(velocidad[30], Some(-20.0));

    let pedales = delta_pedales(&a, &b, &grilla);
    assert_eq!(pedales.gas[0], Some(-0.25));
    assert_eq!(pedales.gas[30], Some(-0.25));
    assert_eq!(pedales.freno[0], Some(0.25));
    assert_eq!(pedales.freno[30], Some(0.25));
}

#[test]
fn t75_mini_delta_por_sector_coincide_con_el_delta_final() {
    let grilla = grilla_prueba();
    let a = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    let b = crear_vuelta(0, 1, tiempos_con_ritmo([0.12, 0.12, 0.12]));

    let por_sector = delta_por_sector(&a, &b, &grilla);
    assert_eq!(por_sector.len(), 3);
    for valor in &por_sector {
        assert!(cerca(*valor, -2.0, 1e-9), "{valor}");
    }

    let acumulado = delta_acumulado(&a, &b, &grilla);
    let final_acumulado = acumulado.last().copied().flatten().unwrap();
    assert!(cerca(por_sector.iter().sum::<f64>(), final_acumulado, 1e-9));
}

#[test]
fn t76_delta_entre_autos_distintos_se_alinea_por_arco_de_pista() {
    let grilla = grilla_prueba();
    let a = crear_vuelta(0, 0, tiempos_con_ritmo([0.1, 0.1, 0.1]));
    let s_b = vec![0.0, 5.0, 55.0, 155.0, 250.0, 300.0];
    let t_b: Vec<f64> = s_b.iter().map(|s| s * 0.12).collect();
    let b = crear_vuelta_con_s(1, 0, s_b, t_b);

    let delta = delta_acumulado(&a, &b, &grilla);
    assert_eq!(delta[15], Some(-3.0));
    assert_eq!(delta[30], Some(-6.0));
    assert_ne!(a.id.auto, b.id.auto);
}
