mod soporte;

use acreplay_core::acreplay::{parsear_replay, VERSION_SOPORTADA};
use acreplay_core::error::Motivo;
use soporte::{AutoFixture, ConstructorReplay, FrameFixture};

fn aproximadamente(a: f32, b: f32) -> bool {
    (a - b).abs() < 1e-3
}

#[test]
fn t14_version_16_acepta() {
    let bytes = ConstructorReplay::minimo().bytes();
    let replay = parsear_replay(&bytes, "minimo.acreplay").expect("v16 debe aceptar");
    assert_eq!(replay.meta.version, VERSION_SOPORTADA);
    assert_eq!(replay.meta.intervalo_ms, 33.3);
    assert_eq!(replay.meta.clima, "3_clear");
    assert_eq!(replay.meta.pista, "monza");
}

#[test]
fn t14_version_15_y_17_rechazan() {
    for version in [15u32, 17] {
        let mut constructor = ConstructorReplay::minimo();
        constructor.version = version;
        let error = parsear_replay(&constructor.bytes(), "otra.acreplay").unwrap_err();
        assert!(matches!(
            error.motivo,
            Motivo::VersionNoSoportada { version: v } if v == version
        ));
        assert!(error.mensaje().contains("otra.acreplay"));
    }
}

#[test]
fn t15_salta_frames_de_objetos_de_pista() {
    let mut constructor = ConstructorReplay::minimo();
    constructor.objetos_pista = 2;
    // frames_globales = 2 (dos frames del auto): 2 × (4 + 12×2) = 56 bytes.
    let replay = parsear_replay(&constructor.bytes(), "objetos.acreplay").unwrap();
    assert_eq!(replay.autos.len(), 1);
    assert_eq!(replay.autos[0].car_id, "auto_0");
    assert_eq!(replay.autos[0].frames, 2);
    assert_eq!(replay.autos[0].muestras.largo(), 2);
}

#[test]
fn t16_encabezado_por_auto() {
    let replay = parsear_replay(&ConstructorReplay::con_autos(3, 2).bytes(), "tres.acreplay")
        .expect("tres autos válidos");
    assert_eq!(replay.autos[1].car_id, "auto_1");
    assert_eq!(replay.autos[1].piloto, "Piloto 1");
    assert_eq!(replay.autos[1].nacion, "AR");
    assert_eq!(replay.autos[1].equipo, "Equipo");
    assert_eq!(replay.autos[1].skin, "skin");
    assert_eq!(replay.autos[1].frames, 2);
    assert_eq!(replay.autos[1].wings, 0);
}

#[test]
fn t17_frame_a_canales_conocidos() {
    let mut constructor = ConstructorReplay::minimo();
    let mut frame = FrameFixture::default();
    frame.x = 10.0;
    frame.y = 1.5;
    frame.z = -3.0;
    frame.yaw = 0.5;
    frame.pitch = 0.25;
    frame.roll = -0.75;
    frame.vel_x = 3.0;
    frame.vel_y = 4.0;
    frame.vel_z = 0.0;
    frame.rpm = 7000.0;
    frame.volante = 0.5;
    frame.gas = 200;
    frame.freno = 10;
    frame.marcha = 4;
    frame.vuelta = 2;
    frame.tiempo_vuelta_ms = 12_345;
    frame.ultima_vuelta_ms = 90_000;
    frame.mejor_vuelta_ms = 89_000;
    frame.gasolina = 40;
    frame.gasolina_por_vuelta = 3;
    frame.carga = [100.0, 200.0, 300.0, 400.0];
    frame.slip_ratio = [0.1, 0.2, -0.3, -0.4];
    frame.slip_angle = [0.01, 0.02, 0.03, 0.04];
    frame.estado = 0b1000;
    frame.boost = 7;
    constructor.autos[0].frames = vec![frame.clone()];

    let replay = parsear_replay(&constructor.bytes(), "canales.acreplay").unwrap();
    let m = &replay.autos[0].muestras;
    assert!(aproximadamente(m.x[0], 10.0));
    assert!(aproximadamente(m.y[0], 1.5));
    assert!(aproximadamente(m.z[0], -3.0));
    assert!(aproximadamente(m.yaw[0], 0.5));
    assert!(aproximadamente(m.pitch[0], 0.25));
    assert!(aproximadamente(m.roll[0], -0.75));
    assert!(aproximadamente(m.vel_x[0], 3.0));
    // 3-4-5 m/s -> 5 m/s -> 18 km/h.
    assert!(aproximadamente(m.speed_kmh[0], 18.0));
    assert!(aproximadamente(m.rpm[0], 7000.0));
    assert!(aproximadamente(m.volante[0], 0.5));
    assert_eq!(m.gas[0], 200);
    assert_eq!(m.freno[0], 10);
    assert_eq!(m.marcha[0], 4);
    assert_eq!(m.vuelta[0], 2);
    assert_eq!(m.tiempo_vuelta_ms[0], 12_345);
    assert_eq!(m.ultima_vuelta_ms[0], 90_000);
    assert_eq!(m.mejor_vuelta_ms[0], 89_000);
    assert_eq!(m.gasolina[0], 40);
    assert_eq!(m.gasolina_por_vuelta[0], 3);
    for rueda in 0..4 {
        assert!(aproximadamente(
            m.carga[rueda][0],
            frame.carga[rueda]
        ));
        assert!(aproximadamente(
            m.slip_ratio[rueda][0],
            frame.slip_ratio[rueda]
        ));
        assert!(aproximadamente(
            m.slip_angle[rueda][0],
            frame.slip_angle[rueda]
        ));
    }
    assert_eq!(m.estado[0], 0b1000);
    assert_eq!(m.boost[0], 7);
}

#[test]
fn t18_avance_entre_frames_con_wings_y_extra() {
    let mut constructor = ConstructorReplay::minimo();
    let mut primer = FrameFixture::default();
    primer.x = 1.0;
    let mut segundo = FrameFixture::default();
    segundo.x = 2.0;
    constructor.autos[0] = AutoFixture::nuevo("auto_w", "Piloto W", 0);
    constructor.autos[0].wings = 2;
    constructor.autos[0].extra_count = 1;
    constructor.autos[0].frames = vec![primer, segundo];

    let replay = parsear_replay(&constructor.bytes(), "wings.acreplay").unwrap();
    let m = &replay.autos[0].muestras;
    assert_eq!(m.largo(), 2);
    assert!(aproximadamente(m.x[0], 1.0));
    assert!(aproximadamente(m.x[1], 2.0));
}

#[test]
fn t19_pie_csp_no_cambia_el_resultado() {
    let mut sin_pie = ConstructorReplay::minimo();
    sin_pie.autos[0].frames[0].x = 5.0;
    let mut con_pie = sin_pie.clone();
    con_pie.con_pie_csp = true;

    let a = parsear_replay(&sin_pie.bytes(), "sin_csp.acreplay").unwrap();
    let b = parsear_replay(&con_pie.bytes(), "con_csp.acreplay").unwrap();
    assert_eq!(a.meta, b.meta);
    assert_eq!(a.autos, b.autos);
    assert_eq!(a.auto_referencia, b.auto_referencia);
}

#[test]
fn t20_recorre_todos_los_autos_en_orden() {
    let replay =
        parsear_replay(&ConstructorReplay::con_autos(3, 1).bytes(), "tres.acreplay").unwrap();
    assert_eq!(replay.autos.len(), 3);
    let ids: Vec<&str> = replay.autos.iter().map(|a| a.car_id.as_str()).collect();
    assert_eq!(ids, vec!["auto_0", "auto_1", "auto_2"]);
}

#[test]
fn t12_truncado_en_cualquier_seccion_da_error() {
    let bytes = ConstructorReplay::minimo().bytes();
    assert!(
        parsear_replay(&bytes, "completo.acreplay").is_ok(),
        "el fixture completo debe parsear"
    );

    for corte in 0..bytes.len() {
        let resultado = parsear_replay(&bytes[..corte], "cortado.acreplay");
        assert!(
            resultado.is_err(),
            "un prefijo de {corte} bytes no debería parsear como válido"
        );
    }
}

#[test]
fn indice_jugador_valido_marca_auto_de_referencia() {
    let mut constructor = ConstructorReplay::con_autos(3, 1);
    constructor.indice_jugador = 2;
    let replay = parsear_replay(&constructor.bytes(), "jugador.acreplay").unwrap();
    assert_eq!(replay.auto_referencia, Some(2));
}

#[test]
fn indice_jugador_fuera_de_rango_no_marca_referencia() {
    let mut constructor = ConstructorReplay::con_autos(2, 1);
    constructor.indice_jugador = 9;
    let replay = parsear_replay(&constructor.bytes(), "jugador.acreplay").unwrap();
    assert_eq!(replay.auto_referencia, None);
}
