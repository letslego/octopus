import type { UIAdapterModule } from "../types";
import { parseAdkStdoutLine, buildAdkLocalConfig } from "@paperclipai/adapter-adk-local/ui";
import { SchemaConfigFields } from "../schema-config-fields";

export const adkLocalUIAdapter: UIAdapterModule = {
  type: "adk_local",
  label: "Google ADK",
  parseStdoutLine: parseAdkStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildAdkLocalConfig,
};
