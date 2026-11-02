//! Capa Tauri: comandos, estado en memoria y ventana (fase 11).
//!
//! Toda la lógica vive en `acreplay_core`; esta capa solo lee archivos elegidos
//! por el usuario y mantiene la sesión en memoria (RF-010).

pub mod comandos;
pub mod estado_app;
pub mod error_comando;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(estado_app::EstadoApp::nueva())
        .invoke_handler(tauri::generate_handler![
            comandos::abrir_dialogo,
            comandos::cargar_archivos,
            comandos::cargar_pista,
            comandos::datos_pestana,
            comandos::alternar_vuelta,
            comandos::fijar_referencia,
            comandos::fijar_b,
            comandos::limpiar_sesion,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar AC Telemetry Lab");
}
