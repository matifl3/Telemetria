//! Tests de integración de la capa Tauri (T97–T103).

mod comun;

use std::sync::Arc;
use std::thread;

use acreplay_core::error::{ErrorFormato, Motivo};
use acreplay_core::sesion::Sesion;
use acreplay_core::vuelta::VueltaId;

use ac_telemetry_lab_lib::comandos::{aplicar_lote, ArchivoCargado, Pestana};
use ac_telemetry_lab_lib::error_comando::ErrorComando;
use ac_telemetry_lab_lib::estado_app::EstadoApp;

use comun::{
    auto_valido, pista_bytes, pista_invalida_bytes, replay_bytes, sesion_valida, ConstructorReplay,
};

fn assert_invariantes(sesion: &Sesion) {
    if let Some(ref_id) = sesion.seleccion().ref_id {
        let vuelta = sesion.vuelta(ref_id).expect("la REF existe");
        assert!(vuelta.valida && vuelta.seleccionable, "REF no válida");
        assert!(sesion.seleccion().es_visible(ref_id), "REF oculta");
    }
    if let Some(b_id) = sesion.seleccion().b_id {
        assert_ne!(Some(b_id), sesion.seleccion().ref_id, "B no puede ser REF");
        let vuelta = sesion.vuelta(b_id).expect("la B existe");
        assert!(vuelta.valida && vuelta.seleccionable, "B no válida");
        assert!(sesion.seleccion().es_visible(b_id), "B oculta");
    }
}

#[test]
fn t97_accesos_concurrentes_conservan_el_estado() {
    let estado = Arc::new(EstadoApp::nueva());
    let id: VueltaId = estado.con_sesion(|sesion| {
        *sesion = sesion_valida();
        sesion.seleccion().visibles[0]
    });

    let mut hilos = Vec::new();
    for _ in 0..4 {
        let estado = Arc::clone(&estado);
        hilos.push(thread::spawn(move || {
            for _ in 0..500 {
                estado.con_sesion(|sesion| {
                    sesion.alternar_vuelta(id);
                    assert_invariantes(sesion);
                });
            }
        }));
    }
    for hilo in hilos {
        hilo.join().expect("ningún acceso debe entrar en pánico");
    }

    estado.con_sesion(|sesion| {
        assert_eq!(sesion.resumen().autos, 1);
        assert_invariantes(sesion);
    });
}

fn sesion_cargada() -> Sesion {
    let mut sesion = Sesion::nueva();
    sesion
        .cargar_lote(
            &replay_bytes(vec![auto_valido("auto_0", "Jugador")], 0),
            "replay.acreplay",
            &pista_bytes(),
            "fast_lane.ai",
        )
        .expect("la carga inicial es válida");
    sesion
}

#[test]
fn t98_lote_invalido_no_muta_la_sesion() {
    let mut sesion = sesion_cargada();
    let antes = sesion.clone();

    let error = aplicar_lote(
        &mut sesion,
        Some(ArchivoCargado {
            archivo: "roto.acreplay".to_string(),
            bytes: vec![0u8; 8],
        }),
        None,
    )
    .expect_err("una versión distinta de 16 se rechaza");

    assert_eq!(error.codigo, "version_no_soportada");
    assert_eq!(sesion, antes, "la sesión anterior queda intacta");
}

#[test]
fn t99_pista_invalida_conserva_la_anterior() {
    let mut sesion = sesion_cargada();
    let antes = sesion.clone();

    let error = aplicar_lote(
        &mut sesion,
        None,
        Some(ArchivoCargado {
            archivo: "fast_lane.ai".to_string(),
            bytes: vec![0u8; 8],
        }),
    )
    .expect_err("una pista truncada se rechaza");

    assert_eq!(sesion, antes, "la pista anterior queda intacta: {error:?}");
}

#[test]
fn t103_rechazos_de_carga_conservan_la_sesion() {
    let mut sesion = sesion_cargada();
    let antes = sesion.clone();

    // Versión distinta de 16.
    let viejo = ConstructorReplay {
        version: 15,
        ..ConstructorReplay::default()
    }
    .bytes();
    let error = aplicar_lote(
        &mut sesion,
        Some(ArchivoCargado {
            archivo: "viejo.acreplay".to_string(),
            bytes: viejo,
        }),
        None,
    )
    .expect_err("la versión 15 se rechaza");
    assert_eq!(error.codigo, "version_no_soportada");
    assert_eq!(sesion, antes, "la sesión queda intacta");

    // Replay truncado a mitad de un frame.
    let mut truncado = replay_bytes(vec![auto_valido("auto_0", "Jugador")], 0);
    truncado.truncate(truncado.len() - 4);
    let error = aplicar_lote(
        &mut sesion,
        Some(ArchivoCargado {
            archivo: "cortado.acreplay".to_string(),
            bytes: truncado,
        }),
        None,
    )
    .expect_err("un replay cortado se rechaza");
    assert_eq!(error.codigo, "archivo_corrupto");
    assert_eq!(sesion, antes, "la sesión queda intacta");

    // Pista con cantidad de puntos fuera de rango.
    let error = aplicar_lote(
        &mut sesion,
        None,
        Some(ArchivoCargado {
            archivo: "fast_lane.ai".to_string(),
            bytes: pista_invalida_bytes(),
        }),
    )
    .expect_err("una pista inválida se rechaza");
    assert_eq!(error.codigo, "pista_invalida");
    assert_eq!(sesion, antes, "la sesión queda intacta");
}

#[test]
fn pestanas_aceptan_el_nombre_de_la_ui() {
    for nombre in ["vuelta", "mapa", "conjunto", "comparacion", "curvas"] {
        assert!(Pestana::desde(nombre).is_ok(), "{nombre}");
    }
    assert!(Pestana::desde("otra").is_err());
}

#[test]
fn convierte_un_rechazo_con_archivo_y_offset() {
    let error = ErrorFormato::en_offset(
        "viejo.acreplay",
        Motivo::VersionNoSoportada { version: 15 },
        12,
    );
    let comando = ErrorComando::formato(&error);
    assert_eq!(comando.codigo, "version_no_soportada");
    assert_eq!(comando.archivo.as_deref(), Some("viejo.acreplay"));
    assert_eq!(comando.offset, Some(12));
    assert!(comando.mensaje.contains("solo se soporta la 16"));
}
