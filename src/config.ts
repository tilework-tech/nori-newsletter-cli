import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface NewsletterConfig {
  contactListName: string;
  topicName: string;
  fromAddress: string;
  replyTo: string;
  // Optional. When set, sends attach this SES configuration set, which is what
  // enables open/click tracking and event publishing. Not required: configs
  // written before tracking existed must keep working.
  configurationSetName?: string;
}

const CONFIG_FILENAME = "newsletter.config.json";

const REQUIRED_FIELDS: (keyof NewsletterConfig)[] = [
  "contactListName",
  "topicName",
  "fromAddress",
  "replyTo",
];

export function loadConfig(dir?: string): NewsletterConfig {
  const configPath = join(dir ?? process.cwd(), CONFIG_FILENAME);

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    throw new Error(
      `Could not read ${CONFIG_FILENAME} at '${configPath}'. ` +
        "Create a newsletter.config.json with contactListName, topicName, fromAddress, and replyTo."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${CONFIG_FILENAME} contains invalid JSON.`);
  }

  const config = parsed as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter(
    (f) => typeof config[f] !== "string" || config[f] === ""
  );
  if (missing.length > 0) {
    throw new Error(
      `${CONFIG_FILENAME} is missing required fields: ${missing.join(", ")}`
    );
  }

  return {
    contactListName: config.contactListName as string,
    topicName: config.topicName as string,
    fromAddress: config.fromAddress as string,
    replyTo: config.replyTo as string,
    ...(typeof config.configurationSetName === "string" &&
      config.configurationSetName !== "" && {
        configurationSetName: config.configurationSetName,
      }),
  };
}
