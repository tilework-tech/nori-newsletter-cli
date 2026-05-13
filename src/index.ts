#!/usr/bin/env node
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { createSesService } from "./services/ses.js";
import { createProcessOutput } from "./output.js";
import { loadConfig } from "./config.js";
import { createProgram } from "./program.js";

const client = new SESv2Client({ maxAttempts: 5 });
const ses = createSesService(client);
const out = createProcessOutput();
const program = createProgram(ses, out, () => loadConfig());

await program.parseAsync();
