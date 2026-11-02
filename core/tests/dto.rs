mod soporte;

use acreplay_core::dto::{self, DtoComparacion};
use acreplay_core::sesion::Sesion;
use acreplay_core::vuelta::VueltaId;
use serde_json::Value;
use soporte::pista::ConstructorPista;
use soporte::{AutoFixture, ConstructorReplay, FrameFixture};

const RADIO: f32 = 100.0;
const PUNTOS: usize = 60;

fn pista_bytes() -> Vec<u8> {
    ConstructorPista::circular(RADIO, PUNTOS)
        .con_semianchos(6.0, 6.0)
        .bytes()
}

fn frames(numero: u8, cantidad: usize, paso_ms: u32) -> Vec<FrameFixture> {
    (0..cantidad)
        .map(|indice| {
            let angulo = std::f32::consts::TAU * indice as f32 / PUNTOS as f32;
            FrameFixture {
                x: RADIO * angulo.cos(),
                z: RADIO * angulo.sin(),
                vel_x: 27.8,
                gas: 180,
                marcha: 4,
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

fn auto_valido(car_id: &str, piloto: &str) -> AutoFixture {
    auto(car_id, piloto, &[(1, PUNTOS, 33), (2, PUNTOS, 33)])
}

fn cargar(sesion: &mut Sesion, autos: Vec<AutoFixture>, indice_jugador: u32) {
    let replay = ConstructorReplay {
        autos,
        indice_jugador,
        ..ConstructorReplay::default()
    }
    .bytes();
    sesion
        .cargar_lote(&replay, "replay.acreplay", &pista_bytes(), "fast_lane.ai")
        .expect("la carga de prueba es válida");
}

fn sesion_dos_autos() -> Sesion {
    let mut sesion = Sesion::nueva();
    cargar(
        &mut sesion,
        vec![
            auto_valido("auto_0", "Piloto 0"),
            auto_valido("auto_1", "Piloto 1"),
        ],
        99,
    );
    sesion
}

fn sin_no_finitos(valor: &Value) {
    match valor {
        Value::Number(numero) => {
            let numero = numero.as_f64().expect("número JSON");
            assert!(numero.is_finite(), "el JSON contiene un número no finito");
        }
        Value::Array(valores) => valores.iter().for_each(sin_no_finitos),
        Value::Object(campos) => campos.values().for_each(sin_no_finitos),
        _ => {}
    }
}

fn json(dto: &impl serde::Serialize) -> Value {
    let valor = serde_json::to_value(dto).expect("el DTO se serializa");
    sin_no_finitos(&valor);
    valor
}

#[test]
fn t89_resumen_incluye_autos_vueltas_avisos_y_seleccion() {
    let sesion = sesion_dos_autos();
    let dto = dto::resumen(&sesion);
    assert_eq!(dto.autos.len(), 2);
    assert_eq!(dto.autos[0].vueltas_validas, 2);
    assert!(dto.autos[0].es_referencia);
    assert_eq!(dto.vueltas.len(), 4);
    assert_eq!(dto.seleccion.visibles.len(), 2);
    assert!(dto
        .avisos
        .iter()
        .any(|aviso| aviso.mensaje.contains("Piloto 0")));

    let valor = json(&dto);
    assert!(valor["autos"].is_array());
    assert!(valor["vueltas"][0]["tiempo_s"].is_f64());
    assert_eq!(valor["seleccion"]["referencia"]["auto"], 0);
    assert_eq!(valor["avisos"][0]["codigo"], "referencia_fallback");
    assert!(valor["pista"]["curvas"].as_u64().unwrap() > 0);
}

#[test]
fn t90_vuelta_entrega_canales_alineados_y_lecturas_de_la_ref() {
    let sesion = sesion_dos_autos();
    let dto = dto::vuelta(&sesion);
    assert!(!dto.grilla.is_empty());
    assert_eq!(dto.vueltas.len(), 2);
    assert_eq!(dto.vueltas[0].id.auto, 0);

    let canales = &dto.vueltas[0];
    assert_eq!(canales.tiempo.len(), dto.grilla.len());
    assert_eq!(canales.velocidad_kmh.len(), dto.grilla.len());
    assert_eq!(canales.marcha.len(), dto.grilla.len());
    assert_eq!(canales.carga.delantera_izquierda.len(), dto.grilla.len());
    assert!(canales
        .velocidad_kmh
        .iter()
        .flatten()
        .any(|&valor| valor > 90.0));
    assert!(canales
        .acelerador
        .iter()
        .flatten()
        .any(|&valor| valor > 0.6));

    let referencia = dto.referencia.as_ref().expect("hay REF");
    assert_eq!(referencia.id, canales.id);
    assert!(referencia.tiempo_s.unwrap() > 0.0);
    assert!(referencia.velocidad_media_kmh.unwrap() > 0.0);

    let valor = json(&dto);
    assert!(valor["grilla"].is_array());
    assert!(valor["vueltas"][0]["carga"]["delantera_izquierda"].is_array());
}

#[test]
fn t91_mapa_incluye_banda_trazas_canales_y_bounds() {
    let sesion = sesion_dos_autos();
    let dto = dto::mapa(&sesion);
    assert!(dto.pista.is_some());
    assert_eq!(dto.trazas.len(), 2);
    assert!(!dto.trazas[0].puntos.is_empty());
    assert_eq!(
        dto.trazas[0].puntos.len(),
        dto.trazas[0].velocidad_kmh.len()
    );
    assert_eq!(dto.trazas[0].puntos.len(), PUNTOS);
    assert!(dto.bounds.min_x.is_some());
    assert!(!dto.curvas.is_empty());

    let pista = dto.pista.as_ref().unwrap();
    assert_eq!(pista.centro.len(), PUNTOS);
    assert_eq!(pista.izquierda.len(), PUNTOS);
    assert_eq!(pista.derecha.len(), PUNTOS);

    let valor = json(&dto);
    assert!(valor["trazas"][0]["puntos"][0].is_array());
    assert!(valor["pista"]["izquierda"].is_array());
}

#[test]
fn t92_conjunto_solo_agrega_las_vueltas_de_la_ref() {
    let sesion = sesion_dos_autos();
    let dto = dto::conjunto(&sesion);
    assert_eq!(dto.auto, Some(0));
    assert_eq!(
        dto.vuelta_referencia,
        Some(
            VueltaId {
                auto: 0,
                numero_local: 0
            }
            .into()
        )
    );
    assert_eq!(dto.vueltas.len(), 2);
    assert!(dto.vueltas.iter().all(|vuelta| vuelta.auto == 0));
    assert_eq!(dto.tiempos.len(), 2);
    assert_eq!(dto.velocidades.len(), 2);
    assert_eq!(dto.tabla.len(), 2);
    assert_eq!(dto.consumos.len(), 2);
    assert_eq!(dto.sectores.len(), 2);
    assert_eq!(dto.desvios.len(), 1);
    assert_eq!(dto.mapa.trazas.len(), 2);
    assert_eq!(dto.histograma_velocidad.conteos.len(), 30);
    assert_eq!(dto.histograma_marchas.minima, Some(4));

    let valor = json(&dto);
    assert!(valor["tiempos"][0]["tiempo_s"].is_f64());
    assert_eq!(valor["vueltas"][0]["auto"], 0);
}

#[test]
fn t93_comparacion_entrega_a_b_y_series_de_delta() {
    let mut sesion = sesion_dos_autos();
    let de_otro = VueltaId {
        auto: 1,
        numero_local: 0,
    };
    assert!(sesion.alternar_vuelta(de_otro));
    assert!(sesion.fijar_b(de_otro));

    let dto = dto::comparacion(&sesion);
    let a = dto.a.as_ref().expect("hay A");
    let b = dto.b.as_ref().expect("hay B");
    assert_eq!(a.id.auto, 0);
    assert_eq!(b.id.auto, 1);
    assert_eq!(dto.delta_tiempo.len(), dto.grilla.len());
    assert_eq!(dto.delta_velocidad_kmh.len(), dto.grilla.len());
    assert_eq!(dto.delta_pedales.gas.len(), dto.grilla.len());
    assert_eq!(dto.delta_sectores.len(), 3);
    assert!(dto
        .delta_tiempo
        .iter()
        .flatten()
        .all(|&valor| valor.abs() < 1e-9));
    assert!(dto
        .delta_sectores
        .iter()
        .flatten()
        .all(|&valor| valor.abs() < 1e-9));

    let valor = json(&dto);
    assert_eq!(valor["a"]["id"]["auto"], 0);
    assert_eq!(valor["b"]["id"]["auto"], 1);
    assert_eq!(valor["delta_sectores"].as_array().unwrap().len(), 3);
}

#[test]
fn t94_curvas_incluye_metricas_por_vuelta_y_delta() {
    let mut sesion = sesion_dos_autos();
    let de_otro = VueltaId {
        auto: 1,
        numero_local: 0,
    };
    assert!(sesion.alternar_vuelta(de_otro));
    assert!(sesion.fijar_b(de_otro));

    let dto = dto::curvas(&sesion);
    assert!(!dto.curvas.is_empty());
    assert_eq!(dto.vueltas.len(), 3);
    assert_eq!(dto.vueltas[0].metricas.len(), dto.curvas.len());
    assert_eq!(dto.mapa.trazas.len(), 3);

    let delta = dto.delta.as_ref().expect("hay delta A/B");
    assert_eq!(delta.curvas.len(), dto.curvas.len());
    assert_eq!(delta.a.id.auto, 0);
    assert_eq!(delta.b.id.auto, 1);

    let valor = json(&dto);
    assert!(valor["curvas"][0]["nombre"].is_string());
    assert!(valor["delta"]["curvas"].is_array());
}

#[test]
fn t95_los_huecos_viajan_como_null_y_nunca_como_nan() {
    let dto = DtoComparacion {
        grilla: vec![0.0, 10.0],
        delta_tiempo: vec![None, Some(1.5)],
        ..DtoComparacion::default()
    };
    let valor = json(&dto);
    assert!(valor["delta_tiempo"][0].is_null());
    assert_eq!(valor["delta_tiempo"][1], 1.5);

    let sesion = sesion_dos_autos();
    for valor in [
        json(&dto::resumen(&sesion)),
        json(&dto::vuelta(&sesion)),
        json(&dto::mapa(&sesion)),
        json(&dto::conjunto(&sesion)),
        json(&dto::comparacion(&sesion)),
        json(&dto::curvas(&sesion)),
    ] {
        sin_no_finitos(&valor);
    }
}
