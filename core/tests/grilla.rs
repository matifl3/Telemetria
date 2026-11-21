use acreplay_core::grilla::{
    grilla_de_pista, remuestrear_lineal, remuestrear_vecino, Grilla, GRID_PASO_MIN, GRID_PUNTOS_MAX,
};

/// Grilla de `longitud` metros con paso forzado, para tests de remuestreo.
fn grilla_con_paso(longitud: f64, paso: f64) -> Grilla {
    let cantidad = (longitud / paso).round() as usize;
    let mut s: Vec<f64> = (0..=cantidad).map(|i| i as f64 * paso).collect();
    let ultimo = s.len() - 1;
    s[ultimo] = longitud;
    Grilla {
        s,
        paso_m: paso,
        longitud_m: longitud,
    }
}

#[test]
fn t49_grilla_respeta_topes_y_cubre_la_pista() {
    let grilla = grilla_de_pista(5000.0);
    assert_eq!(grilla.s[0], 0.0);
    assert!(
        (grilla.s[grilla.puntos() - 1] - 5000.0).abs() < 1e-9,
        "termina en {}",
        grilla.s[grilla.puntos() - 1]
    );
    assert!(grilla.puntos() <= GRID_PUNTOS_MAX);
    assert!(grilla.paso_m >= GRID_PASO_MIN);
    for ventana in grilla.s[..grilla.puntos() - 1].windows(2) {
        assert!(
            (ventana[1] - ventana[0] - grilla.paso_m).abs() < 1e-9,
            "{ventana:?} vs paso {}",
            grilla.paso_m
        );
    }

    // Pista corta: manda el paso mínimo.
    let corta = grilla_de_pista(5.0);
    assert!((corta.paso_m - GRID_PASO_MIN).abs() < 1e-12);
    assert_eq!(corta.puntos(), 51);
    assert_eq!(corta.s[0], 0.0);
    assert!((corta.s[50] - 5.0).abs() < 1e-9);

    // Pista enorme: manda el tope de puntos y el paso crece.
    let enorme = grilla_de_pista(100_000.0);
    assert!(enorme.puntos() <= GRID_PUNTOS_MAX);
    assert!(enorme.paso_m > GRID_PASO_MIN);
    assert!((enorme.s[enorme.puntos() - 1] - 100_000.0).abs() < 1e-9);
}

#[test]
fn t50_serie_lineal_se_reproduce_con_error_menor_a_1e6() {
    let s: Vec<f64> = (0..=10).map(|i| i as f64).collect();
    let tiempo: Vec<f64> = s.iter().map(|x| 0.5 * x + 3.0).collect();
    let velocidad: Vec<f32> = s.iter().map(|x| (20.0 + 3.0 * x) as f32).collect();

    let grilla = grilla_de_pista(10.0);
    let alineado_t = remuestrear_lineal(&s, &tiempo, &grilla);
    let alineado_v = remuestrear_lineal(&s, &velocidad, &grilla);
    assert_eq!(alineado_t.len(), grilla.puntos());
    assert_eq!(alineado_v.len(), grilla.puntos());

    for (g, valor) in grilla.s.iter().zip(&alineado_t) {
        let valor = valor.expect("la serie cubre toda la pista");
        assert!(
            (valor - (0.5 * g + 3.0)).abs() < 1e-6,
            "s={g} valor={valor}"
        );
    }
    for (g, valor) in grilla.s.iter().zip(&alineado_v) {
        let valor = valor.expect("la serie cubre toda la pista") as f64;
        assert!(
            (valor - (20.0 + 3.0 * g)).abs() < 1e-4,
            "s={g} valor={valor}"
        );
    }
}

#[test]
fn t51_marcha_se_remuestrea_por_vecino_y_conserva_escalones() {
    let s = vec![0.0, 0.24, 0.5, 0.76, 1.0];
    let marcha: Vec<u8> = vec![1, 1, 2, 2, 3];
    let grilla = grilla_con_paso(1.0, 0.1);

    let alineado = remuestrear_vecino(&s, &marcha, &grilla);
    let esperado = vec![1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3];
    assert_eq!(alineado, esperado.iter().copied().map(Some).collect::<Vec<_>>());

    // Solo aparecen marchas presentes en la serie: no se interpola 1.5.
    for valor in alineado.iter().flatten() {
        assert!(marcha.contains(valor), "{valor} no está en la serie");
    }

    // Empate exacto: gana la muestra posterior (v1).
    let empate = remuestrear_vecino(
        &[0.0, 1.0],
        &[1u8, 2u8],
        &Grilla {
            s: vec![0.5],
            paso_m: 0.5,
            longitud_m: 1.0,
        },
    );
    assert_eq!(empate, vec![Some(2)]);
}

#[test]
fn t52_fuera_de_rango_y_en_huecos_el_valor_es_none() {
    let s = vec![f64::NAN, 0.0, 1.0, f64::NAN, f64::NAN, 4.0, 5.0, f64::NAN];
    let valores: Vec<f32> = (0..8).map(|i| i as f32).collect();
    let grilla = grilla_con_paso(5.0, 0.1);

    let alineado = remuestrear_lineal(&s, &valores, &grilla);
    assert_eq!(alineado[0], Some(1.0));
    assert_eq!(alineado[5], Some(1.5));
    assert_eq!(alineado[10], Some(2.0));
    for (indice, valor) in alineado.iter().enumerate().take(40).skip(11) {
        assert!(valor.is_none(), "índice {indice} interpoló un hueco: {valor:?}");
    }
    assert_eq!(alineado[40], Some(5.0));
    assert_eq!(alineado[45], Some(5.5));
    assert_eq!(alineado[50], Some(6.0));

    // La vuelta cubre solo [1, 2]: los extremos de la grilla son huecos, no el
    // primer/último valor repetido.
    let corta = remuestrear_lineal(
        &[1.0, 2.0],
        &[10.0f32, 20.0],
        &grilla_con_paso(5.0, 0.1),
    );
    assert_eq!(corta[0], None);
    assert_eq!(corta[10], Some(10.0));
    assert_eq!(corta[20], Some(20.0));
    assert_eq!(corta[corta.len() - 1], None);

    // El remuestreo por vecino respeta los mismos huecos.
    let marcha: Vec<u8> = (0..8).map(|i| i as u8).collect();
    let alineado_marcha = remuestrear_vecino(&s, &marcha, &grilla);
    assert_eq!(alineado_marcha[0], Some(1));
    assert!(alineado_marcha[20].is_none());
    assert_eq!(alineado_marcha[40], Some(5));
}

#[test]
fn t53_la_grilla_no_depende_de_la_seleccion() {
    let grilla = grilla_de_pista(1000.0);
    let s_a: Vec<f64> = (0..=1000).map(|i| i as f64).collect();
    let s_b: Vec<f64> = (0..=400).map(|i| i as f64).collect();
    let v_a: Vec<f32> = s_a.iter().map(|x| *x as f32).collect();
    let v_b: Vec<f32> = s_b.iter().map(|x| *x as f32).collect();

    // Selección con las dos vueltas.
    let a_con_b = remuestrear_lineal(&s_a, &v_a, &grilla);
    let b_con_a = remuestrear_lineal(&s_b, &v_b, &grilla);

    // Se oculta B.
    let a_sin_b = remuestrear_lineal(&s_a, &v_a, &grilla);
    assert_eq!(a_con_b, a_sin_b);
    assert_eq!(b_con_a.len(), grilla.puntos());

    // El eje sigue siendo el de la pista, no el que alcanza la vuelta más larga
    // visible: B solo llega a 400 m.
    assert_eq!(grilla, grilla_de_pista(1000.0));
    assert!((grilla.s[grilla.puntos() - 1] - 1000.0).abs() < 1e-9);
    let sin_cobertura = b_con_a.iter().filter(|valor| valor.is_none()).count();
    assert!(sin_cobertura > 0, "B no debería cubrir toda la pista");
}
