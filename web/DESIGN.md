# Visual Design Contract

`AGENTS.md` is the canonical statement of the blank-canvas rule — check
`app/routes/_index.tsx` and `app/global.css`, preserve any real UI/brand
already there, and only treat the canvas as blank when those files still show
the starter's placeholder. This file does not restate that rule; it records
**this app's** visual direction. The fields below are the source of truth for
that direction: once filled in, read and preserve them on every build; while
they are still empty, the first substantial UI pass fills them in.

## Non-negotiable: impress by default

When this app is still a blank canvas, every app generated from this template
must look **spectacular on first load**, even when the build prompt gives no
design direction. "Looks like a clean, intentional product" is the floor, not
the goal. When no direction is supplied, you still commit to one — do not
default to safe gray SaaS:

- Commit to one concrete visual world (see the `frontend-design` skill and its
  `references/visual-direction.md`). Do not ship the neutral placeholder theme.
- Choose a product-fitting accent family and set it in the `app/global.css`
  tokens for **both** light and dark. Never leave the 0%-saturation default as
  the shipped palette.
- Establish a clear type hierarchy, a consistent spacing rhythm, and one
  signature detail (a considered empty state, a distinctive header, a crafted
  primary action) that makes the surface feel designed for its domain.
- Get focus, hover, empty, loading, and dark-mode states right — that polish is
  the difference between an AI demo and a product.

Pick a direction and execute it fully; never average toward generic SaaS. Once
a direction is established and recorded below, preserve and extend it rather
than starting over unless otherwise directed to.

## Fill in before building the first surface

Once the fields below are filled in, they describe this app's established
visual direction — read and preserve them on every subsequent build; do not
re-derive a new direction. The first UI pass must fill these fields in as
part of that build, not leave them as an empty template.

- Product mode: `operate`
- Audience and cadence: Owners and front-desk staff of appointment-based businesses, checking today's schedule several times a day and booking or cancelling as calls come in.
- Visual world (name + the feeling it creates): "Front desk ledger" — a calm, well-kept appointment book. Quiet paper-like surfaces, precise times, and one teal accent that marks what is live.
- Palette family + neutral undertone: Deep teal accent (hue ~199) over cool slate neutrals (hue ~215 to 222) in light and dark. Success uses a muted green token; warning uses an amber token.
- Type treatment: Inter Variable. Semibold page titles with tight tracking, small uppercase eyebrow labels, and tabular numerals for times and counts.
- Composition: Fixed left sidebar grouped as Business, AI assistant, and Admin, with unbuilt modules marked "Soon". A top bar carries the page title, the assistant toggle, and the account menu. Content sits in a max-width column. The overview uses a stat row, a status bar, then two-column lists.
- Shape language: 0.5rem radius on cards and controls, 1px borders instead of heavy shadows, and pills only for status badges and the avatar.
- Anti-references (defaults this app must not drift toward): gradient hero blobs, glassmorphism panels, neon or purple "AI" styling, sparkle icons used as decoration, invented analytics charts, and generic gray SaaS templates.

## Agent-Native is structural, not visual

This shell already meets the Agent-Native contract: data in SQL, actions as the
single source of truth, application state for navigation/selection, and
real-time sync. **Chat and the agent rail are opt-in, not default.** Build the
product UI first. Add an `AgentSidebar`, a full-page chat route, or
`sendToAgentChat` handoffs only when the user asks for agent interaction — and
when you do, follow `agent-native-toolkit` and `frontend-design` → Agent
Surface And Page Boundaries so the surfaces are wired correctly.

## Guardrails

- Keep semantic token names and shared component seams intact; express the
  direction through token _values_, type, spacing, and composition — not by
  forking the design system.
- Density comes from data, not prose. Subtract explanatory chrome; never
  subtract the visual craft that makes the app impressive.
- Compare against real products in the chosen mode, not against the starter.
