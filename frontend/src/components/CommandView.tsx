import React, { useCallback, useRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  CommandComponentSchema,
  CommandParameterDataType,
  CommandPrefixSchema,
} from "../proto/tmtc_generic_c2a";
import { Tco, TcoParam } from "../proto/tco_tmiv";
import { useClient } from "./Layout";

type ParameterValue =
  | { type: "bytes"; bytes: Uint8Array; bigint: bigint }
  | { type: "double"; double: number }
  | { type: "integer"; integer: number };

type CommandLine = {
  command: {
    prefix: string;
    component: string;
    command: string;
  };
  parameters: ParameterValue[];
};

const parseCommandLine = (source: string): CommandLine => {
  const trimmed = source.trim();
  const hasStopMarker = trimmed.startsWith(".");
  const body = hasStopMarker ? trimmed.substring(1) : trimmed;

  const [commandFullName, ...params] = body.trim().split(/\s+/);
  const parseCommandFullName = (fullname: string) => {
    const parts = fullname.split(".");
    if (parts.length !== 3) {
      throw new Error(`invalid command full name: ${fullname}`);
    }
    const [prefix, component, command] = parts;
    return {
      prefix,
      component,
      command,
    };
  };

  const parseParameter = (source: string): ParameterValue => {
    const parseHexBytes = (source: string): Uint8Array => {
      if (!/^[0-9a-fA-F]+$/.test(source)) {
        throw new Error("invalid hex bytes syntax");
      }
      if (source.length % 2 !== 0) {
        source = `0${source}`;
      }
      const bytes = new Uint8Array(source.length / 2);
      for (let i = 0; i < source.length; i += 2) {
        const byte = parseInt(source.substring(i, i + 2), 16);
        bytes[i / 2] = byte;
      }
      return bytes;
    };
    if (source.startsWith("0x")) {
      const bytes = parseHexBytes(source.substring(2));
      const bigint = BigInt(source);
      return { type: "bytes", bytes, bigint };
    }
    // FIXME: Support BigInt
    const integer = parseInt(source, 10);
    const double = parseFloat(source);
    if (integer !== double) {
      return {
        type: "double",
        double,
      };
    }
    return {
      type: "integer",
      integer,
    };
  };
  const command = parseCommandFullName(commandFullName);
  const parameters = params.map(parseParameter);
  return {
    command,
    parameters,
  };
};

const buildTco = (
  commandPrefixes: { [key: string]: CommandPrefixSchema },
  commandComponents: { [key: string]: CommandComponentSchema },
  commandLine: CommandLine,
): Tco => {
  if (!Object.hasOwn(commandPrefixes, commandLine.command.prefix)) {
    throw new Error(`no such command prefix: ${commandLine.command.prefix}`);
  }
  const commandPrefix = commandPrefixes[commandLine.command.prefix];
  if (!Object.hasOwn(commandPrefix.subsystems, commandLine.command.component)) {
    throw new Error(
      `prefix is not defined for component: ${commandLine.command.component}`,
    );
  }
  const commandSubsystem =
    commandPrefix.subsystems[commandLine.command.component];
  if (!Object.hasOwn(commandComponents, commandLine.command.component)) {
    throw new Error(`no such component: ${commandLine.command.component}`);
  }
  const componentSchema = commandComponents[commandLine.command.component];
  if (!Object.hasOwn(componentSchema.commands, commandLine.command.command)) {
    throw new Error(
      `no such command in ${commandLine.command.component}: ${commandLine.command.command}`,
    );
  }
  const commandSchema = componentSchema.commands[commandLine.command.command];
  const extraParams = commandSubsystem.hasTimeIndicator ? 1 : 0;
  if (
    commandLine.parameters.length !==
    commandSchema.parameters.length + extraParams
  ) {
    throw new Error(
      `the number of parameters is wrong: expected ${commandSchema.parameters.length}, but got ${commandLine.parameters.length}`,
    );
  }
  const tcoParams: TcoParam[] = [];
  if (commandSubsystem.hasTimeIndicator) {
    const parameter = commandLine.parameters.pop()!;
    switch (parameter.type) {
      case "integer":
        tcoParams.push({
          name: "time_indicator",
          value: {
            oneofKind: "integer",
            integer: BigInt(parameter.integer),
          },
        });
        break;
      case "bytes":
        tcoParams.push({
          name: "time_indicator",
          value: {
            oneofKind: "integer",
            integer: parameter.bigint,
          },
        });
        break;
      default:
        throw new Error(`time indicator must be an integer`);
    }
  }
  for (let i = 0; i < commandSchema.parameters.length; i++) {
    const parameterSchema = commandSchema.parameters[i];
    const parameter = commandLine.parameters[i];
    const name = `param${i + 1}`;
    switch (parameterSchema.dataType) {
      case CommandParameterDataType.CMD_PARAMETER_BYTES:
        switch (parameter.type) {
          case "bytes":
            tcoParams.push({
              name,
              value: {
                oneofKind: "bytes",
                bytes: parameter.bytes,
              },
            });
            break;
          default:
            throw new Error(`value of ${name} must be bytes`);
        }
        break;
      case CommandParameterDataType.CMD_PARAMETER_INTEGER:
        switch (parameter.type) {
          case "integer":
            tcoParams.push({
              name,
              value: {
                oneofKind: "integer",
                integer: BigInt(parameter.integer),
              },
            });
            break;
          case "bytes":
            tcoParams.push({
              name,
              value: {
                oneofKind: "integer",
                integer: parameter.bigint,
              },
            });
            break;
          default:
            throw new Error(`value of ${name} must be an integer`);
        }
        break;
      case CommandParameterDataType.CMD_PARAMETER_DOUBLE:
        switch (parameter.type) {
          case "double":
            tcoParams.push({
              name,
              value: {
                oneofKind: "double",
                double: parameter.double,
              },
            });
            break;
          case "integer":
            tcoParams.push({
              name,
              value: {
                oneofKind: "double",
                double: parameter.integer,
              },
            });
            break;
          case "bytes":
            tcoParams.push({
              name,
              value: {
                oneofKind: "double",
                // FIXME: check overflow
                double: Number(parameter.bigint),
              },
            });
            break;
        }
        break;
    }
  }
  const name = `${commandLine.command.prefix}.${commandLine.command.component}.${commandLine.command.command}`;
  return {
    name,
    params: tcoParams,
  };
};

export const CommandView: React.FC = () => {
  const {
    client,
    satelliteSchema: { commandPrefixes, commandComponents },
  } = useClient();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const validate = useCallback(
    (monaco: Monaco, model: monaco.editor.ITextModel) => {
      const markers: monaco.editor.IMarkerData[] = [];
      for (let lineno = 1; lineno <= model.getLineCount(); lineno++) {
        const line = model.getLineContent(lineno);
        if (line.trim().length === 0) {
          // skip empty line
          continue;
        }
        try {
          const commandLine = parseCommandLine(line);
          buildTco(commandPrefixes, commandComponents, commandLine);
        } catch (e) {
          const lineLength = model.getLineLength(lineno);
          markers.push({
            message: `${e}`,
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: lineno,
            startColumn: 1,
            endLineNumber: lineno,
            endColumn: lineLength + 1,
          });
        }
      }
      monaco.editor.setModelMarkers(model, "owner", markers);
      return markers;
    },
    [commandComponents, commandPrefixes],
  );

  const handleEditorDidMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
      editorRef.current = editor;

      const defaultValue = localStorage.getItem("c2a-devtools-ops-v1");
      if (defaultValue !== null) {
        editor.setValue(defaultValue);
      }

      editor.addCommand(monaco.KeyCode.Escape, () => {
        const ids =
          editor
            .getModel()
            ?.getAllDecorations()
            .map((d) => d.id) ?? [];
        editor.removeDecorations(ids);
        validate(monacoInstance, editor.getModel()!);
      });
      editor.addCommand(
        monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        async () => {
          const model = editor.getModel();
          if (model === null) {
            return;
          }
          localStorage.setItem("c2a-devtools-ops-v1", editor.getValue());

          const position = editor.getPosition();
          if (position === null) {
            return;
          }
          const lineno = position.lineNumber;
          const line = model.getLineContent(lineno);

          if (line.trim().length > 0) {
            const range = new monaco.Range(lineno, 1, lineno, 1);

            const decoration = editor.createDecorationsCollection([
              {
                range,
                options: {
                  linesDecorationsClassName: "ml-1 border-l-4 border-slate-600",
                  stickiness:
                    monaco.editor.TrackedRangeStickiness
                      .NeverGrowsWhenTypingAtEdges,
                },
              },
            ]);

            try {
              const commandLine = parseCommandLine(line);
              const tco = buildTco(
                commandPrefixes,
                commandComponents,
                commandLine,
              );
              await client.postCommand({
                tco,
              });
            } catch (e) {
              decoration.clear();
              editor.createDecorationsCollection([
                {
                  range,
                  options: {
                    linesDecorationsClassName: "ml-1 border-l-4 border-red-600",
                    stickiness:
                      monaco.editor.TrackedRangeStickiness
                        .NeverGrowsWhenTypingAtEdges,
                  },
                },
              ]);
              monacoInstance.editor.setModelMarkers(model, "owner", [
                {
                  message: `${e}`,
                  severity: monaco.MarkerSeverity.Error,
                  startLineNumber: lineno,
                  startColumn: 1,
                  endLineNumber: lineno,
                  endColumn: model.getLineLength(lineno) + 1,
                },
              ]);
              return;
            }

            decoration.clear();
            editor.createDecorationsCollection([
              {
                range,
                options: {
                  linesDecorationsClassName: "ml-1 border-l-4 border-sky-600",
                  stickiness:
                    monaco.editor.TrackedRangeStickiness
                      .NeverGrowsWhenTypingAtEdges,
                },
              },
            ]);
          }
          const nextPosition = new monaco.Position(lineno + 1, 1);
          editor.setPosition(nextPosition);
          editor.revealLine(lineno + 1);
        },
      );
      const model = editor.getModel()!;
      model.onDidChangeContent(() => {
        validate(monacoInstance, editor.getModel()!);
      });
    },
    [client, commandComponents, commandPrefixes, validate],
  );

  return (
    <Editor
      height="100%"
      options={{ fontSize: 16, renderValidationDecorations: "on" }}
      theme="vs-dark"
      onMount={handleEditorDidMount}
    />
  );
};
