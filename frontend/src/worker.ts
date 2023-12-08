import * as ComLink from "comlink"
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
    const stream = new ReadableStream({
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

    return ComLink.transfer(stream, [stream])
  },
};

self.addEventListener("connect", (e) => {
  for (const port of e.ports) {
    ComLink.expose(server, port)
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
