import { Classes, Icon } from "@blueprintjs/core";
import React, { useMemo } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLoaderData,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { BrokerClient } from "../proto/broker.client";
import { SatelliteSchema } from "../proto/tmtc_generic_c2a";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { IconNames } from "@blueprintjs/icons";
import type { GrpcClientService } from "../worker";

type TelemetryMenuItem = {
  name: string;
  telemetryId: number;
};

const formatU8Hex = (u8: number) => {
  return "0x" + `0${u8.toString(16)}`.slice(-2);
};

type TelemetryListSidebarProps = {
  baseUrl: string;
  activeName: string | undefined;
  telemetryListItems: TelemetryMenuItem[];
};
const TelemetryListSidebar: React.FC<TelemetryListSidebarProps> = ({
  baseUrl,
  activeName: tmivName,
  telemetryListItems,
}) => {
  return (
    <div className="p-1 h-full flex-1 flex flex-col">
      <ul>
        <li>
          <NavLink
            to={`/${baseUrl}/command`}
            className={({ isActive }) =>
              `${Classes.MENU_ITEM} ${isActive ? Classes.ACTIVE : ""}`
            }
          >
            <span
              className={`${Classes.FILL} ${Classes.TEXT_OVERFLOW_ELLIPSIS}`}
            >
              Command
            </span>
            <span className={Classes.MENU_ITEM_LABEL}>
              <Icon icon={IconNames.EDIT} />
            </span>
          </NavLink>
        </li>
        <li className={Classes.MENU_HEADER}>
          <h6 className={Classes.HEADING}>Telemetry</h6>
        </li>
      </ul>
      <ul className="flex-1 overflow-y-auto">
        {telemetryListItems.map((item) => {
          return (
            <li key={item.name}>
              <Link
                to={`/${baseUrl}/telemetries/${item.name}`}
                className={`${Classes.MENU_ITEM} ${
                  tmivName === item.name ? Classes.ACTIVE : ""
                }`}
              >
                <code
                  className={`${Classes.FILL} ${Classes.TEXT_OVERFLOW_ELLIPSIS}`}
                >
                  {item.name}
                </code>
                <span className={Classes.MENU_ITEM_LABEL}>
                  <code>{formatU8Hex(item.telemetryId)}</code>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const Layout = () => {
  const ctx = useLoaderData() as ClientContext;
  const params = useParams();
  const baseUrl = params["baseUrl"]!;
  const tmivName = params["tmivName"];

  const telemetryListItems = useMemo(() => {
    const items: TelemetryMenuItem[] = [];
    const channelNames = Object.keys(ctx.satelliteSchema.telemetryChannels);
    for (const [componentName, componentSchema] of Object.entries(
      ctx.satelliteSchema.telemetryComponents,
    )) {
      for (const [telemetryName, telemetrySchema] of Object.entries(
        componentSchema.telemetries,
      )) {
        for (const channelName of channelNames) {
          const name = `${channelName}.${componentName}.${telemetryName}`;
          const telemetryId = telemetrySchema.metadata!.id;
          items.push({ name, telemetryId });
        }
      }
    }
    items.sort((a, b) => {
      // ad-hoc optimization
      const rtA = a.name.startsWith("RT.");
      const rtB = b.name.startsWith("RT.");
      if (rtA && !rtB) {
        return -1;
      } else if (!rtA && rtB) {
        return 1;
      }

      if (a.name > b.name) {
        return 1;
      } else if (a.name < b.name) {
        return -1;
      } else {
        return 0;
      }
    });
    return items;
  }, [
    ctx.satelliteSchema.telemetryChannels,
    ctx.satelliteSchema.telemetryComponents,
  ]);

  return (
    <div>
      <div className="h-screen flex flex-row text-slate-100">
        <PanelGroup direction="horizontal" autoSaveId="c2a-devtools">
          <Panel
            className="bg-slate-900 text-slate-200 flex flex-col shrink-0 grow-0 h-full"
            minSize={2}
            defaultSize={20}
            collapsible
          >
            <TelemetryListSidebar
              baseUrl={baseUrl}
              activeName={tmivName}
              telemetryListItems={telemetryListItems}
            />
          </Panel>
          <PanelResizeHandle className="w-2 data-[resize-handle-active=pointer]:bg-slate-600 hover:bg-slate-600" />
          <Panel>
            <Outlet context={ctx} />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};

export type ClientContext = {
  client: GrpcClientService;
  satelliteSchema: SatelliteSchema;
};

export function useClient() {
  return useOutletContext<ClientContext>();
}
