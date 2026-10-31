use acreplay_core::clasificacion::clasificar_vueltas;
use acreplay_core::modelo::{Auto, MuestrasAuto};
use acreplay_core::vuelta::{
    aceleraciones, calcular_dt, calcular_yaw, cobertura_s_m, construir_series, construir_vueltas,
    etiqueta_vuelta, normalizar_pedal, segmentar_vueltas, tiempo_de_vuelta, unwrap_yaw,
    MotivoVuelta, SegmentoVuelta, Series, Vuelta, VueltaId, DT_POR_DEFECTO, G, MAX_G,
};

fn cerca(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-6
}

fn cerca_f32(a: f32, b: f32) -> bool {
    (a - b).abs() < 1e-3
}

/// Fila de prueba: solo los canales que varían entre tests.
#[derive(Debug, Clone, Copy)]
struct Fila {
    x: f32,
    z: f32,
    speed_kmh: f32,
    yaw: f32,
    gas: u8,
    freno: u8,
    marcha: u8,
    vuelta: u8,
    tiempo_ms: u32,
    gasolina: u8,
}

impl Default for Fila {
    fn default() -> Self {
        Self {
            x: 0.0,
            z: 0.0,
            speed_kmh: 0.0,
            yaw: 0.0,
            gas: 0,
            freno: 0,
            marcha: 0,
            vuelta: 1,
            tiempo_ms: 0,
            gasolina: 0,
        }
    }
}

/// Construye `MuestrasAuto` con todos los canales del mismo largo.
fn muestras(filas: &[Fila]) -> MuestrasAuto {
    let mut muestras = MuestrasAuto::con_capacidad(filas.len());
    for fila in filas {
        muestras.x.push(fila.x);
        muestras.y.push(0.0);
        muestras.z.push(fila.z);
        muestras.vel_x.push(fila.speed_kmh / 3.6);
        muestras.vel_y.push(0.0);
        muestras.vel_z.push(0.0);
        muestras.speed_kmh.push(fila.speed_kmh);
        muestras.yaw.push(fila.yaw);
        muestras.pitch.push(0.0);
        muestras.roll.push(0.0);
        muestras.rpm.push(0.0);
        muestras.volante.push(0.0);
        muestras.gas.push(fila.gas);
        muestras.freno.push(fila.freno);
        muestras.marcha.push(fila.marcha);
        muestras.vuelta.push(fila.vuelta);
        muestras.tiempo_vuelta_ms.push(fila.tiempo_ms);
        muestras.ultima_vuelta_ms.push(0);
        muestras.mejor_vuelta_ms.push(0);
        muestras.gasolina.push(fila.gasolina);
        muestras.gasolina_por_vuelta.push(0);
        for rueda in 0..4 {
            muestras.carga[rueda].push(0.0);
            muestras.slip_ratio[rueda].push(0.0);
            muestras.slip_angle[rueda].push(0.0);
        }
        muestras.estado.push(0);
        muestras.boost.push(0);
    }
    muestras
}

fn auto(indice: usize, muestras: MuestrasAuto) -> Auto {
    Auto {
        indice,
        car_id: format!("auto_{indice}"),
        piloto: format!("Piloto {indice}"),
        frames: muestras.largo() as u32,
        muestras,
        ..Auto::default()
    }
}

fn vuelta(auto: usize, numero_local: usize, cobertura: f64, velocidad: f64) -> Vuelta {
    Vuelta {
        id: VueltaId { auto, numero_local },
        numero: numero_local as u8 + 1,
        etiqueta: etiqueta_vuelta("Piloto", "auto", numero_local as u8 + 1),
        cobertura_s_m: cobertura,
        vel_media_mps: velocidad,
        ..Vuelta::default()
    }
}

#[test]
fn t31_segmenta_por_current_lap() {
    let segmentos = segmentar_vueltas(&[1, 2, 2, 3]);
    assert_eq!(segmentos.len(), 3);
    assert_eq!(
        segmentos[0],
        SegmentoVuelta {
            numero: 1,
            inicio: 0,
            fin: 1
        }
    );
    assert_eq!(
        segmentos[1],
        SegmentoVuelta {
            numero: 2,
            inicio: 1,
            fin: 3
        }
    );
    assert_eq!(
        segmentos[2],
        SegmentoVuelta {
            numero: 3,
            inicio: 3,
            fin: 4
        }
    );
}

#[test]
fn t31_mismo_numero_separado_no_se_unifica() {
    let segmentos = segmentar_vueltas(&[1, 2, 1]);
    assert_eq!(segmentos.len(), 3);
    assert_eq!(segmentos[2].numero, 1);
    assert_eq!(segmentos[2].inicio, 2);
}

#[test]
fn t32_series_y_tiempo_relativo() {
    let filas = [
        Fila {
            tiempo_ms: 1_000,
            ..Fila::default()
        },
        Fila {
            tiempo_ms: 1_100,
            ..Fila::default()
        },
        Fila {
            tiempo_ms: 1_200,
            ..Fila::default()
        },
        Fila {
            tiempo_ms: 1_300,
            ..Fila::default()
        },
    ];
    let segmento = SegmentoVuelta {
        numero: 2,
        inicio: 1,
        fin: 4,
    };
    let series = construir_series(&muestras(&filas), &[0.0, 10.0, 20.0, 30.0], &segmento);

    assert!(cerca(series.t_rel[0], 0.0));
    assert!(cerca(series.t_rel[1], 0.1));
    assert!(cerca(series.t_rel[2], 0.2));
    assert_eq!(series.largo(), 3);
    assert_eq!(series.dt.len(), 3);
    assert_eq!(series.s, vec![10.0, 20.0, 30.0]);
    assert_eq!(series.x.len(), 3);
    assert_eq!(series.y.len(), 3);
    assert_eq!(series.z.len(), 3);
    assert_eq!(series.speed_kmh.len(), 3);
    assert_eq!(series.rpm.len(), 3);
    assert_eq!(series.volante.len(), 3);
    assert_eq!(series.yaw.len(), 3);
    assert_eq!(series.gas.len(), 3);
    assert_eq!(series.freno.len(), 3);
    assert_eq!(series.marcha.len(), 3);
    assert_eq!(series.acc_long.len(), 3);
    assert_eq!(series.acc_lat.len(), 3);
    assert_eq!(series.acc_total.len(), 3);
    assert_eq!(series.gasolina.len(), 3);
    for rueda in 0..4 {
        assert_eq!(series.carga[rueda].len(), 3);
        assert_eq!(series.slip_ratio[rueda].len(), 3);
        assert_eq!(series.slip_angle[rueda].len(), 3);
    }
}

#[test]
fn t33_dt_robusto_con_saltos_y_no_finitos() {
    let dt = calcular_dt(&[0.0, 0.1, 5.0, 5.1]);
    assert!(cerca(dt[0], DT_POR_DEFECTO));
    assert!(cerca(dt[1], 0.1));
    // El salto de 4,9 s no sirve: repite el dt anterior.
    assert!(cerca(dt[2], 0.1));
    assert!(cerca(dt[3], 0.1));

    let con_no_finitos = calcular_dt(&[0.0, f64::NAN, 1.0, 0.5]);
    assert!(con_no_finitos
        .iter()
        .all(|valor| valor.is_finite() && *valor > 0.0));
    assert!(con_no_finitos
        .iter()
        .all(|valor| cerca(*valor, DT_POR_DEFECTO)));
}

#[test]
fn t34_yaw_se_desenrolla_y_cae_a_posiciones() {
    let desenrollado = unwrap_yaw(&[3.0, -3.0, 3.0]);
    assert!(cerca_f32(desenrollado[0], 3.0));
    assert!(cerca_f32(desenrollado[1], 3.283_185_5));
    assert!(cerca_f32(desenrollado[2], 3.0));

    // Yaw todo en cero: se calcula el rumbo con las posiciones.
    let yaw = calcular_yaw(&[0.0, 1.0, 1.0], &[0.0, 0.0, 1.0], &[0.0, 0.0, 0.0]);
    assert!(cerca_f32(yaw[0], 0.0));
    assert!(cerca_f32(yaw[1], std::f32::consts::FRAC_PI_2));
    assert!(cerca_f32(yaw[2], 0.0));
}

#[test]
fn t35_aceleraciones_con_esperado_y_clamp() {
    let (long, lat, total) =
        aceleraciones(&[36.0, 72.0, 108.0], &[0.0, 0.0, 0.0], &[1.0, 1.0, 1.0]);
    assert!(cerca_f32(long[0], 0.0));
    assert!(cerca_f32(long[1], 10.0));
    assert!(cerca_f32(long[2], 10.0));
    assert!(cerca_f32(lat[1], 0.0));
    assert!(cerca_f32(total[1], 10.0));

    // 10 m/s con 1 rad de giro por segundo: 10 m/s² laterales.
    let (_, lat, total) = aceleraciones(&[36.0, 36.0, 36.0], &[0.0, 1.0, 2.0], &[1.0, 1.0, 1.0]);
    assert!(cerca_f32(lat[1], 10.0));
    assert!(cerca_f32(lat[2], 10.0));
    assert!(cerca_f32(total[1], 10.0));

    // 1000 m/s² se recorta; el total conserva el valor sin recortar.
    let (long, _, total) = aceleraciones(&[0.0, 36.0], &[0.0, 0.0], &[0.01, 0.01]);
    assert!(cerca_f32(long[1], MAX_G * G));
    assert!(cerca_f32(total[1], 1000.0));
}

#[test]
fn t36_pedales_en_tres_escalas_quedan_en_0_1() {
    for (crudos, paso) in [
        (vec![0u8, 1], 1.0f32),
        (vec![0u8, 50, 100], 100.0),
        (vec![0u8, 128, 255], 255.0),
    ] {
        let normalizados = normalizar_pedal(&crudos);
        assert!(cerca_f32(normalizados[0], 0.0));
        assert!(cerca_f32(normalizados[normalizados.len() - 1], 1.0));
        for (crudo, normal) in crudos.iter().zip(&normalizados) {
            let esperado = *crudo as f32 / paso;
            assert!(cerca_f32(*normal, esperado), "{normal} != {esperado}");
            assert!((0.0..=1.0).contains(normal));
        }
    }
}

#[test]
fn t37_tiempo_y_cobertura() {
    let series = Series {
        t_rel: vec![0.0, f64::NAN, 2.5],
        s: vec![0.0, 50.0, 20.0],
        ..Series::default()
    };
    assert!(cerca(tiempo_de_vuelta(&series.t_rel), 2.5));
    assert!(cerca(cobertura_s_m(&series.s), 50.0));

    assert!(tiempo_de_vuelta(&[]).is_nan());
    assert!(cobertura_s_m(&[]).is_nan());
}

#[test]
fn t37_vuelta_construida_calcula_tiempo_y_cobertura() {
    let filas = [
        Fila {
            tiempo_ms: 1_000,
            ..Fila::default()
        },
        Fila {
            tiempo_ms: 1_500,
            ..Fila::default()
        },
        Fila {
            tiempo_ms: 2_000,
            ..Fila::default()
        },
    ];
    let auto = auto(0, muestras(&filas));
    let vueltas = construir_vueltas(&auto, &[0.0, 100.0, 250.0]);
    assert_eq!(vueltas.len(), 1);
    assert!(cerca(vueltas[0].tiempo_s, 1.0));
    assert!(cerca(vueltas[0].cobertura_s_m, 250.0));
    assert!(cerca(vueltas[0].vel_media_mps, 250.0));
}

#[test]
fn t38_medianas_y_bordes_por_auto() {
    let mut vueltas = Vec::new();
    // Cada auto usa una escala distinta: si se clasificara en conjunto, los
    // autos 0 y 2 quedarían todos "cortados".
    for (auto, cobertura, velocidad) in
        [(0, 5_000.0, 40.0), (1, 10_000.0, 60.0), (2, 2_500.0, 30.0)]
    {
        for numero_local in 0..4 {
            vueltas.push(vuelta(auto, numero_local, cobertura, velocidad));
        }
    }
    clasificar_vueltas(&mut vueltas);
    assert!(vueltas.iter().all(|v| v.valida), "{vueltas:?}");

    // El borde es local a cada auto: la primera de cada uno es "salida".
    let mut vueltas = Vec::new();
    for auto in 0..3 {
        for numero_local in 0..3 {
            let velocidad = if numero_local == 0 { 10.0 } else { 40.0 };
            vueltas.push(vuelta(auto, numero_local, 5_000.0, velocidad));
        }
    }
    clasificar_vueltas(&mut vueltas);
    for auto in 0..3 {
        let primera = vueltas.iter().find(|v| v.id.auto == auto).unwrap();
        assert_eq!(primera.motivo, MotivoVuelta::Salida, "auto {auto}");
        assert!(!primera.valida);
    }
}

#[test]
fn t39_motivos_y_seleccionable() {
    let mut vueltas = vec![
        vuelta(0, 0, 5_000.0, 10.0),
        vuelta(0, 1, 5_000.0, 40.0),
        vuelta(0, 2, 2_000.0, 40.0),
        vuelta(0, 3, 5_000.0, 40.0),
        vuelta(0, 4, 2_000.0, 30.0),
        vuelta(1, 0, 5_000.0, 40.0),
        vuelta(1, 1, 5_000.0, 10.0),
    ];
    clasificar_vueltas(&mut vueltas);

    let motivos: Vec<MotivoVuelta> = vueltas.iter().map(|v| v.motivo).collect();
    assert_eq!(
        motivos,
        vec![
            MotivoVuelta::Salida,
            MotivoVuelta::Ninguno,
            MotivoVuelta::Cortada,
            MotivoVuelta::Ninguno,
            MotivoVuelta::Incompleta,
            MotivoVuelta::Ninguno,
            MotivoVuelta::Entrada,
        ]
    );
    for (indice, vuelta) in vueltas.iter().enumerate() {
        let valida = indice == 1 || indice == 3 || indice == 5;
        assert_eq!(vuelta.valida, valida, "vuelta {indice}");
        assert_eq!(vuelta.seleccionable, valida, "vuelta {indice}");
    }
}

#[test]
fn t40_etiqueta_exacta() {
    assert_eq!(
        etiqueta_vuelta("Piloto 0", "auto_0", 3),
        "Piloto 0 · auto_0 · V3"
    );
}
