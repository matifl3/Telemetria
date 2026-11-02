fn main() {
    tauri_build::build();

    #[cfg(windows)]
    {
        let out = std::env::var("OUT_DIR").expect("OUT_DIR");
        let recurso = std::path::Path::new(&out).join("libresource.a");
        if recurso.exists() {
            println!("cargo:rustc-link-arg-tests={}", recurso.display());
        }
    }
}
