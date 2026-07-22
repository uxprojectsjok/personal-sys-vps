# Security Policy

## Supported Versions

This project has no LTS track. Only the latest tagged release on `main` receives fixes — see [CHANGELOG.md](CHANGELOG.md) for the current version and [README: Updating Your Node](README.md#updating-your-node) for how to stay current. If you're running an older tag, update before reporting an issue that may already be fixed.

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities. Report them privately to:

**info@uxprojects-jok.com**

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce (a minimal example is ideal)
- The affected version or commit

You should get an initial response within a few days. Confirmed vulnerabilities will be fixed and documented in `CHANGELOG.md` under a **Security** heading once a fix is released; credit is given if you'd like it.

## Scope

Each self-hosted node is fully isolated — its own `SOUL_MASTER_KEY`, its own data, no shared infrastructure between nodes. The only shared surface between nodes and UX-Projects Jan-Oliver Karo infrastructure is the [SoulRegistry smart contract](docs/spec/soul-registry-contract.md) on Polygon, which stores SHA-256 hashes only. See [NOTICE](NOTICE) and the README's [Legal](README.md#legal) section for the full operator-responsibility model.

In scope:
- This repository's application code (`app/`, `lua/`, `soul-mcp/`, `server/`)
- The `init.sh`-driven server setup as documented in this repo
- The SoulRegistry smart contract's public interface

Out of scope:
- Third-party services this codebase integrates with (Anthropic, ElevenLabs, Reown, Pinata, Polygon infrastructure itself) — report those directly to the respective provider
- Vulnerabilities requiring physical or root access to an operator's own VPS
- Issues in a fork or derivative that diverges from this repository
