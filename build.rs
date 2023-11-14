use std::process::Command;

fn main() {
    if std::env::var("SKIP_FRONTEND_BUILD").is_err() {
        let status = Command::new("yarn")
            .current_dir("frontend")
            .status()
            .expect("failed to build frontend");
        assert!(status.success());
        let status = Command::new("yarn")
            .current_dir("frontend")
            .arg("build")
            .status()
            .expect("failed to build frontend");
        assert!(status.success());
    }
}
