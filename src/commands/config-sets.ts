import { Command } from "commander";
import type { SesService } from "../services/ses.js";
import type { Output } from "../output.js";
import type { NewsletterConfig } from "../config.js";

const VALID_EVENT_TYPES = [
  "SEND",
  "REJECT",
  "BOUNCE",
  "COMPLAINT",
  "DELIVERY",
  "OPEN",
  "CLICK",
  "RENDERING_FAILURE",
  "DELIVERY_DELAY",
  "SUBSCRIPTION",
];

export function createConfigSetsCommand(
  ses: SesService,
  out: Output,
  getConfig: () => NewsletterConfig
): Command {
  const cmd = new Command("config-sets");

  cmd.description(
    "Manage SES configuration sets and event destinations. " +
      "Configuration sets let you control delivery options, track reputation, " +
      "and route email events (bounces, complaints, opens, clicks) to SNS, " +
      "EventBridge, CloudWatch, or Kinesis Firehose."
  );

  cmd
    .command("list")
    .description("List all configuration sets in the SES account.")
    .action(async () => {
      const sets = await ses.listConfigSets();
      const label =
        sets.length === 1 ? "configuration set" : "configuration sets";
      out.write(`${sets.length} ${label}:\n`);
      for (const s of sets) {
        out.write(`  ${s.name}\n`);
      }
    });

  cmd
    .command("create")
    .description(
      "Create a configuration set with optional delivery, reputation, " +
        "suppression, tracking, and VDM settings."
    )
    .argument("<name>", "Configuration set name (max 64 chars, alphanumeric/hyphens/underscores)")
    .option("--tls <policy>", "TLS policy: REQUIRE or OPTIONAL")
    .option("--sending-pool <name>", "Dedicated IP pool name")
    .option("--reputation-metrics", "Enable reputation metrics")
    .option("--no-sending", "Disable sending for this config set")
    .option(
      "--suppression-reasons <reasons>",
      "Comma-separated suppression reasons: BOUNCE,COMPLAINT"
    )
    .option("--tracking-domain <domain>", "Custom redirect domain for tracking")
    .option(
      "--tracking-https <policy>",
      "HTTPS policy for tracking: REQUIRE, REQUIRE_OPEN_ONLY, or OPTIONAL"
    )
    .option(
      "--vdm-engagement <status>",
      "VDM engagement metrics: ENABLED or DISABLED"
    )
    .option(
      "--vdm-optimized-delivery <status>",
      "VDM optimized shared delivery: ENABLED or DISABLED"
    )
    .action(async (name: string, opts: Record<string, string | boolean | undefined>) => {
      try {
        await ses.createConfigSet(name, {
          tlsPolicy: opts.tls as string | undefined,
          sendingPoolName: opts.sendingPool as string | undefined,
          reputationMetricsEnabled: opts.reputationMetrics === true ? true : undefined,
          sendingEnabled: opts.sending === false ? false : undefined,
          suppressedReasons: opts.suppressionReasons
            ? (opts.suppressionReasons as string).split(",")
            : undefined,
          trackingDomain: opts.trackingDomain as string | undefined,
          trackingHttpsPolicy: opts.trackingHttps as string | undefined,
          vdmEngagementMetrics: opts.vdmEngagement as string | undefined,
          vdmOptimizedDelivery: opts.vdmOptimizedDelivery as string | undefined,
        });
        out.write(`Created configuration set '${name}'.\n`);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AlreadyExistsException") {
          out.error(`Error: Configuration set '${name}' already exists.\n`);
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  cmd
    .command("show")
    .description("Show details of a configuration set.")
    .argument("<name>", "Configuration set name")
    .action(async (name: string) => {
      const cs = await ses.getConfigSet(name);
      if (!cs) {
        out.error(`Error: Configuration set '${name}' not found.\n`);
        out.setExitCode(1);
        return;
      }

      out.write(`Configuration set: ${cs.name}\n`);

      if (cs.deliveryOptions) {
        out.write(`\nDelivery:\n`);
        if (cs.deliveryOptions.tlsPolicy) {
          out.write(`  TLS policy: ${cs.deliveryOptions.tlsPolicy}\n`);
        }
        if (cs.deliveryOptions.sendingPoolName) {
          out.write(`  Sending pool: ${cs.deliveryOptions.sendingPoolName}\n`);
        }
        if (cs.deliveryOptions.maxDeliverySeconds) {
          out.write(`  Max delivery seconds: ${cs.deliveryOptions.maxDeliverySeconds}\n`);
        }
      }

      if (cs.reputationOptions) {
        out.write(
          `Reputation metrics: ${cs.reputationOptions.reputationMetricsEnabled}\n`
        );
      }

      if (cs.sendingOptions) {
        out.write(`Sending enabled: ${cs.sendingOptions.sendingEnabled}\n`);
      }

      if (cs.suppressionOptions) {
        out.write(
          `Suppression reasons: ${cs.suppressionOptions.suppressedReasons.join(", ")}\n`
        );
      }

      if (cs.trackingOptions) {
        out.write(`\nTracking:\n`);
        out.write(`  Domain: ${cs.trackingOptions.customRedirectDomain}\n`);
        if (cs.trackingOptions.httpsPolicy) {
          out.write(`  HTTPS policy: ${cs.trackingOptions.httpsPolicy}\n`);
        }
      }

      if (cs.vdmOptions) {
        out.write(`\nVDM:\n`);
        if (cs.vdmOptions.engagementMetrics) {
          out.write(`  Engagement metrics: ${cs.vdmOptions.engagementMetrics}\n`);
        }
        if (cs.vdmOptions.optimizedSharedDelivery) {
          out.write(
            `  Optimized shared delivery: ${cs.vdmOptions.optimizedSharedDelivery}\n`
          );
        }
      }
    });

  cmd
    .command("delete")
    .description("Delete a configuration set.")
    .argument("<name>", "Configuration set name")
    .action(async (name: string) => {
      try {
        await ses.deleteConfigSet(name);
        out.write(`Deleted configuration set '${name}'.\n`);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          out.error(`Error: Configuration set '${name}' not found.\n`);
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  cmd
    .command("destinations")
    .description("List event destinations for a configuration set.")
    .argument("<config-set>", "Configuration set name")
    .action(async (configSetName: string) => {
      try {
        const dests = await ses.getEventDestinations(configSetName);
        const label =
          dests.length === 1 ? "event destination" : "event destinations";
        out.write(`${dests.length} ${label}:\n`);
        for (const d of dests) {
          out.write(
            `  ${d.name} (${d.destinationType}, ${d.enabled ? "enabled" : "disabled"})\n`
          );
          out.write(`    Events: ${d.matchingEventTypes.join(", ")}\n`);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          out.error(
            `Error: Configuration set '${configSetName}' not found.\n`
          );
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  cmd
    .command("add-destination")
    .description(
      "Add an event destination to a configuration set. " +
        "Routes email events to SNS, EventBridge, CloudWatch, or Kinesis Firehose."
    )
    .argument("<config-set>", "Configuration set name")
    .argument("<dest-name>", "Event destination name")
    .requiredOption(
      "--type <type>",
      "Destination type: sns, eventbridge, cloudwatch, or firehose"
    )
    .requiredOption(
      "--events <events>",
      "Comma-separated event types: SEND,BOUNCE,COMPLAINT,DELIVERY,OPEN,CLICK,REJECT,RENDERING_FAILURE,DELIVERY_DELAY,SUBSCRIPTION"
    )
    .option("--topic-arn <arn>", "SNS topic ARN (required for sns type)")
    .option("--bus-arn <arn>", "EventBridge event bus ARN (required for eventbridge type)")
    .option(
      "--stream-arn <arn>",
      "Kinesis Firehose delivery stream ARN (required for firehose type)"
    )
    .option("--role-arn <arn>", "IAM role ARN for Kinesis Firehose (required for firehose type)")
    .option(
      "--dimension <spec>",
      "CloudWatch dimension: name:valueSource:defaultValue (repeatable)",
      (val: string, prev: string[]) => [...prev, val],
      [] as string[]
    )
    .option("--disabled", "Create destination in disabled state")
    .action(
      async (
        configSetName: string,
        destName: string,
        opts: {
          type: string;
          events: string;
          topicArn?: string;
          busArn?: string;
          streamArn?: string;
          roleArn?: string;
          dimension?: string[];
          disabled?: boolean;
        }
      ) => {
        const eventTypes = opts.events.split(",");
        for (const et of eventTypes) {
          if (!VALID_EVENT_TYPES.includes(et)) {
            out.error(`Error: Invalid event type '${et}'.\n`);
            out.setExitCode(1);
            return;
          }
        }

        const destType = opts.type.toLowerCase();
        const validDestTypes = ["sns", "eventbridge", "cloudwatch", "firehose"];
        if (!validDestTypes.includes(destType)) {
          out.error(
            `Error: Invalid destination type '${opts.type}'. Must be one of: ${validDestTypes.join(", ")}.\n`
          );
          out.setExitCode(1);
          return;
        }

        if (destType === "sns" && !opts.topicArn) {
          out.error("Error: --topic-arn is required for sns destination type.\n");
          out.setExitCode(1);
          return;
        }
        if (destType === "eventbridge" && !opts.busArn) {
          out.error("Error: --bus-arn is required for eventbridge destination type.\n");
          out.setExitCode(1);
          return;
        }
        if (destType === "firehose") {
          if (!opts.streamArn) {
            out.error("Error: --stream-arn is required for firehose destination type.\n");
            out.setExitCode(1);
            return;
          }
          if (!opts.roleArn) {
            out.error("Error: --role-arn is required for firehose destination type.\n");
            out.setExitCode(1);
            return;
          }
        }
        if (destType === "cloudwatch" && (!opts.dimension || opts.dimension.length === 0)) {
          out.error(
            "Error: --dimension is required for cloudwatch destination type.\n"
          );
          out.setExitCode(1);
          return;
        }

        let cloudWatchDimensions:
          | Array<{ name: string; valueSource: string; defaultValue: string }>
          | undefined;
        if (destType === "cloudwatch" && opts.dimension) {
          cloudWatchDimensions = [];
          for (const spec of opts.dimension) {
            const parts = spec.split(":");
            if (parts.length !== 3) {
              out.error(
                `Error: Invalid dimension format '${spec}'. Expected name:valueSource:defaultValue.\n`
              );
              out.setExitCode(1);
              return;
            }
            cloudWatchDimensions.push({
              name: parts[0],
              valueSource: parts[1],
              defaultValue: parts[2],
            });
          }
        }

        try {
          await ses.createEventDestination(configSetName, destName, {
            enabled: !opts.disabled,
            matchingEventTypes: eventTypes,
            snsTopicArn: destType === "sns" ? opts.topicArn : undefined,
            eventBridgeBusArn: destType === "eventbridge" ? opts.busArn : undefined,
            kinesisStreamArn: destType === "firehose" ? opts.streamArn : undefined,
            kinesisRoleArn: destType === "firehose" ? opts.roleArn : undefined,
            cloudWatchDimensions,
          });
          out.write(
            `Created event destination '${destName}' on configuration set '${configSetName}'.\n`
          );
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AlreadyExistsException") {
            out.error(
              `Error: Event destination '${destName}' already exists on '${configSetName}'.\n`
            );
            out.setExitCode(1);
            return;
          }
          if (err instanceof Error && err.name === "NotFoundException") {
            out.error(
              `Error: Configuration set '${configSetName}' not found.\n`
            );
            out.setExitCode(1);
            return;
          }
          throw err;
        }
      }
    );

  cmd
    .command("remove-destination")
    .description("Remove an event destination from a configuration set.")
    .argument("<config-set>", "Configuration set name")
    .argument("<dest-name>", "Event destination name")
    .action(async (configSetName: string, destName: string) => {
      try {
        await ses.deleteEventDestination(configSetName, destName);
        out.write(
          `Deleted event destination '${destName}' from configuration set '${configSetName}'.\n`
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          out.error(
            `Error: Event destination '${destName}' not found on '${configSetName}'.\n`
          );
          out.setExitCode(1);
          return;
        }
        throw err;
      }
    });

  return cmd;
}
