# Voice AI Design Decisions

## ADR-1: Hold-to-talk instead of Voice Activity Detection (VAD)

**Decision:** Push-to-talk via hold-to-talk button, not continuous VAD.

**Rationale:** VAD adds significant complexity (model loading, tuning thresholds per microphone, false positives from ambient noise, handling overlapping speech). For a portfolio demo, hold-to-talk gives clearer turn boundaries and is more reliable across different browser/hardware combinations. Production telephony systems use VAD because you can't ask the user to hold a button — but browser-based demos don't have that constraint.

**Trade-off accepted:** User experience is slightly less convenient (must hold button while speaking), but the reliability gain in a demo context outweighs it.

**How production would add VAD:** A lightweight WebRTC VAD library (like webrtc-vad or py-webrtcvad) runs in the browser, continuously streams audio to the server, and server-side voice detection triggers the pipeline. This is a significant addition — out of scope here.

---

## ADR-2: Two-turn LLM pattern with tools instead of streaming

**Decision:** When the LLM fires tools, execute them and call the LLM again with results (two-turn pattern), not streaming.

**Rationale:** The two-turn pattern (LLM → tools → LLM with results → final text) is the canonical production pattern for function calling. It's debuggable: you can log each turn, see exactly what the model decided and why. Streaming adds latency complexity (chunked audio, partial responses, back-pressure) without meaningful benefit at this scope.

**Trade-off accepted:** End-to-end latency is slightly higher than a streaming approach would be (because you wait for the full response before speaking). For a banking agent where responses are typically 10-30 words, this is acceptable.

**How production would add streaming TTS:** OpenAI's TTS supports chunked responses in some configurations. You'd stream the audio chunks to the browser as they're generated, and use the Web Audio API's `SourceBuffer` or a similar mechanism to play them incrementally. This reduces perceived latency significantly. Out of scope for this repo — documented as a clear next step.

---

## ADR-3: OpenAI Whisper API instead of self-hosted

**Decision:** Use the OpenAI Whisper API (`whisper-1`) for STT, not a local Whisper model.

**Rationale:** Self-hosted Whisper requires either:
- A large model (~1.5GB for `whisper-base` or 3GB for `whisper-large-v3`)
- A GPU or high-CPU machine to run it
- Additional infrastructure (model serving, scaling, health checks)

This is a meaningful operational burden for a portfolio repo. The OpenAI API handles Arabic well (Whisper was trained on large Arabic datasets), auto-detects language, and has a simple API.

**Trade-off accepted:** Per-request cost for Whisper is ~$0.006/minute. At ~2 minutes of audio per conversation, this adds ~$0.012/conversation. For a demo this is negligible. Production deployments would need to evaluate self-hosting for cost savings at scale.

**Known limitation:** WebM audio from the browser must be sent to the API. Some production systems use local Whisper to avoid sending audio over the wire (latency + privacy). This is a documented trade-off, not a bug.

---

## ADR-4: Redis for session state instead of in-memory

**Decision:** Session state stored in Redis with 1-hour TTL, not in-process Python dict.

**Rationale:**
- Multi-process safety: uvicorn runs multiple worker processes; in-memory dict isn't shared between them
- TTL ergonomics: Redis TTL is cleaner than a background cleanup job
- Production shape: Any real deployment will use Redis (or similar); using it here demonstrates that understanding
- Simplicity: The `fakeredis` library makes testing trivial

**Trade-off accepted:** Redis adds an infrastructure dependency. For a local demo, this means either running Docker Compose or having a local Redis instance. The `make dev` command handles this, but it's more setup than a pure Python solution.

**Why not a "real" database (Postgres/SQLite):** The session is ephemeral JSON — not relational data. Redis fits the shape better. And SQLite would have the same multi-process sharing problem as in-memory.

---

## ADR-5: No LangChain or agent framework

**Decision:** Direct use of OpenAI SDK + manual function calling, no LangChain, LlamaIndex, or similar.

**Rationale:** LangChain is excellent for complex agentic workflows — but this is a constrained, deterministic pipeline. The whole point of the portfolio is to demonstrate that I understand the primitives:
- How the STT → LLM → TTS chain works at a low level
- How function calling actually works (tool schemas, two-turn execution)
- How session state flows through the pipeline

LangChain would abstract all of this and give the recruiter a "they know how to call `chain.invoke()`" signal — not "they understand what's happening inside the chain."

**Trade-off accepted:** More code to write by hand. But the code is cleaner and more demonstrative of the actual architecture.

---

## ADR-6: Last-10-turns truncation for LLM context

**Decision:** When sending conversation history to the LLM, only send the last 10 turns, not the entire session.

**Rationale:**
- Cost: Each turn adds input tokens. A long conversation could hit context limits and increase cost.
- Latency: More tokens → longer time-to-first-token from the LLM.
- LLM relevance: Early turns are usually less relevant to the current query. The most recent context is what matters for banking.

**Why exactly 10:** A reasonable middle ground. Banking conversations rarely go more than a few turns deep for a single intent. 10 turns covers most scenarios without being wasteful. The number is configurable via `SESSION_TURN_LIMIT` env var.

**Known limitation:** Very long dispute flows (which can take 5-6 turns) could lose context from earlier in the dispute if they happen after other unrelated turns. This is a known trade-off — production would use semantic retrieval or a longer window with a larger context model.

---

## ADR-7: Dialect handling — MSA as baseline, dialect as production extension

**Decision:** System prompt and TTS use MSA (Modern Standard Arabic). Whisper auto-detects dialect and the LLM handles it, but the output is MSA.

**Rationale:**
- MSA is the shared register that all Arabic speakers understand, even if they speak dialectally in daily life
- Whisper transcribes Arabic dialects well (trained on large MENA datasets) and passes the text to the LLM, which understands dialects
- The LLM can respond in dialect if prompted, but the TTS voice (nova) is trained on MSA — mixing dialect text with MSA audio is intentional (formal register for the bank's voice)

**Production extension:** A dialect classifier (lightweight model or rule-based) would detect the user's dialect (Egyptian, Khaleeji, Levantine, etc.) upstream of the LLM. The system prompt would switch to dialect-matched Arabic, and a dialect-matched TTS voice would be selected. This is a known gap — out of scope here, but documented so the Sarj.ai reviewer knows I've thought about it.