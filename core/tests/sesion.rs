mod soporte;

use std::fs;
use std::path::{Path, PathBuf};

use acreplay_core::error::Motivo;
use acreplay_core::sesion::{CodigoAviso, Sesion};
use acreplay_core::vuelta::VueltaId;
use soporte::pista::ConstructorPista;
use soporte::{AutoFixture, ConstructorReplay, FrameFixture};

const RADIO: f32 = 100.0;
const PUNTOS: usize = 60;

fn pista_bytes() -> Vec<u8> {
    ConstructorPista::circular(RADIO, PUNTOS)
        .con_semianchos(6.0, 6.0)
        .bytes()
}

/// Vuelta completa sobre el círculo sintético. `paso_ms` define su ritmo.
fn frames(numero: u8, cantidad: usize, paso_ms: u32) -> Vec<FrameFixture> {
    (0..cantidad)
        .map(|indice| {
            let angulo = std::f32::consts::TAU * indice as f32 / PUNTOS as f32;
            FrameFixture {
                x: RADIO * angulo.cos(),
                z: RADIO * angulo.sin(),
                vel_x: 27.8,
                vuelta: numero,
                tiempo_vuelta_ms: indice as u32 * paso_ms,
                ..FrameFixture::default()
            }
        })
        .collect()
}

fn auto(car_id: &str, piloto: &str, vueltas: &[(u8, usize, u32)]) -> AutoFixture {
    let mut auto = AutoFixture::nuevo(car_id, piloto, 0);
    auto.frames = vueltas
        .iter()
        .flat_map(|&(numero, cantidad, paso_ms)| frames(numero, cantidad, paso_ms))
        .collect();
    auto
}

/// Jugador con la primera vuelta lenta (salida) y dos válidas.
fn auto_con_invalida() -> AutoFixture {
    auto(
        "auto_0",
        "Jugador",
        &[(1, PUNTOS, 100), (2, PUNTOS, 33), (3, PUNTOS, 33)],
    )
}

fn auto_valido(car_id: &str, piloto: &str) -> AutoFixture {
    auto(car_id, piloto, &[(1, PUNTOS, 33), (2, PUNTOS, 33)])
}

fn auto_sin_vueltas() -> AutoFixture {
    auto("auto_0", "Jugador", &[])
}

fn replay_bytes(autos: Vec<AutoFixture>, indice_jugador: u32) -> Vec<u8> {
    ConstructorReplay {
        autos,
        indice_jugador,
        ..ConstructorReplay::default()
    }
    .bytes()
}

fn cargar(
    sesion: &mut Sesion,
    autos: Vec<AutoFixture>,
    indice_jugador: u32,
) -> acreplay_core::Resultado<()> {
    let replay = replay_bytes(autos, indice_jugador);
    sesion.cargar_lote(
        &replay,
        "replay.acreplay",
        &pista_bytes(),
        "fast_lane.ai",
    )
}

fn assert_invariantes(sesion: &Sesion) {
    for id in &sesion.seleccion().visibles {
        let vuelta = sesion.vuelta(*id).expect("la vuelta visible existe");
        assert!(vuelta.valida && vuelta.seleccionable, "{id:?} no es válida");
    }

    if let Some(id) = sesion.seleccion().ref_id {
        assert!(sesion.seleccion().es_visible(id), "la REF no está visible");
        let vuelta = sesion.vuelta(id).expect("la REF existe");
        assert!(vuelta.valida && vuelta.seleccionable, "la REF no es válida");
    }

    if let Some(id) = sesion.seleccion().b_id {
        assert!(sesion.seleccion().es_visible(id), "la B no está visible");
        assert_ne!(Some(id), sesion.seleccion().ref_id, "B no puede ser REF");
        let vuelta = sesion.vuelta(id).expect("la B existe");
        assert!(vuelta.valida && vuelta.seleccionable, "la B no es válida");
    }
}

#[test]
fn t81_carga_candidata_atomica_conserva_la_sesion_anterior() {
    let mut sesion = Sesion::nueva();
    cargar(&mut sesion, vec![auto_con_invalida(), auto_valido("auto_1", "Otro")], 0)
        .expect("la carga inicial es válida");
    assert!(sesion.puede_analizar());
    let antes = sesion.clone();

    let error = cargar(&mut sesion, vec![auto_sin_vueltas()], 0)
        .expect_err("un replay sin vueltas no entra");
    assert_eq!(error.motivo, Motivo::ReplaySinVueltas);
    assert_eq!(sesion, antes, "la sesión anterior debe quedar idéntica");

    let version_vieja = ConstructorReplay {
        version: 15,
        ..ConstructorReplay::default()
    };
    let error = sesion
        .cargar_lote(
            &version_vieja.bytes(),
            "viejo.acreplay",
            &pista_bytes(),
            "fast_lane.ai",
        )
        .expect_err("la versión 15 no se soporta");
    assert!(matches!(error.motivo, Motivo::VersionNoSoportada { version: 15 }));
    assert_eq!(sesion, antes, "un parseo fallido no debe tocar la sesión");
}

#[test]
fn t82_fallback_por_indice_invalido_y_jugador_sin_vueltas() {
    let mut por_indice = Sesion::nueva();
    cargar(
        &mut por_indice,
        vec![auto_valido("auto_0", "Piloto 0"), auto_valido("auto_1", "Piloto 1")],
        99,
    )
    .expect("hay autos con vueltas");
    assert_eq!(por_indice.auto_referencia(), Some(0));
    assert_eq!(por_indice.referencia().unwrap().id.auto, 0);
    assert!(por_indice
        .avisos()
        .iter()
        .any(|aviso| aviso.codigo == CodigoAviso::ReferenciaFallback));
    assert_invariantes(&por_indice);

    let mut por_jugador = Sesion::nueva();
    cargar(
        &mut por_jugador,
        vec![auto_sin_vueltas(), auto_valido("auto_1", "Piloto 1")],
        0,
    )
    .expect("otro auto tiene vueltas");
    assert_eq!(por_jugador.auto_referencia(), Some(1));
    let aviso = por_jugador
        .avisos()
        .iter()
        .find(|aviso| aviso.codigo == CodigoAviso::ReferenciaFallback)
        .expect("se avisa el fallback");
    assert!(
        aviso.mensaje.contains("Piloto 1"),
        "el aviso nombra el auto usado: {}",
        aviso.mensaje
    );
    assert_eq!(por_jugador.referencia().unwrap().id.auto, 1);
    assert_invariantes(&por_jugador);
}

#[test]
fn t83_rechazo_sin_vueltas_analizables() {
    let mut sesion = Sesion::nueva();
    cargar(&mut sesion, vec![auto_valido("auto_0", "Jugador")], 0)
        .expect("la carga inicial es válida");
    let antes = sesion.clone();

    let error = cargar(&mut sesion, vec![auto_sin_vueltas()], 0).expect_err("no hay vueltas");
    assert_eq!(
        error.motivo.descripcion(),
        "El replay no contiene vueltas analizables"
    );
    assert_eq!(sesion, antes, "no se entra al análisis");

    let mut vacia = Sesion::nueva();
    let error = cargar(&mut vacia, vec![auto_sin_vueltas()], 0)
        .expect_err("tampoco entra desde cero");
    assert_eq!(
        error.motivo.descripcion(),
        "El replay no contiene vueltas analizables"
    );
    assert!(!vacia.puede_analizar());
    assert!(vacia.replay().is_none());
}

#[test]
fn t84_seleccion_por_defecto_solo_validas_del_auto_referencia() {
    let mut sesion = Sesion::nueva();
    cargar(
        &mut sesion,
        vec![auto_con_invalida(), auto_valido("auto_1", "Otro")],
        0,
    )
    .expect("carga válida");

    let esperadas = vec![
        VueltaId {
            auto: 0,
            numero_local: 1,
        },
        VueltaId {
            auto: 0,
            numero_local: 2,
        },
    ];
    assert_eq!(sesion.seleccion().visibles, esperadas);
    assert_eq!(sesion.seleccion().ref_id, Some(esperadas[0]));
    assert_eq!(sesion.seleccion().b_id, Some(esperadas[1]));

    let visibles = sesion.vueltas_visibles();
    assert_eq!(visibles.len(), 2);
    for vuelta in visibles {
        assert_eq!(vuelta.id.auto, 0);
        assert!(vuelta.valida && vuelta.seleccionable);
    }

    // Las vueltas del otro auto quedan listadas, pero desmarcadas.
    assert!(sesion.vueltas().iter().any(|vuelta| vuelta.id.auto == 1));
    assert!(sesion
        .vueltas()
        .iter()
        .filter(|vuelta| vuelta.id.auto == 1)
        .all(|vuelta| !sesion.seleccion().es_visible(vuelta.id)));
    assert_invariantes(&sesion);
}

#[test]
fn t85_alternar_visibilidad_mantiene_ref_y_b_validas() {
    let mut sesion = Sesion::nueva();
    cargar(
        &mut sesion,
        vec![auto_con_invalida(), auto_valido("auto_1", "Otro")],
        0,
    )
    .expect("carga válida");

    let ref_id = sesion.seleccion().ref_id.expect("hay REF");
    assert!(sesion.alternar_vuelta(ref_id));
    let nueva_ref = sesion.seleccion().ref_id.expect("se reasigna la REF");
    assert_ne!(nueva_ref, ref_id);
    assert!(sesion.referencia().unwrap().valida);
    assert_invariantes(&sesion);

    let invalida = VueltaId {
        auto: 0,
        numero_local: 0,
    };
    let antes = sesion.clone();
    assert!(!sesion.alternar_vuelta(invalida), "una inválida no se activa");
    assert_eq!(sesion, antes);
    assert!(!sesion.seleccion().es_visible(invalida));

    let de_otro = VueltaId {
        auto: 1,
        numero_local: 0,
    };
    assert!(sesion.alternar_vuelta(de_otro));
    assert!(sesion.seleccion().es_visible(de_otro));
    assert_invariantes(&sesion);

    assert!(!sesion.fijar_b(invalida));
    assert!(sesion.fijar_referencia(de_otro));
    assert_eq!(sesion.auto_referencia(), Some(1));
    assert_eq!(sesion.seleccion().ref_id, Some(de_otro));
    assert_invariantes(&sesion);
}

#[test]
fn t86_limpiar_deja_todo_vacio() {
    let mut sesion = Sesion::nueva();
    cargar(
        &mut sesion,
        vec![auto_con_invalida(), auto_valido("auto_1", "Otro")],
        0,
    )
    .expect("carga válida");
    assert!(sesion.puede_analizar());

    sesion.limpiar();
    assert_eq!(sesion, Sesion::nueva());
    assert!(sesion.replay().is_none());
    assert!(sesion.pista().is_none());
    assert!(sesion.referencia().is_none());
    assert!(sesion.b().is_none());
    assert!(sesion.avisos().is_empty());
    assert!(!sesion.puede_analizar());
    assert!(!sesion.falta_pista());

    let resumen = sesion.resumen();
    assert_eq!(resumen.autos, 0);
    assert_eq!(resumen.vueltas, 0);
    assert_eq!(resumen.visibles, 0);
    assert_eq!(resumen.auto_referencia, None);
}

#[test]
fn t87_flujo_integrado_carga_fallback_alterna_y_resume() {
    let mut sesion = Sesion::nueva();
    cargar(
        &mut sesion,
        vec![
            auto_valido("auto_0", "Piloto 0"),
            auto_valido("auto_1", "Piloto 1"),
        ],
        99,
    )
    .expect("carga válida con fallback");

    assert_eq!(sesion.auto_referencia(), Some(0));
    assert!(sesion
        .avisos()
        .iter()
        .any(|aviso| aviso.codigo == CodigoAviso::ReferenciaFallback));

    let resumen = sesion.resumen();
    assert_eq!(resumen.autos, 2);
    assert_eq!(resumen.vueltas, 4);
    assert_eq!(resumen.visibles, 2);
    assert_eq!(
        resumen.ref_id,
        Some(VueltaId {
            auto: 0,
            numero_local: 0
        })
    );

    let de_otro = VueltaId {
        auto: 1,
        numero_local: 0,
    };
    assert!(sesion.alternar_vuelta(de_otro));
    assert_eq!(sesion.resumen().visibles, 3);
    assert!(sesion
        .vueltas_visibles()
        .iter()
        .any(|vuelta| vuelta.id == de_otro));

    assert!(sesion.fijar_referencia(de_otro));
    let resumen = sesion.resumen();
    assert_eq!(resumen.auto_referencia, Some(1));
    assert_eq!(resumen.ref_id, Some(de_otro));
    assert_invariantes(&sesion);
}

#[test]
fn t88_el_codigo_de_produccion_no_persiste() {
    let raiz = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("core está dentro del repo");

    let mut archivos = Vec::new();
    recolectar(&raiz.join("core").join("src"), "rs", &mut archivos);
    recolectar(&raiz.join("src-tauri").join("src"), "rs", &mut archivos);
    recolectar(&raiz.join("front"), "js", &mut archivos);
    archivos.push(raiz.join("front").join("index.html"));
    assert!(
        archivos.iter().any(|ruta| ruta.ends_with("curvas.rs")),
        "debe haber fuentes para revisar"
    );

    let prohibidos = [
        "fs::write",
        "File::create",
        "OpenOptions",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "document.cookie",
    ];
    for ruta in archivos {
        let texto = fs::read_to_string(&ruta).expect("fuente legible");
        for patron in prohibidos {
            assert!(
                !texto.contains(patron),
                "{} contiene una operación de persistencia: {patron}",
                ruta.display()
            );
        }
    }
}

/// Acumula los archivos con `extension` que hay bajo `directorio`.
fn recolectar(directorio: &Path, extension: &str, salida: &mut Vec<PathBuf>) {
    for entrada in fs::read_dir(directorio).expect("directorio legible") {
        let ruta = entrada.expect("entrada legible").path();
        if ruta.is_dir() {
            recolectar(&ruta, extension, salida);
        } else if ruta.extension().and_then(|valor| valor.to_str()) == Some(extension) {
            salida.push(ruta);
        }
    }
}
