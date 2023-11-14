import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import {
  PostCommandRequest,
  PostCommandResponse,
  TelemetryStreamResponse,
} from "./proto/broker";
import { BrokerClient } from "./proto/broker.client";
import { TmtcGenericC2aClient } from "./proto/tmtc_generic_c2a.client";
import { GetSateliteSchemaResponse } from "./proto/tmtc_generic_c2a";
import { Tmiv } from "./proto/tco_tmiv";

export default null;
// eslint-disable-next-line no-var
declare var self: SharedWorkerGlobalScope;

export type GrpcClientService = {
  getSatelliteSchema(): Promise<GetSateliteSchemaResponse>;
  postCommand(input: PostCommandRequest): Promise<PostCommandResponse>;
  openTelemetryStream(tmivName: string): Promise<ReadableStream<Tmiv>>;
};

export type WorkerRpcService = {
  [proc: string]: (...args: any) => Promise<any>;
};

type Values<T> = T[keyof T];

export type WorkerRequest<S extends WorkerRpcService> = Values<{
  [Proc in keyof S]: {
    callback: MessagePort;
    proc: Proc;
    args: Parameters<S[Proc]>;
  };
}>;
export type WorkerResponse<S extends WorkerRpcService> = {
  [Proc in keyof S]:
    | {
        value: Awaited<ReturnType<S[Proc]>>;
      }
    | {
        error: string;
      };
};

const transport = new GrpcWebFetchTransport({
  baseUrl: self.name,
});
const brokerClient = new BrokerClient(transport);
const tmtcGenericC2a = new TmtcGenericC2aClient(transport);

const telemetryLastValues = new Map<string, Tmiv>();
const telemetryBus = new EventTarget();

const startTelemetryStream = async () => {
  const { responses } = brokerClient.openTelemetryStream({});
  for await (const { tmiv } of responses) {
    if (typeof tmiv === "undefined") {
      continue;
    }
    telemetryLastValues.set(tmiv.name, tmiv);
    telemetryBus.dispatchEvent(new CustomEvent(tmiv.name, { detail: tmiv }));
  }
};

const server = {
  async getSatelliteSchema(): Promise<GetSateliteSchemaResponse> {
    const { response } = await tmtcGenericC2a.getSatelliteSchema({});
    return response;
  },
  async postCommand(input: PostCommandRequest): Promise<PostCommandResponse> {
    const { response } = brokerClient.postCommand(input);
    return response;
  },
  async openTelemetryStream(tmivName: string): Promise<ReadableStream<Tmiv>> {
    let handler: any;
    return new ReadableStream({
      start(controller) {
        handler = (e: CustomEvent<Tmiv>) => {
          controller.enqueue(e.detail);
        };
        telemetryBus.addEventListener(tmivName, handler as any);
        const lastValue = telemetryLastValues.get(tmivName);
        if (typeof lastValue !== "undefined") {
          controller.enqueue(lastValue);
        }
      },
      cancel() {
        telemetryBus.removeEventListener(tmivName, handler as any);
      },
    });
  },
};

self.addEventListener("connect", (e) => {
  for (const port of e.ports) {
    port.addEventListener(
      "message",
      (e: MessageEvent<WorkerRequest<GrpcClientService>>) => {
        // eslint-disable-next-line prefer-spread
        const promise = (server[e.data.proc] as any).apply(
          server,
          e.data.args,
        ) as Promise<any>;
        const resolve = (value: any) => {
          if (value instanceof ReadableStream) {
            e.data.callback.postMessage(
              {
                value,
              },
              [value],
            );
          } else {
            e.data.callback.postMessage({
              value,
            });
          }
        };
        const reject = (error: any) => {
          e.data.callback.postMessage({
            error,
          });
        };
        promise.then(resolve, reject);
      },
    );
    port.start();
  }
});
(async () => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await startTelemetryStream();
    } catch (e) {
      console.error(e);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
})();
