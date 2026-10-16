# PayBox plugin developer guide

## Overview

Build a standard TypeScript MCP server, bundle it into one `plugin.mjs`, then
upload, configure and test it in the developer portal. You can install your own
checked version privately while it awaits review. Publication to other users
requires manual approval of every version. Plugins may read APIs and propose
transactions; PayBox handles wallet selection, policy, approval and signing.

Start with the echo starter below, then try the [working examples](#working-examples).
Local conformance proves protocol compatibility; hosted testing proves runtime
configuration; an installed plugin exercised by an agent proves the user journey.
These are separate checks. This guide does not claim a local test proves payment
or production execution.

If you are using a coding agent, give it the [hackathon plugin agent guide](./skill.md)
and describe what you want to build. The agent guide links to these requirements,
the starter files, and examples.

## Sign in and eligibility

Use **Register with PayBox** with your existing PayBox account. Developer sessions
last up to three days; signing out revokes the session. All developer portal
actions use this session without an additional passkey check. When MoonPay KYC
is required, the portal shows an eligibility badge: your PayBox email must match the email used for
MoonPay KYC, so complete MoonPay verification if needed and select **Recheck**.
Verified eligibility then unlocks the submission workspace. When KYC is not
required, the submission workspace opens right after sign-in. You can build and
run local conformance at any time.

You can submit one project. The hackathon opens Friday, October 16 at 8am and
ends Saturday, October 17 at 8pm New York time. Before the deadline, you can
upload a new version and submit it for review. After the deadline, you can
still view and test your project and edit its network access, variables, and
secrets. You cannot upload another file, submit or withdraw a version, or delete
your entry after the deadline.

## Capabilities and boundaries

| Capability | How it works |
|---|---|
| Read data | Return text and schema-validated structured output from a standard MCP tool. |
| External APIs | Use HTTPS to exact configured network hosts. Add API credentials as host-scoped brokered headers. |
| EVM transactions | Return one unsigned call on a supported chain; PayBox constructs and simulates the transaction. |
| Solana transactions | Return a fresh unsigned legacy/v0 transaction built for the selected user's public wallet address. |
| Private testing | After submitting for review, your project appears in your PayBox plugin list. Enable it there to test privately. |
| Public distribution | Every new code version requires manual approval. Owners can update runtime hosts, variables and API credentials without resubmitting code. |
| Custom interface | Hosted code cannot supply executable UI; PayBox renders its own interface. |
| Persistent state | Do not rely on memory or disk surviving: every operation uses a fresh sandbox. |
| x402 | Propose a paid HTTP request on Base or Solana; PayBox checks the payment request and completes it with your approval. |


## Copy the starter files

Starter release **1.0.2**. [File checksums](./plugin-starter/v1.0.2/manifest.json) identify this release.

Create a `my-plugin` folder and copy these plain text files into the paths below.
Save each file without the `.txt` suffix. No PayBox account or repository access
is needed. The example tool lives in `src/plugin.ts`; the other files
provide the build setup and local verification.

| File to create | Purpose |
|---|---|
| [src/paybox.ts](./plugin-starter/v1.0.2/src/paybox.ts.txt) | Transaction proposal builders, output schemas, and exact amount conversion. |
| [src/plugin.ts](./plugin-starter/v1.0.2/src/plugin.ts.txt) | Example echo tool; replace it with your tools. |
| [package.json](./plugin-starter/v1.0.2/package.json.txt) | Pinned dependencies and commands. |
| [tsconfig.json](./plugin-starter/v1.0.2/tsconfig.json.txt) | TypeScript settings. |
| [pnpm-lock.yaml](./plugin-starter/v1.0.2/pnpm-lock.yaml.txt) | Reproducible dependency install. |
| [pnpm-workspace.yaml](./plugin-starter/v1.0.2/pnpm-workspace.yaml.txt) | Allows the esbuild installation step. |
| [.gitignore](./plugin-starter/v1.0.2/gitignore.txt) | Excludes dependencies and build output. |
| [paybox-plugin.json](./plugin-starter/v1.0.2/paybox-plugin.json.txt) | Sample tool name and arguments to verify. |
| [scripts/conformance.mjs](./plugin-starter/v1.0.2/scripts/conformance.mjs.txt) | Checks the bundled plugin's MCP compatibility. |
| [starter-version.json](./plugin-starter/v1.0.2/starter-version.json.txt) | Starter and protocol versions, reference toolchain. |
| [scripts/process.mjs](./plugin-starter/v1.0.2/scripts/process.mjs.txt) | Bounded child-process lifecycle and cancellation. |
| [scripts/report.mjs](./plugin-starter/v1.0.2/scripts/report.mjs.txt) | Stable JSON reports and environment checks. |
| [scripts/schema.mjs](./plugin-starter/v1.0.2/scripts/schema.mjs.txt) | Input/output JSON Schema validation. |
| [scripts/test.mjs](./plugin-starter/v1.0.2/scripts/test.mjs.txt) | Runs type-check, reproducible builds, and conformance. |

Supported: macOS and Linux with Node.js 24 and pnpm 11.11.0. CI uses Node.js
24.21.0 on both systems; Windows users should use WSL2. Pin the same Node patch
version for reproducible builds. Native Windows is not supported.

To upgrade, copy the new release into a separate folder, carry over your plugin
source and sample configuration, review dependency changes, and run the complete
checks again. Replace all tooling files together; do not mix starter releases.

Use the reference toolchain:

```bash
cd my-plugin
pnpm install --frozen-lockfile
pnpm test
```

Edit `src/plugin.ts` to add standard MCP tools. Update `paybox-plugin.json` with
one successful sample tool name and its arguments before testing. Replace
`my-plugin` in `package.json` and `src/plugin.ts` with your plugin's name.

| Command | What it does |
|---|---|
| `pnpm dev` | Starts your source server over stdio for a local MCP host. |
| `pnpm build` | Bundles source and dependencies into `dist/plugin.mjs`. |
| `pnpm conformance` | Discovers tools and runs your configured sample call against the existing bundle. |
| `pnpm test` | Type-checks, builds twice, requires identical bytes, then runs conformance. |

## Understand the result

Conformance prints one JSON report and exits with code 0 for a pass or 1 for a
failure. Run `pnpm --silent conformance` to consume only the JSON report. The
stdout from `pnpm --silent test` is also one JSON report; type-check/build
diagnostics go to stderr. Both commands exit nonzero on failure or cancellation.

Every report includes `reportVersion: 1`, `starterVersion`, `protocolVersion`,
actual Node/platform/architecture in `toolchain`, and `durationMs`.
A pass also reports `sampleCall` with the tool name and its status.

A pass contains `status: "passed"`, `artifact.bytes`, `artifact.sha256`, and
`discoveredToolCount`. A failure contains `status: "failed"`, `code`, and a
concise `message`; it does not print plugin stdout, stderr, or error payloads.
Build tools can print their own diagnostics before the final report.

| Failure code | Next step |
|---|---|
| `environment_invalid` | Run the checks with Node.js 24. |
| `schema_invalid` | Fix the self-contained JSON Schema 2020-12 declaration; remote references are not fetched. |
| `arguments_invalid` / `result_invalid` | Match the sample arguments or structured output to the declared schema. |
| `cancelled` | The check was stopped; run it again. |
| `config_invalid` | Fix the sample tool and JSON arguments in `paybox-plugin.json`. |
| `artifact_invalid` | Build a non-empty UTF-8 `dist/plugin.mjs` no larger than 10 MiB. |
| `typecheck_failed` / `build_failed` | Fix the source or build using the preceding compiler output. |
| `build_not_deterministic` | Remove changing build inputs; identical inputs must produce identical bytes. |
| `startup_failed` | Check imports and startup; all package dependencies must be bundled. |
| `protocol_invalid` | Emit newline-delimited MCP JSON on stdout, with matching IDs and `resultType: "complete"`. |
| `tool_catalog_invalid` | Fix tool metadata, schema shapes, pagination, or unsupported `x-mcp-header`. |
| `limit_exceeded` | Reduce the size or count identified by the message. |
| `timeout` | Complete each operation within 10 seconds. |
| `tool_failed` | Fix the selected sample call; it returned an MCP or JSON-RPC error. |
| `local_check_failed` | Check local files, permissions, and installed build tools. |

## What is checked

Each discovery page and sample call may run in a fresh process, so do not rely
on memory surviving between calls. Hosted calls have a 10-second budget, and a
local timing pass does not guarantee a hosted pass. Keep tool calls short. Log
to stderr; stdout is reserved for MCP messages.

| Local check | Limit |
|---|---:|
| Bundle | 10 MiB, UTF-8, named `plugin.mjs` |
| Total stdout per operation | 256 KiB |
| Total stderr per operation | 16 KiB |
| Operation duration | 10 seconds |
| Tool-list pages / total tools | 16 / 256 |
| Combined input and output schema per tool | 64 KiB |
| Tool name / pagination cursor | 128 bytes / 1 KiB |
| Sample JSON arguments | 64 KiB |
| Result content blocks | 128 |

The checks validate your sample arguments and structured output against the
declared JSON Schema without fetching references or changing values. Add your
own tests for important tool behavior and errors; a pass covers only the
configured sample call.

## Local execution and hosted execution

Only run the starter and local commands for code you wrote or trust. The sample
call really executes your code and can change an external system. Local tests
run with your operating-system access; they are not the PayBox security sandbox.

Local success does not test hosted network access,
brokered credentials, approval, signing, or transaction execution. Hosted
plugins receive only their configured non-sensitive environment variables and
approved network authority. Configure API credentials as brokered headers in
the portal; never bundle secrets or expect local environment credentials to be
available in production.

## Submit for review

Upload the built `plugin.mjs` through the developer portal. If an upload is
interrupted, select the file and retry.

After `pnpm test` passes, upload only `dist/plugin.mjs` in the
[developer portal](./). Do not upload source maps,
`.env` files, `node_modules`, or credentials. A source change requires rebuilding
and retesting the artifact you submit.

Uploads start unpublished. PayBox automatically discovers your tools and shows
the result in the portal. After the checks
pass, accept the MoonPay Hackathon Terms & Conditions and select **Submit for
review**. A new upload must pass its own checks.
If a check fails because settings were missing, configure the plugin and select
**Run checks again** after 30 seconds. This starts a new bounded run for the
same upload.

Preflight never calls a tool or injects brokered credentials. Your module still
runs during startup and discovery, including any network activity permitted by
its configuration. Keep discovery free of side effects; platform failures may
be retried up to three attempts.

Passing checks is not security approval and does not publish your plugin.

## Test your tools in PayBox

After sandbox checks pass, open **Test** and select **Load tools**. This discovers
only the tools on the displayed upload. Select one, enter a JSON object matching
its input schema, and select **Run test**.

A tool test uses real configured network access and brokered credentials and may
change data in an external service. Every run needs an explicit click. PayBox
never automatically retries a tool call; an uncertain outcome means you should
check the provider before deciding to run it again. Transaction proposals are
shown as data only: this console does not approve, sign, or broadcast them.

Tool lists expire after 10 minutes. Load tools again after changing the upload or
settings, including credential rotation. Plugin calls, hosted tests, and checks
share a per-user allowance of one start per second and 1,000 starts per rolling
24 hours. The portal displays your current limits. Transaction
validation retains its separate limit of one active validation and 30 per hour.
Results are shown only in the current page.
Output containing the literal value of a configured brokered credential is withheld.

## Validate a transaction proposal

If a successful tool test returns a declared `io.paybox/transactionProposal`,
select one of your active PayBox wallets and choose **Validate transaction**.
PayBox checks the test result and simulates the proposal to show a preview.
The selected wallet provides only its public address; no approval is created
and nothing is signed or broadcast.

Validation has a separate allowance of one active validation and 30 per hour.
Each result can be validated once, within five minutes and before the proposal expires.
Changing the upload or settings requires a fresh tool result. After an accepted
validation fails or its outcome is unavailable, explicitly run the tool again
for a new proposal; remember that the tool itself may have external side effects.
Simulation success does not establish economic safety or guarantee later execution.


## x402 payment proposals

Return an x402 payment request through the same `io.paybox/transactionProposal`
property used for EVM and Solana transactions. Declare that property in the
tool output schema. Example (replace the expiry with a fresh UTC timestamp):

```json
{
  "content": [{ "type": "text", "text": "Proposed a paid search" }],
  "structuredContent": {
    "io.paybox/transactionProposal": {
      "version": "1",
      "kind": "x402",
      "expiresAt": "2026-10-14T17:04:00Z",
      "chain": "eip155:8453",
      "request": {
        "url": "https://api.example.com/search",
        "method": "POST",
        "body": { "query": "weather" }
      },
      "payment": {
        "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "maxAmount": "50000"
      }
    }
  }
}
```

`maxAmount` is a positive decimal string in the asset's smallest units: `50000`
is 0.05 USDC. Supported payment rails are USDC on Base (`eip155:8453`) and
Solana (`solana:mainnet`, mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
The expiry must be within five minutes. Requests use HTTPS on port 443,
GET without a body or POST with at most 64 KiB of JSON. Hosted payment
endpoints must use a configured network host; remote plugins use their
connected origin. Custom headers and credential injection are not supported
for these payment requests. Do not put secrets in the URL or body.

PayBox fetches the live 402 challenge and verifies its asset and amount against
the proposal. The user reviews the payment, and PayBox sends it with an eligible
wallet before retrying the endpoint. Check the resulting payment and service
status before attempting another payment.

The sandbox invocation ends before approval. Poll the returned request ID;
do not run the plugin again to finish payment. The terminal response includes
payment status and the service response. A service failure does not necessarily
mean payment failed: inspect both before retrying. The plugin is not automatically
resumed; an agent may pass the paid response into a subsequent plugin call.

Developer validation sends the unpaid request and displays a public payment
preview. It never creates an approval, signs, broadcasts, or pays, and does not
prove paid-service success. The unpaid HTTP request can still have provider-side
effects. Plugin execution quotas apply; the proposal amount limit is separate
from the number of plugin calls.

## Working examples

Each file below is a complete replacement for the starter's `src/plugin.ts`.
Keep its pinned dependencies and tooling. Save the linked file without `.txt`,
replace `paybox-plugin.json` with the matching sample, then run `pnpm test`.
Build separate folders/bundles for separate plugins. None of these local checks
signs or sends a blockchain transaction.

| Example | Source | Sample `paybox-plugin.json` | Hosted setup |
|---|---|---|---|
| Echo | Starter above | `{"tool":"echo","arguments":{"message":"hello paybox"}}` | No network or wallet. |
| Public API | [repository-info.ts](./plugin-starter/examples/repository-info.ts.txt) | `{"tool":"repository_info","arguments":{}}` | Add network host `api.github.com`. Reads live GitHub data; rate limits or an outage can fail the check. |
| Base ETH proposal | [base-transfer.ts](./plugin-starter/examples/base-transfer.ts.txt) | `{"tool":"propose_base_transfer","arguments":{"recipient":"0x1111111111111111111111111111111111111111","amountWei":"0"}}` | Select a Base-capable wallet for validation. Zero-value sample is for construction only; gas and simulation requirements still apply. |
| x402 proposal | [x402-request.ts](./plugin-starter/examples/x402-request.ts.txt) | `{"tool":"propose_paid_request","arguments":{"endpoint":"https://api.example.com/paid","maxAmount":"50000"}}` | Replace the illustrative endpoint with a real Base-USDC x402 endpoint and configure its host before hosted validation. `50000` atomic USDC = 0.05 USDC maximum. |

The Base example accepts integer wei, not ETH: 1 ETH = 10^18 wei. A proposal
is not a receipt. Returning it neither transfers funds nor guarantees simulation
will pass. The x402 example only builds an envelope locally; `api.example.com`
is not a working payment provider and is never fetched by that example.

### Proposal helpers

The starter includes `src/paybox.ts`. Use its output schema and return its builder
result directly from your MCP tool:

```ts
import { atomicAmount, evmOutputSchema, proposeEvm } from "./paybox.js";

server.registerTool("transfer", {
  inputSchema: z.object({ recipient: z.string(), amountEth: z.string() }).strict(),
  outputSchema: evmOutputSchema,
}, async ({ recipient, amountEth }) => proposeEvm({
  chain: "eip155:8453",
  to: recipient,
  value: atomicAmount(amountEth, 18),
}));
```

Use `proposeSolana({ transactionBase64 })` with `solanaOutputSchema`, or
`proposeX402({ chain, url, maxAmount })` with `x402OutputSchema`. The x402 helper
selects the supported USDC asset for Base or Solana; `maxAmount` is atomic USDC.
`atomicAmount("0.001", 6)` returns `"1000"` without floating-point rounding.
Helpers supply the output envelope, version and four-minute expiry. Pass
`expiresAt` when a provider quote expires sooner; helpers never extend that value.
They validate the envelope locally and do not sign, submit, pay or select a wallet.
The raw contract below remains supported.

### Native currency, tokens and swaps

`proposeEvm` proposes one EVM call. `value` is the native currency amount in wei
(ETH on Base), not an ERC-20 amount. There is no `token`, `transfer` or `swap`
field in the proposal; unknown fields are rejected.

| Action | `to` | `value` | `data` |
|---|---|---|---|
| Native ETH transfer on Base | Recipient | ETH amount in wei | `0x` |
| ERC-20 transfer | Token contract | `0` | ABI-encoded `transfer(recipient, amount)` in that token's atomic units |
| Swap | Router or protocol contract | Native input when required by the protocol; otherwise `0` | Provider-built or ABI-encoded swap call, including its token, amount, recipient and slippage constraints |

A transfer can go to the same wallet, and a swap can send its output to another
wallet. Contract instructions determine the action; comparing sender and recipient
does not classify it. Plugin titles and descriptions are untrusted labels.

For example, with `viem` bundled in your plugin, a Base USDC transfer can use the
existing proposal helper. Add the exact dependency with
`pnpm add --save-exact viem@2.51.3`, then encode the call inside your tool:

```ts
import { encodeFunctionData, erc20Abi } from "viem";
import { atomicAmount, proposeEvm } from "./paybox.js";

const data = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transfer",
  args: [recipient, BigInt(atomicAmount(amountUsdc, 6))],
});
return proposeEvm({
  chain: "eip155:8453",
  to: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  value: "0",
  data,
});
```

Here `recipient` is a validated EVM address (`0x${string}` in TypeScript),
`amountUsdc` is a decimal string, and USDC uses six decimals: `"1.25"` becomes
`1250000` atomic units. The wallet still needs native currency for network fees.
Use the correct deployed contract and decimals for each token and chain.

A swap may require an ERC-20 allowance first. V1 accepts one transaction per
proposal, with no array of separate approval/swap transactions. If an additional
allowance transaction is needed, propose it separately, wait for confirmation,
then obtain a fresh swap
quote/proposal. PayBox does not add token approvals, obtain swap quotes, or choose
slippage for generic proposals. Solana token transfers and swaps similarly belong
in the unsigned transaction's program instructions; `proposeSolana` does not add
or classify them.

The transaction window shows the network, sender, and raw
transaction details; EVM also shows the destination and native value in wei.
It does not provide a decoded ERC-20 transfer, allowance or swap asset-change
summary. Successful simulation or a successful network receipt alone does not
prove the intended token amounts moved. Do not describe plugin text as a PayBox-verified token or swap
preview.

### User wallet selection

The user or their agent chooses the wallet through PayBox. For installed Open
Plugins, set `use_plugin.wallet_id` alongside `plugin_id`, `tool_id` and `input`.
Obtain its ID and public address from the connector's granted wallet list.
PayBox checks that the wallet is available to the user and does not send its ID
to plugin code. With one compatible wallet, the field may be omitted;
with multiple wallets it is required. A plugin cannot choose between them.

For Solana construction, the agent supplies the chosen wallet's public address as
the tool's `sender` argument when its schema requires one. PayBox verifies the
encoded signer matches the selected wallet. Never supply private keys. Developer
portal validation uses its existing owned-wallet picker and the same sender check.

### Transaction contract

Declare `io.paybox/transactionProposal` inline in the tool's output schema and
return it under `structuredContent`. Do not put a proposal in an `isError` result.
Set `version: "1"` and `expiresAt` to whole-second UTC RFC3339 within five minutes
(e.g. `new Date(Date.now() + 240000).toISOString().replace(/\.\d{3}Z$/, "Z")`).

- EVM: `kind: "evm"`, canonical `chain: "eip155:<chain ID>"`, and
  `transaction: {to, value, data}`. `to` is a 20-byte hex address, `value` is
  unsigned decimal wei, `data` is even-length hex calldata. One call only;
  the selected network must be available in PayBox.
- Solana: `kind: "solana"`, `chain: "solana:mainnet"`, and
  `transaction: {transactionBase64}`. Use canonical padded Base64, at most 1,232
  decoded bytes, exactly one required signer who is also the fee payer, and an
  empty signature slot. PayBox replaces the recent blockhash before simulation.
  A zero placeholder or stale hash is
  accepted; do not ask the user or agent for a blockhash. No plugin RPC call or
  network host is needed for blockhash preparation. Legacy/v0 only; no durable
  nonce, pre-signing, extra signers or sponsor. Obtain the user's public address
  as a tool argument when building a provider transaction; PayBox verifies it against the
  wallet chosen for the actual request. Never ask for a private key.
- x402: `kind: "x402"`, Base or Solana mainnet chain,
  `request: {url, method, body?}` and `payment: {asset, maxAmount}`. Exact USDC
  assets only, HTTPS port 443, GET without a body or POST with up to 64 KiB JSON.
  `maxAmount` is a positive integer in atomic USDC units. No custom headers or
  secrets in URLs/bodies. See [x402 payment proposals](#x402-payment-proposals)
  for the payment lifecycle, supported assets and validation behavior.

Do not include wallet IDs, signing keys, approval modes, signatures, RPC URLs or
broadcast instructions in the proposal. The tool's summary is untrusted; PayBox
checks the returned bytes and builds its own plan.

### Solana blockhash preparation

When building an unsigned transaction with `@solana/web3.js`, use a placeholder
instead of fetching a blockhash. For example, inside a tool that already has the
user's public `sender`, `recipient` and integer `amountLamports` arguments:

```ts
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

const from = new PublicKey(sender);
const transaction = new Transaction({
  feePayer: from,
  recentBlockhash: "11111111111111111111111111111111",
}).add(SystemProgram.transfer({
  fromPubkey: from,
  toPubkey: new PublicKey(recipient),
  lamports: BigInt(amountLamports),
}));
const proposal = {
  version: "1", kind: "solana", chain: "solana:mainnet",
  expiresAt: new Date(Date.now() + 240000).toISOString().replace(/\.\d{3}Z$/, "Z"),
  transaction: {
    transactionBase64: transaction.serialize({
      requireAllSignatures: false, verifySignatures: false,
    }).toString("base64"),
  },
} as const;
```

Return `proposal` under `structuredContent["io.paybox/transactionProposal"]`.
This is a construction snippet for a plugin using that SDK; bundle its dependency
with your plugin. PayBox preserves the instructions, accounts and amount, supplies
a fresh blockhash, and simulates the transaction before approval.
Provider-built unsigned legacy/v0 payloads use the same preparation. Pre-signed
payloads are rejected before any rewriting. Immediately before signing, PayBox
refreshes the blockhash and re-simulates the same instructions. EVM proposals
refresh their nonce and recheck execution without raising approved fee limits.
The proposal's original `expiresAt` still applies. Once signing starts, PayBox
freezes the prepared transaction so retries cannot create another payment.
If the proposal expires or fees exceed its limit, check the previous request's
status before asking for a new proposal.

### Execute through PayBox

When an installed tool proposes an EVM or Solana transaction, PayBox opens its
transaction window. Review the details and approve when required, then submit.
PayBox checks the transaction before signing, then broadcasts and confirms it.
A signed payload alone never counts as execution success.

Poll the returned request ID. `pending_confirmation` means a broadcast outcome
is still being reconciled; `success` includes the confirmed transaction hash.
A failed transaction or unknown outcome must be checked before asking for a new
proposal. Retrying submission for the same request does not create another
transaction. Developer-console validation remains simulation only.

## Configure network and secrets

In **Test & configure**, add only the exact hostnames your tools call; wildcards,
redirect chains and arbitrary destinations are not a networking contract. Keep
network calls out of module startup and tool discovery. Use bounded requests
(e.g. a four-second fetch timeout) so sandbox startup and work fit in ten seconds.

In **Variables & Secrets**, choose Environment variable for non-sensitive
`process.env` configuration. For an API key, choose Secret and specify the
target hostname, header name and value (including `Bearer ` if required).
PayBox adds that header to requests to the chosen host. Your
plugin makes an ordinary request to that host and does not read the secret from
`process.env`. Never log or return secrets. Test in the portal to confirm the
header is sent; local runs do not include it.

Uploading or changing settings invalidates earlier testing context. Reload tools
and rerun the specific sample. Installed plugins keep their code version and
use the owner's latest network hosts, variables and secrets on new calls,
including after submission or publication. Owners can rotate expired API keys or
add missing hosts without uploading another bundle or making a new submission.
Code changes require a new version before the hackathon deadline and public
review.
Configuration writes use your signed-in developer session; no additional passkey
check is required. If your session expires or you sign out, sign in again before
saving. Configuration edits do not consume
upload/submission attempts. Each plugin can configure up to 16 network hosts
and 16 brokered credentials.

## Use your plugin through an agent

1. Submit your checked project for review. It appears under **Unofficial plugins**
   in your PayBox account; enable it there to test it privately.
2. Connect your agent/MCP host to the same PayBox account. Use `discover_plugins`
   and `get_plugin` to get the installed plugin's current tools and schemas.
3. Invoke the tool through `use_plugin` using the discovered identifiers and schema.
   Do not guess the identifier or assume it is your project name.
4. For a data tool, check the returned structured result. For a proposal, review
   the PayBox request, choose the wallet and complete the required approval/signing.
   Follow the returned request ID until a terminal status; tool success alone is
   not transaction success. Inspect the receipt or failure before retrying.
5. For x402, the sandbox ends before payment. A paid response comes through the
   PayBox request; processing it further requires a new explicit plugin call.
   Do not rerun the payment tool merely to poll it.
6. A pending version is available only to you, not publicly. Updating a
   published plugin requires another review; existing installations remain on
   their accepted version until updated.

## Before you submit

- Build and test your `plugin.mjs`, then upload it before Saturday at 8pm New York time.
- Add each network hostname your tools call. Add non-sensitive variables and
  host-scoped secrets in **Variables & Secrets**.
- Run the hosted checks and a sample tool call. If your tool proposes a
  transaction, validate its preview with one of your wallets.
- Accept the hackathon terms and select **Submit for review** before the deadline.
  Your project remains visible afterward, and you can still update its settings.
