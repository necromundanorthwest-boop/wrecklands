# Contributing to WRECKLANDS

Thanks for helping improve WRECKLANDS: SCRAP RUN.

## Before opening a change

Please check the existing issues and the authoritative documents in `specs/`.
The current MVP deliberately separates:

- rules and server authority;
- rendering/presentation;
- multiplayer transport;
- data/content.

Preserve those boundaries unless a proposed architecture change explains why they are insufficient.

## Development setup

```bash
npm ci
npm test
npm start
```

For browser regression tests:

```bash
npx playwright install chromium
npm run test:browser
npm run test:clarifications
npm run test:corrections
npm run test:phase2
npm run test:phase3
```

## Pull requests

Keep pull requests narrow. In particular, avoid mixing gameplay-rule changes with presentation cleanup.

A useful PR should include:

1. a concise problem statement;
2. the smallest proposed change;
3. tests for changed behavior;
4. confirmation that authoritative state remains server-side;
5. documentation updates when user-visible behavior changes.

## Gameplay changes

The existing rules are versioned by the specification and clarification documents in `specs/`. New mechanics should begin as a proposal/issue rather than an undocumented code change.

Do not silently reinterpret approved movement, Ram/contact, Risk, Boarding, victory, or duplicate-action behavior.

## Content additions

Keep new content data-driven where possible. Validate IDs, references, ranges, and coordinates. Avoid third-party copyrighted assets, logos, copied rules text, or distinctive branded material.

## Licensing

By contributing code or documentation, you agree that your contribution may be distributed under the repository's MIT License. Contributions of original visual assets should be clearly identified and are expected to be compatible with CC BY 4.0 unless otherwise agreed before merge.
