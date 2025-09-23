# Meeting Analysis Pipeline: Personalized AI Companion Plan

## Vision & Goal

The core goal is to make the AI a **personal friend and ally** for the user, empowering them with tailored insights during conversations (e.g., calls, meetings, lectures). The user "owns" the AI by selecting or creating presets that inject a custom role (e.g., "You are my sales coach"), shaping how the AI interprets and responds. This turns the AI from a generic tool into a specialized companion that feels like it "gets" the user's world—spotting opportunities in sales, clarifying concepts in school, diagnosing issues in support, etc.

- **User Power**: Presets are user-defined (seeded defaults + custom). No lock-in; switch anytime. The AI adapts to the user's role/perspective, prioritizing "me" (user) help.
- **Focus**: Real-time analysis in Listen sessions (STT speech → transcript → LLM → insights). Tailored to meeting types via presets, but simple: 3-4 sections max, actionable bullets.
- **"Friend" Feel**: Insights are encouraging/actionable (e.g., "Great point on ROI—probe budget next"). Emojis add friendliness (❓ for questions, ⚠️ for risks, etc.), but not overkill.
- **Dynamic**: LLM generates content based on transcript + role + variant rules. No fixed outputs—AI decides questions/terms from context (e.g., sales: "budget tight" → objection insight).
- **Simplicity**: No complex classification; use prompt rules for structure, parsing for emoji injection by section. Fallback to general for unknown/user-created presets.

## Current State (Base System)

- **Base Prompt** (`promptTemplates.js` meeting_analysis): Generic for general meetings.
    - Sections: "### Meeting Insights" (bullets on points/decisions), "### Questions Detected" (numbered from transcript), "### Terms to Define" (short nouns).
    - Rules: Strict (no placeholders, dedup priors, "me"-focus, short terms only).
- **Flow**:
    1. STT captures utterances ("me:" / "them:") → `addConversationTurn` adds to history.
    2. `triggerAnalysisIfNeeded` builds context (last 30 turns + prior terms/questions for dedup).
    3. `makeOutlineAndRequests`: Role prefix + base prompt + context → LLM call.
    4. Parsing (`parseResponseText`): Detects headings → extracts bullets/numbers → adds emojis by section (❓ for questions numbered, 📘 for defines - bullets), dedups, limits (5 summary, 10 actions).
    5. UI (`SummaryView.js`): Dynamic title ("Meeting Introduction"), plain summary bullets, actions with emojis (❓/📘 clickable to Whisper), static follow-ups (✉️ email, ✅ actions, 📝 summary).
- **Strengths**: Consistent, AI-dynamic content (questions/terms from transcript). Emojis friendly (❓ questions, 📘 defines).
- **Gaps**: Generic sections don't adapt to presets (always "Questions Detected", not sales-specific "Objections"). Custom presets use base, losing personalization.

## Desired State: Preset-Aware Analysis

Extend to make analysis **preset-driven**, adapting sections/emphasis while keeping parsing simple (section-based emoji injection like original ❓/📘).

- **Presets** (Seeded in `sqliteClient.js` + User-Created):
    - Seeded Defaults (6, raw text roles):
        - 'personal': General companion (fallback for versatile use).
        - 'school': Academic/lecture (focus: concepts, explanations).
        - 'meetings': Team/project (focus: decisions, progress).
        - 'sales': Deal-closing (focus: opportunities, objections).
        - 'recruiting': Interview/eval (focus: strengths, gaps).
        - 'customer-support': Troubleshooting (focus: issues, solutions).
    - User-Created: Raw text role (e.g., "My custom coach") → defaults to general (meeting_analysis). Optional JSON with `kind` for future variants, but raw works.
    - Storage: SQLite (`preset/sqlite.repository.js`), loaded via `settingsService.getPresets()`.

- **Variant Prompts** (in `promptTemplates.js`, prefixed with role):
    - Map preset ID to variant (in `setAnalysisPreset`): e.g., 'sales' → 'sales_analysis' (new prompt with sales headings).
    - Each variant: Copy base rules + scenario focus (e.g., sales: "Prioritize deal advancement").
    - Sections: 3-4 tailored headings (plain, no emojis—AI generates content under them).
        - General ('personal'/'meetings'): "### Meeting Insights" (- bullets), "### Questions Detected" (1. numbered), "### Terms to Define" (-).
        - Sales: "### Key Opportunities" (-), "### Objections & Needs" (1.), "### Follow-Up Questions" (-), "### Terms to Define" (-).
        - Recruiting: "### Candidate Strengths" (-), "### Potential Gaps" (1.), "### Suggested Questions" (-), "### Terms to Define" (-).
        - Support: "### Issue Summary" (-), "### Root Causes" (1.), "### Troubleshooting Steps" (1.), "### Terms to Define" (-).
        - School: "### Key Concepts" (-), "### Unclear Points" (1.), "### Study Questions" (-), "### Terms to Define" (-).
    - LLM Output: Plain (e.g., "1. Budget tight" under Objections; "- ROI" under Terms). Dynamic from transcript (AI spots "budget" as objection in sales).

- **Parsing** (`parseResponseText` in `summaryService.js`):
    - Detect headings → set currentSection (e.g., "### Objections & Needs" → 'objections').
    - Items:
        -   - bullets under insights/opportunities/strengths/summary/concepts → plain to summary array (max 5, dedup).
        - Numbered (1.) under questions/objections/gaps/causes/points/follow-up/suggested/study/troubleshooting → emoji by section (❓ for questions/probes, ⚠️ for objections/gaps/causes/points, ✅ for troubleshooting/steps) to actions array (max 10, dedup, track sets).
        -   - under terms → `📘 Define ${term}` to actions (filter sentences, dedup set).
    - Fallback: Unknown sections → ❓ actions or plain summary.
    - Like original: No keywords/content checks—emoji by section only (e.g., all under 'objections' get ⚠️).

- **UI** (`SummaryView.js`):
    - Title: Dynamic by profile (e.g., sales_analysis → "Deal Insights"; fallback "Key Insights").
    - Summary: Plain bullets under title.
    - Actions: Emoji-prefixed from parsing (e.g., "⚠️ Budget tight" clickable to Whisper/Ask).
    - Follow-Ups: Static (✉️ Draft email, ✅ Generate actions, 📝 Show summary)—simple, not preset-aware yet.
    - No changes to rendering—handles actions/emojis as before.

- **Flow**:
    1. User selects preset (e.g., 'sales') → `setAnalysisPreset` maps to 'sales_analysis'.
    2. STT utterances → history → analysis trigger.
    3. Prompt: Role + variant rules + transcript → LLM (e.g., sales: generates "Objections: 1. Budget tight" under "### Objections & Needs").
    4. Parsing: "### Objections & Needs" → 'objections' section → numbered → "⚠️ Budget tight" to actions.
    5. Emit to UI: `{ summary: [...], actions: ["⚠️ Budget tight", "❓ Probe next?", "📘 Define ROI"], analysisProfile: 'sales_analysis' }`.
    6. UI: "Deal Insights" title, summary bullets, actions with emojis.

## Testing the Plan

- **Prep**: Seed presets, select one (e.g., 'sales').
- **Live**: Start Listen → Speak convo (e.g., sales pricing talk) → Check `analysis.txt` for variant headings + dynamic content; UI for emoji actions (⚠️ objections, ❓ probes).
- **Mock for Dev**: Temporary in service: Trigger on phrase (e.g., "test sales") → add sample transcript → LLM → parse → UI (verify sections/emojis).
- **Expected Outputs**:
    - Sales: ⚠️ "Budget objection", ❓ "What ROI do you expect?", 📘 "Define CRM".
    - School: ❓ "Study: How does chlorophyll work?", 📘 "Define Photosynthesis".
    - General: ❓ questions, 📘 terms as original.
- **Edge**: User-created raw role → general (❓/📘 only).

## Future Ideas

- Extend follow-ups to be preset-aware (e.g., sales: "Draft objection response" instead of generic email).
- UI: Preset selector in Listen window for mid-session switch.
- More Variants: Add 'creative' or user-kind based (e.g., JSON `kind: 'sales'` → sales_analysis).

This plan keeps the AI dynamic/user-empowered, with minimal changes to achieve tailored, friendly insights.
