import React from "react";
import ReactDOMClient from "react-dom/client";
import "./index.css";
import {
  LoaderFunction,
  RouterProvider,
  createBrowserRouter,
  redirect,
} from "react-router-dom";
import { TelemetryView } from "./components/TelemetryView";
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import { BrokerClient } from "./proto/broker.client";
import { TmtcGenericC2aClient } from "./proto/tmtc_generic_c2a.client";
import { Layout } from "./components/Layout";
import { HelmetProvider } from "react-helmet-async";
import { Top } from "./components/Top";
import { FocusStyleManager } from "@blueprintjs/core";
import { CommandView } from "./components/CommandView";
import { buildClient } from "./client";
import type { GrpcClientService } from "./worker";

FocusStyleManager.onlyShowFocusOnTabs();

const root = ReactDOMClient.createRoot(document.getElementById("root")!);

const baseUrlLoader: LoaderFunction = async ({ params }) => {
  const encodedBaseUrl = params["baseUrl"]!;
  const abbrBaseUrl = decodeURIComponent(encodedBaseUrl);
  let baseUrl;
  if (abbrBaseUrl.match(/^\d+$/)) {
    baseUrl = `http://localhost:${abbrBaseUrl}`;
  } else if (
    abbrBaseUrl.startsWith("http://") ||
    abbrBaseUrl.startsWith("https://")
  ) {
    baseUrl = abbrBaseUrl;
  } else {
    baseUrl = `http://${abbrBaseUrl}`;
  }
  const worker = new SharedWorker(new URL("./worker.ts", import.meta.url), {
    type: "module",
    /* @vite-ignore */
    name: baseUrl,
  });
  const client = buildClient<GrpcClientService>(worker);
  const { satelliteSchema } = await client.getSatelliteSchema()!;
  return { client, satelliteSchema };
};

const DEFAULT_TMTC_PORT = 8900;

const router = createBrowserRouter([
  {
    path: "/",
    loader: () => {
      return redirect(`/${DEFAULT_TMTC_PORT}`);
    },
  },
  {
    path: ":baseUrl",
    element: <Layout />,
    loader: baseUrlLoader,
    children: [
      {
        path: "",
        element: <Top />,
      },
      {
        path: "telemetries/:tmivName",
        element: <TelemetryView />,
      },
      {
        path: "command",
        element: <CommandView />,
      },
    ],
  },
]);

root.render(
  <React.StrictMode>
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>
  </React.StrictMode>
);
