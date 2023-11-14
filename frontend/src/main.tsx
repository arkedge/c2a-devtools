import React from "react";
import ReactDOMClient from "react-dom/client";
import "./index.css";
import {
  LoaderFunction,
  RouterProvider,
  createBrowserRouter,
  redirect,
  useRouteError,
} from "react-router-dom";
import { TelemetryView } from "./components/TelemetryView";
import { Layout } from "./components/Layout";
import { HelmetProvider } from "react-helmet-async";
import { Top } from "./components/Top";
import { Callout, FocusStyleManager, Intent } from "@blueprintjs/core";
import { CommandView } from "./components/CommandView";
import { buildClient } from "./client";
import type { GrpcClientService } from "./worker";
import { IconNames } from "@blueprintjs/icons";
import { FriendlyError } from "./error";

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
  const { satelliteSchema } = await client.getSatelliteSchema().catch((err) => {
    throw new FriendlyError(`Failed to get satellite schema`, {
      cause: err,
      details: "Make sure that your tmtc-c2a is running.",
    });
  })!;
  return { client, satelliteSchema };
};

const DEFAULT_TMTC_PORT = 8900;

const ErrorBoundary = () => {
  const error = useRouteError();
  console.error(error);
  let title = "Error";
  let description = `${error}`;
  if (error instanceof FriendlyError) {
    title = `${error.message}`;
    description = error.details ?? `${error.cause}`;
  }
  return (
    <div className="grid h-screen place-items-center">
      <div>
        <Callout intent={Intent.DANGER} title={title} icon={IconNames.ERROR}>
          {description}
        </Callout>
      </div>
    </div>
  );
};

const router = createBrowserRouter([
  {
    path: "/",
    loader: () => {
      if (import.meta.env.VITE_PREFER_SELF_PORT) {
        return redirect(`/${location.port || DEFAULT_TMTC_PORT}`);
      } else {
        return redirect(`/${DEFAULT_TMTC_PORT}`);
      }
    },
  },
  {
    path: ":baseUrl",
    element: <Layout />,
    loader: baseUrlLoader,
    errorElement: <ErrorBoundary />,
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
  </React.StrictMode>,
);
