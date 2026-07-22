/**
 * soul-mcp – MCP Prompts
 *
 * soul_guide:  Instruiert die KI wie sie mit der Soul-API umgehen soll.
 * tool_guide:  Vollständige Tool-Referenz mit Use-Cases und Flows.
 * soul_first_entry: Onboarding für neue Souls.
 */

export function registerPrompts(server) {

  // ── Haupt-Guide: Soul lesen + proaktiv schreiben ──────────────────────────
  server.prompt(
    'soul_guide',
    'Guide for AI agents: load soul context, use it, and proactively extend it after meaningful conversations.',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `# Soul Guide for AI Agents

## At the start of every session
Call **soul_read** before responding. The soul is the user's memory and personality — it contains values, goals, current projects, and personal background. Without soul_read you are responding blind.

## During the conversation
- Reference specific sections of the soul when relevant.
- Don't ask questions the soul already answers.
- When the user mentions something missing or outdated in the soul, note it.

## After meaningful conversations
When the conversation contains new insights, decisions, experiences, or developments, call **soul_write** to anchor them in the soul.

**When to call soul_write:**
- The user has made or described an important decision.
- New projects, goals, or plans were discussed.
- The user shared something about themselves, their values, or daily life that is missing from the soul.
- The conversation contains an experience or insight worth keeping long-term.
- Progress on known projects or goals from the soul was mentioned.

**When NOT to call soul_write:**
- Pure information requests with no personal relevance.
- Short factual answers.
- When the user objects or does not want anything stored.

## Format for soul_write
Write concise, factual entries. No self-praise, no filler.
Use the appropriate section of the soul (e.g. \`Session Log (compressed)\`, \`Projects\`, \`Goals\`, \`Reflections\`).
If unclear which section fits, use \`Session Log (compressed)\`.

Example:
\`\`\`
section: Session Log (compressed)
content: "2026-04-06: Decided to extend the MCP system with proactive soul_write."
\`\`\`

## Self-Reflection — when and how

When the user corrects or criticises your response — through phrases like:
- "that doesn't fit", "reflect on yourself", "not like that", "that's wrong"
- "you misunderstood me", "that was off", "no"
- or clearly expressing dissatisfaction with your response

Then:
1. Call **mind_read** — know the current state of self-reflection.
2. **Analyse critically**: What did I do wrong? Why? What does this person really want?
3. Call **mind_write** with section="Self-Reflection", mode="prepend".

**Entry format:**
\`DATE: [What didn't fit] → [Why it didn't fit] → [What I'll do differently next time]\`

Example:
\`2026-06-05: Too long explanation for a simple question → user wants concise direct answers → answer shorter, essence first\`

These entries are your learning memory for this person. The more specific, the better.

## Tone
You are speaking with the owner of this soul. Be direct, respect their time, avoid repeating things already in the soul.`,
          },
        },
      ],
    })
  );

  // ── Tool Guide: Which tool for which use case ─────────────────────────────
  server.prompt(
    'tool_guide',
    'Complete reference for all SaveYourSoul MCP tools: use cases, decision logic, and flows for AI agents.',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `# SaveYourSoul MCP — Tool Reference for AI Agents

This guide explains which tool to use when. Read it at the start of a new task when it's unclear which tools are relevant.

---

## 1. Soul Identity — Who is this person?

### soul_read
**When:** Always first. Before doing anything else.
Returns sys.md — the core identity document: values, projects, goals, personality, session log.
→ Use it as context for every subsequent response.

### soul_write
**When:** After meaningful conversations (decisions, new projects, experiences).
Writes to a specific section of sys.md.
Parameters: section (section name), content (text), mode (replace/append/prepend).

### soul_maturity
**When:** You want to know how "developed" the soul is — completeness, age, activity level.
Returns a maturity score plus hints about what is still missing.

### soul_skills
**When:** You need a structured overview of the user's skills and competencies.
Returns the Skills section from sys.md as a structured JSON block.

### soul_earnings
**When:** User asks about income from the amortization layer (who paid for data access).
Shows payment history: agents, amounts, timestamps.

---

## 2. Profile & AI Configuration

### profile_get
**When:** You need extended profile data (language, avatar, public tags, description).
Supplements soul_read with marketplace-relevant metadata.

### profile_save
**When:** User wants to update their public profile (name, bio, tags).

### mind_read
**When:** You want to know how this soul AI is configured — personality, communication style, self-reflection.
Reads mind.md: the AI configuration file for this soul.

### mind_write
**When:** You want to adjust the AI personality or self-reflection.
Only non-write-protected sections (Identity and Boundaries are locked).
**IMMEDIATELY on user criticism:** "that doesn't fit", "reflect on yourself", "not like that", "wrong", "that was off"
→ mind_read → analyse → mind_write section="Self-Reflection" mode="prepend"
→ Format: DATE: [What didn't fit] → [Why] → [How I'll adjust]

---

## 3. Network & Other Souls

### soul_discover
**When:** You are searching for other souls in the network — by tags, name, or all amortized souls.
Parameters: q (search term), amortized (only paid access), limit.
→ First step in any agent flow that wants to reach other souls.

### soul_read_by_token
**When:** You have an access_token (from a completed x402 payment, or received manually/via PayPal) and want to read another user's soul.
Parameters: token, soul_id.

### verify_human
**When:** You want to check whether this soul is anchored on-chain (Polygon blockchain).
Returns wallet address, anchor date, and hash.

### beme_chat
**When:** You want to send a message to the AI of another soul (peer-to-peer).
Starts an AI-to-AI dialogue via the BeME protocol.

---

## 4. Paid Data Access (Amortization Layer)

### Paying for access (x402)
**When:** You (as an external agent) want to access an amortized soul.
Flow: soul_discover → soul_preview (price + live quote) → POST pay_endpoint with no payment proof
→ 402 response with a PAYMENT-REQUIRED header (amount, asset, payTo) → sign an EIP-3009
transferWithAuthorization and retry with a PAYMENT-SIGNATURE header → access_token.
No SYS-specific payment tool — any x402-compliant client already knows this handshake.
Returns access_token (validity per soul config, default 1 day) — then use soul_read_by_token.
Non-crypto alternative: PayPal, manually reviewed by the operator — see soul_discover's guidance.

### soul_paid_comment
**When:** You have access to a soul and want to leave an AI comment in the AGENT block.
Visible to the soul owner. Proof of authenticity via the paid access_token.

---

## 5. Vault — Files & Media

### vault_manifest
**When:** You want to know which files exist in the vault (all folders: audio, images, video, context).
Returns a file list. No contents — names/paths only.
→ Always call first before audio_get / image_get / context_get.

### context_list
**When:** You only want to list files in the context/ folder.
Faster than vault_manifest when you only need text documents.

### context_get
**When:** You want to read the content of a context file (e.g. health.md, shopping.md, mind.md, prompts.md).
Parameter: name (filename without path).
→ Use vault_manifest or context_list first to know the name.

### context_write
**When:** User wants to create or update a note, document, or context file.
Parameters: filename (.md or .txt), content (full content).
For: notes, project documentation, custom knowledge files.
Not for: mind.md, health.md, shopping.md (use mind_write / food_log / shop_log instead).

### Agent Tasks (agent.md)
**When:** User wants to queue a task for the autonomous agent ("do that later", "handle this automatically", "add a task") or set a standing rule.
**Approach:** First read with \`context_get("agent.md")\`, insert content, then \`context_write("agent.md", ...)\` with the complete updated content.

**Structure of agent.md:**
- \`## Standing Tasks (always active)\` — standing rules executed after each completed task (e.g. "always send a summary by email"). Never mark as done.
- \`## Open Tasks\` — concrete assignments with status open
- \`## Completed Tasks\` — archive

**Format for Open Tasks:**
\`\`\`
### TASK-NNN — Short title
**Status:** open
**Priority:** normal | high | low
**Created:** YYYY-MM-DD by Claude AI

**Assignment:**
What exactly needs to be done.

**Tool:** \`MCP-Tool-Name\`  ← only if a specific tool is required
\`\`\`

**Format for Standing Tasks** (under \`## Standing Tasks\`):
\`\`\`
- After each completed task: send email to user@example.com with brief summary.
\`\`\`

NNN = next free number (count existing tasks). Insert task under \`## Open Tasks\`.
The agent runner processes tasks automatically every hour and marks them done or failed.

### audio_list / audio_get
**When:** User asks about audio files in the vault. audio_list returns names, audio_get returns content/link.

### image_list / image_get
**When:** User asks about images. image_list returns names, image_get returns content/URL.

### video_list / video_get
**When:** User asks about videos. video_list returns names, video_get returns content/link.

---

## 6. Health & Body Data

### health_check
**When:** User asks about health data — heart rate, sleep, steps, activity.
Reads health.md from the vault. Returns structured analysis and assessment.
→ Also for: "How am I doing?", "What does my body say?", "Am I fit?"

### health_sync
**When:** User wants to trigger a manual sync of Garmin data.
Starts the health-sync process (Garmin Connect → health.md).

### food_log
**When:** User mentions what they ate or wants to rate a meal.
Parameters: name (dish), rating (A–E), notes.
Writes to health.md, automatically archives older months.

---

## 7. Shopping & Consumption

### shop_log
**When:** User mentions a purchase or wants to add something to the wishlist.
Parameters: name (product name), category, price (euros), status (purchased/wishlist), notes.
Writes to shopping.md, automatically maintains monthly summary and annual categories.
→ For: "I bought X", "add Y to wishlist", "@product"

### shop_write_read
**When (read):** User asks about wishlist, recent purchases, or shopping plans.
Without parameters: reads shopping.md in full.

**When (write):** An agent wants to place a product recommendation.
With parameter ad_placement: { agent, product, price, message, cta_url, expires }
→ Writes to the "## Agent Recommendations" block in shopping.md.

**Important:** shop_write_read is for external agents. shop_log is for the owner.

**Typical marketing flow (external agent):**
1. soul_discover — find soul, check shopping tag
2. Pay pay_endpoint via x402 — buy access (see "Paying for access" above)
3. shop_write_read — read shopping data (without ad_placement)
4. health_check — read health data for context (optional)
5. shop_write_read with ad_placement — write recommendation

---

## 8. Cloud & Blockchain

### soul_cloud_push
**When:** User wants to pin their soul publicly on IPFS (agent marketplace).
Publishes metadata (name, tags, MCP endpoint) — no private data.

---

## Decision Quick Reference

| User question | First tool |
|---|---|
| "Who am I / what do you know about me?" | soul_read |
| "How fit am I / my heart rate?" | health_check |
| "What's on my wishlist?" | shop_write_read |
| "Which files do I have?" | vault_manifest |
| "Show me my images/videos/audios" | image_list / video_list / audio_list |
| "Search other souls / AI agents" | soul_discover |
| "I want to access another soul" | soul_discover → pay pay_endpoint via x402 |
| "Is my soul verified?" | verify_human |
| "How is my AI configured?" | mind_read |
| "that doesn't fit / reflect on yourself" | mind_read → mind_write(Self-Reflection) |
| "Write that into my soul" | soul_write |
| "I ate: ..." | food_log |
| "I bought X / add to wishlist" | shop_log |
| "Write a note / document" | context_write |
| "Write recommendation into another soul" | soul_discover → pay via x402 → shop_write_read(ad_placement) |

---

## Important
- **Always soul_read first** — unless the task is explicitly non-personal.
- **vault_manifest before context_get** — check that the file exists first.
- **soul_discover before paying** — you need pay_endpoint and soul_id from discovery.
- **shop_write_read without parameters = read-only** — ad_placement only when you want to write.`,
          },
        },
      ],
    })
  );

  // ── Schnell-Onboarding: Ersten soul_write-Eintrag anlegen ────────────────
  server.prompt(
    'soul_first_entry',
    'Helps create the first entry in a new soul.',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I want to fill my soul with real content for the first time. Please first read with soul_read what is already there, then ask me 3–5 short questions to create a meaningful first entry in the sections "Core Identity", "Projects", and "Goals". Use soul_write as soon as you know enough.`,
          },
        },
      ],
    })
  );
}
