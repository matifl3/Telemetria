//! Parser del `.acreplay` versión 16.
//!
//! Lee **todos** los autos del archivo (D-03): recorre cada encabezado y sus
//! frames, decodifica los canales usados y descarta el frame crudo. Los offsets
//! salen de `doc/FormatoTelemetria.md` §2.

use crate::error::{ErrorFormato, Motivo, Resultado};
use crate::lector::{medio_a_f32, Lector};
use crate::modelo::{Auto, MetaReplay, MuestrasAuto, Replay};

/// Única versión soportada.
pub const VERSION_SOPORTADA: u32 = 16;

/// Tamaño fijo de un frame de auto.
pub const BYTES_FRAME: usize = 256;

/// Firma del pie opcional de CSP. Se descarta sin interpretar (D-17).
pub const MAGIC_CSP: &[u8] = b"__AC_SHADERS_PATCH_v1__";

/// Parsea un replay completo desde bytes. `archivo` solo se usa en los mensajes.
pub fn parsear_replay(bytes: &[u8], archivo: &str) -> Resultado<Replay> {
    let mut lector = Lector::nuevo(bytes, archivo);

    let (meta, num_autos) = leer_encabezado(&mut lector)?;
    saltar_objetos_de_pista(&mut lector, &meta)?;

    let mut autos = Vec::with_capacity((num_autos as usize).min(8));
    for indice in 0..num_autos as usize {
        autos.push(leer_auto(&mut lector, indice)?);
    }

    // El pie CSP no aporta datos usados por la app: se detecta y se ignora.
    descartar_pie_csp(&mut lector)?;

    let auto_referencia = if (meta.indice_jugador as usize) < autos.len() {
        Some(meta.indice_jugador as usize)
    } else {
        None
    };

    Ok(Replay {
        meta,
        autos,
        auto_referencia,
    })
}

/// Lee el encabezado global y devuelve los metadatos y `num_cars`.
fn leer_encabezado(lector: &mut Lector<'_>) -> Resultado<(MetaReplay, u32)> {
    let version = lector.u32()?;
    if version != VERSION_SOPORTADA {
        return Err(ErrorFormato::en_offset(
            lector.archivo(),
            Motivo::VersionNoSoportada { version },
            0,
        ));
    }

    let meta = MetaReplay {
        version,
        intervalo_ms: lector.f64()?,
        clima: lector.cadena()?,
        pista: lector.cadena()?,
        config_pista: lector.cadena()?,
        indice_jugador: 0,
        frames_globales: 0,
        objetos_pista: 0,
    };

    let num_autos = lector.u32()?;
    let indice_jugador = lector.u32()?;
    let frames_globales = lector.u32()?;
    let objetos_pista = lector.u32()?;

    Ok((
        MetaReplay {
            indice_jugador,
            frames_globales,
            objetos_pista,
            ..meta
        },
        num_autos,
    ))
}

/// Salta `(4 + 12 × objetos) × frames_globales` bytes de frames de pista.
fn saltar_objetos_de_pista(lector: &mut Lector<'_>, meta: &MetaReplay) -> Resultado<()> {
    let objetos = meta.objetos_pista as usize;
    let por_frame = objetos
        .checked_mul(12)
        .and_then(|bytes_objetos| bytes_objetos.checked_add(4))
        .ok_or_else(|| {
            ErrorFormato::en_offset(
                lector.archivo(),
                Motivo::ArchivoCorrupto {
                    detalle: "desbordamiento al calcular los frames de objetos de pista"
                        .to_string(),
                },
                lector.pos(),
            )
        })?;
    lector.saltar_producto(meta.frames_globales as usize, por_frame)
}

/// Lee un auto: encabezado, relleno, frames y bloque final `extra`.
fn leer_auto(lector: &mut Lector<'_>, indice: usize) -> Resultado<Auto> {
    let car_id = lector.cadena()?;
    let piloto = lector.cadena()?;
    let nacion = lector.cadena()?;
    let equipo = lector.cadena()?;
    let skin = lector.cadena()?;
    let frames = lector.u32()?;
    let wings = lector.u32()?;

    // Relleno fijo de 20 bytes antes del primer frame.
    lector.saltar(20)?;

    // Nunca reservar por un `num_frames` no confiable: cada frame necesita al
    // menos 256 bytes, así que la reserva queda acotada por el tamaño real.
    let capacidad = (frames as usize).min(lector.restante() / BYTES_FRAME);
    let mut muestras = MuestrasAuto::con_capacidad(capacidad);
    for i in 0..frames {
        leer_frame(lector, &mut muestras)?;
        if i + 1 < frames {
            // Entre frames: 20 bytes de relleno + num_wings × 4.
            lector.saltar(20)?;
            lector.saltar_producto(wings as usize, 4)?;
        }
    }

    // Tras el último frame: wings × 4, luego extra_count × 8.
    lector.saltar_producto(wings as usize, 4)?;
    let extra_count = lector.u32()?;
    lector.saltar_producto(extra_count as usize, 8)?;

    Ok(Auto {
        indice,
        car_id,
        piloto,
        nacion,
        equipo,
        skin,
        frames,
        wings,
        muestras,
    })
}

/// Decodifica un frame de 256 bytes y agrega sus canales.
fn leer_frame(lector: &mut Lector<'_>, muestras: &mut MuestrasAuto) -> Resultado<()> {
    let frame = lector.tomar(BYTES_FRAME)?;

    let x = f32_en(frame, 0);
    let y = f32_en(frame, 4);
    let z = f32_en(frame, 8);
    let yaw = f16_en(frame, 12);
    let pitch = f16_en(frame, 14);
    let roll = f16_en(frame, 16);

    let vel_x = f16_en(frame, 164);
    let vel_y = f16_en(frame, 166);
    let vel_z = f16_en(frame, 168);
    let speed_kmh = (vel_x * vel_x + vel_y * vel_y + vel_z * vel_z).sqrt() * 3.6;

    muestras.x.push(x);
    muestras.y.push(y);
    muestras.z.push(z);
    muestras.yaw.push(yaw);
    muestras.pitch.push(pitch);
    muestras.roll.push(roll);
    muestras.vel_x.push(vel_x);
    muestras.vel_y.push(vel_y);
    muestras.vel_z.push(vel_z);
    muestras.speed_kmh.push(speed_kmh);
    muestras.rpm.push(f16_en(frame, 170));
    muestras.volante.push(f16_en(frame, 212));
    muestras.gas.push(frame[244]);
    muestras.freno.push(frame[245]);
    muestras.marcha.push(frame[234]);
    muestras.vuelta.push(frame[246]);
    muestras.tiempo_vuelta_ms.push(u32_en(frame, 220));
    muestras.ultima_vuelta_ms.push(u32_en(frame, 224));
    muestras.mejor_vuelta_ms.push(u32_en(frame, 228));
    muestras.gasolina.push(frame[232]);
    muestras.gasolina_por_vuelta.push(frame[233]);
    muestras.estado.push(u16_en(frame, 248));
    muestras.boost.push(frame[254]);

    for rueda in 0..4 {
        let base = rueda * 2;
        muestras.carga[rueda].push(f16_en(frame, 204 + base));
        muestras.slip_ratio[rueda].push(f16_en(frame, 188 + base));
        muestras.slip_angle[rueda].push(f16_en(frame, 180 + base));
    }

    Ok(())
}

/// Si el buffer termina con la firma CSP, salta la firma y sus 8 bytes.
///
/// No valida ni descomprime los *chunks*: la app no usa `clutch`, `handbrake`
/// ni `wipers` (D-17). Cualquier byte extra desconocido se ignora.
fn descartar_pie_csp(lector: &mut Lector<'_>) -> Resultado<()> {
    let resto = lector.resto();
    if resto.starts_with(MAGIC_CSP) && resto.len() >= MAGIC_CSP.len() + 8 {
        lector.saltar(MAGIC_CSP.len() + 8)?;
    }
    Ok(())
}

fn f32_en(bytes: &[u8], offset: usize) -> f32 {
    f32::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ])
}

fn u32_en(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ])
}

fn u16_en(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
}

fn f16_en(bytes: &[u8], offset: usize) -> f32 {
    medio_a_f32(u16_en(bytes, offset))
}
