import type { WorkerResponse, WorkerRpcService } from "./worker";

export const buildClient = <S extends WorkerRpcService>(
  worker: SharedWorker,
): S => {
  const methodFactory = (proc: keyof S) => {
    return (...args: any[]) => {
      const channel = new MessageChannel();
      const callback = channel.port2;
      worker.port.postMessage(
        {
          callback,
          proc,
          args,
        },
        [callback],
      );
      return new Promise((resolve, reject) => {
        const handleResponse = (
          e: MessageEvent<WorkerResponse<S>[keyof S]>,
        ) => {
          channel.port1.removeEventListener("message", handleResponse);
          const response = e.data;
          if ("value" in response) {
            resolve(response.value);
          } else if ("error" in response) {
            reject(response.error);
          }
        };
        channel.port1.addEventListener("message", handleResponse);
        channel.port1.start();
      });
    };
  };
  worker.port.start();

  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "symbol") {
          return void 0;
        }
        return methodFactory(prop);
      },
    },
  ) as S;
};
