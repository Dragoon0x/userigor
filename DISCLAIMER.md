# Disclaimer

**Read this before you install, run, or depend on userigor for anything.**

userigor is experimental, work-in-progress, hobbyist research software released under the MIT License. It is provided **"as is" and without warranty of any kind**, express or implied, as stated in [LICENSE](./LICENSE). By installing, running, or otherwise using any package in the `@userigor/*` namespace, or any code in this repository, you accept the terms below.

---

## 1. Experimental status

- userigor is **pre-1.0 maturity in spirit**, regardless of its semver version number. Versions on npm exist so the ecosystem works; they are not a guarantee of stability.
- The data model (`Correction`, `Pattern`, `Session`, `Injection`, `Metric`), the SQLite schema, the embedding interfaces, the MCP tool surface, the CLI flags, the metric definitions, and the on-disk file layout under `~/.rigor/` **may change without notice between any two versions, including patch versions**.
- There is **no migration tooling**. There is **no backward-compatibility commitment**. If you upgrade and something breaks, that is an expected outcome at this stage of the project.
- The author may rename, deprecate, archive, or unpublish packages at any time.

## 2. No warranty

userigor is provided **WITHOUT WARRANTY OF ANY KIND**, including but not limited to:

- Warranties of merchantability
- Warranties of fitness for a particular purpose
- Warranties of correctness, accuracy, completeness, or reliability of any output, metric, embedding, cluster, pattern, or recommendation
- Warranties of non-infringement
- Warranties of uninterrupted, error-free, or secure operation
- Warranties that any defect can or will be corrected

The output of userigor — including but not limited to first-try acceptance scores, drift distances, pattern impact scores, injected context blocks, and any other computed metric or recommendation — **may be incorrect, misleading, or arbitrary**. Do not treat it as authoritative.

## 3. No liability

To the maximum extent permitted by applicable law, the author (Dragoon0x), contributors, and anyone associated with this project **shall not be liable** for any direct, indirect, incidental, special, exemplary, consequential, or punitive damages of any kind, including but not limited to:

- Loss of data, code, commits, or work product
- Corruption of git history, working trees, or local repositories
- Loss of revenue, profits, business, or reputation
- Decisions made on the basis of metrics or recommendations produced by userigor
- Damages arising from interaction with any LLM, AI coding agent, embedding provider, or third-party service
- Any other damages of any nature whatsoever

This applies whether the claim is based on warranty, contract, tort (including negligence), strict liability, or any other legal theory, and whether or not the author has been advised of the possibility of such damages.

## 4. Privacy and data handling

You are responsible for understanding what userigor reads, stores, and transmits.

- **Reads.** userigor reads from your local git history (`git log`, `git show`, diff content), including commit messages, file contents at each commit, and author metadata.
- **Stores.** userigor writes a SQLite database at `~/.rigor/data.db` by default. This database contains `before` and `after` snippets of code from your repositories, file paths, commit hashes, author identifiers, task descriptions you supply, and computed embeddings of all of the above. **Everything that is captured stays on your machine** unless you configure userigor to transmit it elsewhere.
- **Transmits.** The default embedding provider (`HybridTfIdfProvider`) computes embeddings locally and does **not** transmit data. If you configure an external embedding provider (such as `OpenAIEmbeddingProvider`), the `before` and `after` content of every captured correction is transmitted to that provider over the network. You are responsible for the privacy, contractual, and regulatory implications of that transmission.
- **Secrets.** If your git history contains secrets, credentials, private keys, personally identifiable information, customer data, or any other sensitive material, **userigor will capture and store it**. Audit your repos before pointing userigor at them.
- **Third-party agents.** When userigor injects context via MCP into your AI coding agent (Claude Code, Cursor, or any other client), the injected content is sent to whichever LLM provider that agent is configured to use. The author has no control over and no visibility into how that provider handles the data.

userigor is local-first by design, but **local-first is not the same as private**. You are the data controller. You are responsible for compliance with any laws or contracts that apply to the code and metadata you process with this tool.

## 5. Security

- userigor has **not** received a security audit, formal review, or penetration test.
- userigor parses git output, embeds arbitrary text, runs SQLite queries, and exposes a localhost web dashboard. Any of these surfaces may contain vulnerabilities the author is not aware of.
- The MCP server speaks over stdio and is intended for local use only. **Do not expose the MCP server, the dashboard, or the SQLite database to the public internet.**
- Do not run userigor as root. Do not run userigor against repositories you do not trust.
- The author makes **no commitment** about security advisory timelines, CVE disclosure, or coordinated remediation. Security issues may be addressed at the author's discretion, on no particular schedule, or not at all.

## 6. Not for high-stakes use

userigor is not intended for, and **must not be used in**:

- Safety-critical systems
- Life-critical systems (medical, aviation, automotive, industrial control, etc.)
- Financial systems where its output is treated as authoritative
- Compliance, legal, regulatory, or audit workflows where its output is treated as authoritative
- Any context where an incorrect metric, missing pattern, or hallucinated injection could cause material harm

The metrics produced by userigor are descriptive statistics over a noisy and incomplete signal (git diffs). They are not measurements of code quality, developer productivity, or AI agent capability in any rigorous sense. **Do not use them to evaluate, rank, or make decisions about people.**

## 7. No support, no SLA, no roadmap commitment

- userigor is built and maintained by one person on personal time.
- There is **no service-level agreement**, no guaranteed response time, and no commercial support.
- The author **may or may not** respond to issues, pull requests, or messages.
- The author **may** abandon, rename, fork, or rewrite the project at any time.
- Any roadmap mentioned in the README, landing page, or this document is **aspirational and non-binding**.

If you need a supported product with guarantees, userigor is not it. Build on it only if you accept that you are on your own.

## 8. No affiliation

userigor is an independent open-source project. It is **not affiliated with, endorsed by, sponsored by, or in any way associated with**:

- Anthropic, Claude, or Claude Code
- Cursor (Anysphere)
- OpenAI
- Google, GitHub, or Microsoft
- The Model Context Protocol (MCP) project maintainers
- Any other AI vendor, IDE vendor, or platform mentioned in this repository

References to any of those products are nominative use only — they identify what userigor interoperates with, not who built or endorses it. All trademarks belong to their respective owners.

## 9. Your responsibilities

By using userigor you agree that you are responsible for:

- Auditing what userigor reads from your repositories before running it
- Backing up your git history, working tree, and `~/.rigor/` directory if you care about them
- Understanding the privacy implications of any embedding provider you configure
- Securing your local machine, your dashboard port, and your `~/.rigor/data.db` file
- Verifying that any metric, pattern, or recommendation surfaced by userigor is correct before acting on it
- Complying with any applicable law, regulation, employment contract, or repository license that governs the code and data you process

**Do your own research.** Read the source. Run it on a throwaway repo first. Decide for yourself whether it earns a place in your workflow.

## 10. Contributions

Contributions are welcome but accepted at the author's sole discretion. By submitting a pull request, issue, or any other contribution, you agree:

- Your contribution is licensed under the same MIT License that covers the rest of the project.
- You have the right to license your contribution under those terms.
- You make the same no-warranty, no-liability disclaimers above with respect to your contribution.
- The author may modify, reject, or remove your contribution without obligation or notice.

## 11. Severability

If any provision of this document is held to be unenforceable, the remaining provisions remain in full force and effect.

## 12. Governing terms

This disclaimer supplements but does not replace the [LICENSE](./LICENSE). Where this document is silent, the MIT License governs. Where this document is more restrictive than the MIT License would allow, the MIT License governs to the extent of the conflict.

---

**Last updated:** 2026-05-22 · userigor v1.0.1
**Author:** [Dragoon0x](https://github.com/Dragoon0x)
**Contact:** via [GitHub issues](https://github.com/Dragoon0x/userigor/issues), best-effort only

If you cannot accept these terms, **do not install or use userigor**. Uninstalling and deleting `~/.rigor/` removes userigor from your machine.
