---
name: paybox-hackathon-plugin
description: Build and test a PayBox plugin for the MoonPay Hackathon from a participant's idea.
---

# Build a PayBox hackathon plugin

You are helping a hackathon participant build one PayBox plugin. Ask what they want the plugin to do, which inputs its tools should accept, and whether it needs an external API or a wallet transaction. Keep the tool interface small and understandable to a user who has never built a PayBox plugin.

Read the [PayBox plugin developer guide](https://developer.paybox.sh/requirements.md) before coding. It defines the hosted runtime, limits, network access, secrets, transaction proposals, testing, and submission flow. Follow that guide if this file leaves out a detail.

1. Create a TypeScript project from the [starter files](https://developer.paybox.sh/requirements.md#copy-the-starter-files). Each linked `.txt` file contains source to save at the path shown in the guide, without the `.txt` suffix. Keep the pinned dependencies and local checks.
2. Replace the example echo tool in `src/plugin.ts` with the participant's tool or tools. Use the [working examples](https://developer.paybox.sh/requirements.md#working-examples) when relevant. For a wallet action, return an unsigned transaction proposal using `src/paybox.ts`; PayBox handles wallet selection, approval, signing, and submission. Never ask for a private key.
3. Put one successful tool name and sample arguments in `paybox-plugin.json`. Use Node.js 24 and pnpm 11.11.0. Run `pnpm install --frozen-lockfile` and `pnpm test`; fix failures before handing over the artifact.
4. Give the participant `dist/plugin.mjs` to upload in the developer portal. State the exact network hostnames and environment variables or secrets they need to configure there. Never put API keys or other secrets in the bundle, sample arguments, or chat.

The participant can upload the bundle, configure its access, run hosted checks, test its tools, and submit it for review in the portal. Local checks do not prove that a hosted API call, wallet transaction, or payment will succeed.
