# Domain docs

How engineering skills should consume this repo's domain documentation.

## Before exploring

- Read root `CONTEXT.md` if it exists.
- Read ADRs relevant to the work from `docs/adr/` if they exist.

If these files do not exist, proceed silently. Create them only when a domain term or architectural decision is actually resolved.

## Layout

This is a single-context repository:

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

Use the vocabulary defined in `CONTEXT.md`. Surface any conflict with an existing ADR rather than silently overriding it.
