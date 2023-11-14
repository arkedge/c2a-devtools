use std::process::Command;

fn main() {
    if std::env::var("SKIP_FRONTEND_BUILD").is_err() {
        let mut env_vars: Vec<(&str, &str)> = vec![];
        #[cfg(feature = "prefer_self_port")]
        {
            env_vars.push(("VITE_PREFER_SELF_PORT", "1"));
        }
        let status = Command::new("yarn")
            .current_dir("frontend")
            .status()
            .expect("failed to build frontend");
        assert!(status.success());
        let status = Command::new("yarn")
            .current_dir("frontend")
            .arg("build")
            .envs(env_vars)
            .status()
            .expect("failed to build frontend");
        assert!(status.success());
    }
}
