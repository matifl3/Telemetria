use acreplay_core::clasificacion::{clasificar_vueltas, descartar_cortas_por_pista};
use acreplay_core::modelo::{Auto, MuestrasAuto};
use acreplay_core::vuelta::{
    aceleraciones, calcular_dt, calcular_yaw, cobertura_s_m, construir_series, construir_vueltas,
    etiqueta_vuelta, normalizar_pedal, segmentar_auto, segmentar_por_reloj, segmentar_vueltas,
    tiempo_de_vuelta, unwrap_yaw, MotivoVuelta, SegmentoVuelta, Series, Vuelta, VueltaId,
    DT_POR_DEFECTO, G, MAX_G,
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
    /// `last_lap_time` (ms).
    ultima_ms: u32,
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
            ultima_ms: 0,
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
        muestras.ultima_vuelta_ms.push(fila.ultima_ms);
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
    // Sin `last_lap_time`, el tiempo es el reloj del juego al cerrar el tramo
    // (`current_lap_time` ya cuenta desde la meta), no la resta contra el
    // primer frame.
    assert!(cerca(vueltas[0].tiempo_s, 2.0));
    assert_eq!(vueltas[0].tiempo_juego_s, Some(2.0));
    assert!(cerca(vueltas[0].cobertura_s_m, 250.0));
    assert!(cerca(vueltas[0].vel_media_mps, 125.0));
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

/// Filas de un auto: `(current_lap, current_lap_time, last_lap_time)` por frame.
fn filas_de(datos: &[(u8, u32, u32)]) -> Vec<Fila> {
    datos
        .iter()
        .map(|&(vuelta, tiempo_ms, ultima_ms)| Fila {
            vuelta,
            tiempo_ms,
            ultima_ms,
            ..Fila::default()
        })
        .collect()
}

#[test]
fn segmenta_por_reinicio_del_reloj() {
    // Dos reinicios en meta; la caída chica (500 → 400) es ruido, no meta.
    let segmentos = segmentar_por_reloj(&[900_000, 900_120, 90, 500, 400, 107_000, 60, 200]);
    assert_eq!(
        segmentos,
        vec![
            SegmentoVuelta {
                numero: 0,
                inicio: 0,
                fin: 2
            },
            SegmentoVuelta {
                numero: 1,
                inicio: 2,
                fin: 6
            },
            SegmentoVuelta {
                numero: 2,
                inicio: 6,
                fin: 8
            },
        ]
    );
    assert!(segmentar_por_reloj(&[]).is_empty());
}

#[test]
fn segmentar_auto_usa_current_lap_solo_si_cambia() {
    // Jugador: `current_lap` cambia → se respeta aunque el reloj no se reinicie.
    let jugador = muestras(&filas_de(&[
        (1, 100, 0),
        (1, 200, 0),
        (2, 300, 0),
        (2, 400, 0),
    ]));
    assert_eq!(segmentar_auto(&jugador), segmentar_vueltas(&jugador.vuelta));

    // Otro auto: `current_lap` fijo en 0 → se corta por el reloj.
    let otro = muestras(&filas_de(&[
        (0, 5_000, 0),
        (0, 6_000, 0),
        (0, 50, 0),
        (0, 2_000, 0),
    ]));
    let segmentos = segmentar_auto(&otro);
    assert_eq!(segmentos.len(), 2);
    assert_eq!((segmentos[1].inicio, segmentos[1].fin), (2, 4));
}

#[test]
fn tiempo_oficial_sale_de_last_lap_time_de_la_vuelta_siguiente() {
    // V1 termina con el reloj en 105_714; al empezar V2 el juego publica
    // `last_lap_time` = 105_781 (oficial). V2 no tiene siguiente: usa el reloj.
    let datos = [
        (1, 100, 99_000),
        (1, 105_714, 99_000),
        (2, 54, 105_781),
        (2, 106_000, 105_781),
    ];
    let vueltas = construir_vueltas(&auto(0, muestras(&filas_de(&datos))), &[]);
    assert_eq!(vueltas.len(), 2);
    assert!(cerca(vueltas[0].tiempo_s, 105.781));
    assert!(cerca(vueltas[1].tiempo_s, 106.0));
}

#[test]
fn otros_autos_sin_current_lap_tienen_tiempo_por_vuelta() {
    // Como en los replays online: `current_lap` y `last_lap_time` siempre en 0.
    let datos = [
        (0, 1_024_000, 0),
        (0, 1_024_023, 0),
        (0, 93, 0),
        (0, 107_733, 0),
        (0, 90, 0),
        (0, 106_530, 0),
    ];
    let vueltas = construir_vueltas(&auto(1, muestras(&filas_de(&datos))), &[]);
    let tiempos: Vec<f64> = vueltas.iter().map(|v| v.tiempo_s).collect();
    assert_eq!(tiempos.len(), 3);
    assert!(cerca(tiempos[1], 107.733));
    assert!(cerca(tiempos[2], 106.530));
    assert!(
        tiempos.iter().all(|t| *t > 0.0),
        "nunca tiempos negativos: {tiempos:?}"
    );
    assert!(vueltas[1].etiqueta.ends_with("V1"));
}

#[test]
fn auto_con_un_solo_tramo_no_tiene_vueltas_validas() {
    // Un auto que nunca cruza la meta dos veces no tiene una vuelta completa.
    let mut vueltas = vec![vuelta(7, 0, 4_000.0, 40.0)];
    clasificar_vueltas(&mut vueltas);
    assert!(!vueltas[0].valida);
    assert!(!vueltas[0].seleccionable);
    assert_eq!(vueltas[0].motivo, MotivoVuelta::Incompleta);
}

#[test]
fn vueltas_que_no_cubren_el_90_por_ciento_de_la_pista_no_son_validas() {
    // Un auto con todas sus vueltas parciales: la mediana propia no las detecta.
    let mut vueltas = vec![
        vuelta(6, 0, 1_500.0, 23.0),
        vuelta(6, 1, 1_480.0, 23.0),
        vuelta(6, 2, 1_490.0, 23.0),
        vuelta(0, 0, 5_700.0, 48.0),
        vuelta(0, 1, 5_190.0, 48.0),
        vuelta(0, 2, 5_000.0, 48.0),
    ];
    clasificar_vueltas(&mut vueltas);
    assert!(
        vueltas[..3].iter().all(|v| v.valida),
        "la mediana sola no las descarta"
    );

    descartar_cortas_por_pista(&mut vueltas, 5_757.0);
    assert_eq!(vueltas[0].motivo, MotivoVuelta::Incompleta);
    assert_eq!(vueltas[1].motivo, MotivoVuelta::Cortada);
    assert_eq!(vueltas[2].motivo, MotivoVuelta::Incompleta);
    assert!(vueltas[..3].iter().all(|v| !v.valida && !v.seleccionable));
    // 5_190 m ≥ 90 % de 5_757 m: sigue válida; 5_000 m no.
    assert!(vueltas[3].valida && vueltas[4].valida);
    assert!(!vueltas[5].valida);

    // Sin largo de pista utilizable no se toca nada.
    let mut sin_pista = vec![vuelta(1, 0, 10.0, 1.0)];
    sin_pista[0].valida = true;
    descartar_cortas_por_pista(&mut sin_pista, f64::NAN);
    assert!(sin_pista[0].valida);
}
