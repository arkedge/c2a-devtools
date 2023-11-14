use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use axum::Router;
use clap::Parser;

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
pub struct Args {
    #[clap(long, env, default_value_t = Ipv4Addr::LOCALHOST.into())]
    addr: IpAddr,
    #[clap(long, env, default_value_t = 3000)]
    port: u16,
}

impl Args {
    fn socket_addr(&self) -> SocketAddr {
        SocketAddr::from((self.addr, self.port))
    }
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    let app = Router::new().fallback(c2a_devtools::serve);

    let socket_addr = args.socket_addr();
    println!("listening on http://{}", socket_addr);
    axum::Server::bind(&socket_addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
