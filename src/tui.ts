import React, { useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import type { AggregateScan, AggregateSkill } from "./aggregate.js";

type Scope = "all" | "codex" | "claude";
type Scan = (scope: Scope) => AggregateScan;

const scopes: Scope[] = ["all", "codex", "claude"];

function scopeLabel(scope: Scope): string {
  return scope === "all" ? "All" : `${scope[0].toUpperCase()}${scope.slice(1)}`;
}

function bar(skill: AggregateSkill, maximum: number): string {
  return skill.total ? "█".repeat(Math.max(1, Math.round(skill.total / maximum * 12))) : "·";
}

function summary(scan: AggregateScan): string {
  const uses = scan.skills.reduce((total, skill) => total + skill.total, 0);
  return `${uses} uses · ${scan.skills.length} skills${scan.warnings.length ? ` · ${scan.warnings.length} warnings` : ""}`;
}

export function UsageTui({ initialScope, initialScan, scan, height = process.stdout.rows ?? 24, onQuit }: {
  initialScope: Scope;
  initialScan: AggregateScan;
  scan: Scan;
  height?: number;
  onQuit?: () => void;
}): React.JSX.Element {
  const { exit } = useApp();
  const [view, setView] = useState({ scope: initialScope, result: initialScan, offset: 0 });
  const scopeRef = useRef(initialScope);
  const visible = Math.max(1, height - 6);
  const maximum = Math.max(1, ...view.result.skills.map((skill) => skill.total));
  const rows = view.result.skills.slice(view.offset, view.offset + visible);
  const changeScope = (direction: number) => {
    const next = scopes[(scopes.indexOf(scopeRef.current) + direction + scopes.length) % scopes.length];
    scopeRef.current = next;
    setView({ scope: next, result: scan(next), offset: 0 });
  };

  useInput((input, key) => {
    if (input === "q" || key.escape) { onQuit?.(); exit(); }
    else if (key.leftArrow) changeScope(-1);
    else if (key.rightArrow) changeScope(1);
    else if (input === "r") setView({ scope: scopeRef.current, result: scan(scopeRef.current), offset: 0 });
    else if (key.downArrow) setView((current) => ({ ...current, offset: Math.min(current.offset + 1, Math.max(0, current.result.skills.length - visible)) }));
    else if (key.upArrow) setView((current) => ({ ...current, offset: Math.max(0, current.offset - 1) }));
    else if (key.pageDown) setView((current) => ({ ...current, offset: Math.min(current.offset + visible, Math.max(0, current.result.skills.length - visible)) }));
    else if (key.pageUp) setView((current) => ({ ...current, offset: Math.max(0, current.offset - visible) }));
  });

  return React.createElement(Box, { borderColor: "cyan", borderStyle: "round", flexDirection: "column", paddingX: 1 },
    React.createElement(Box, { justifyContent: "space-between" },
      React.createElement(Text, { bold: true, color: "cyan" }, "Open Agent Skills Usage"),
      React.createElement(Text, { dimColor: true }, summary(view.result))
    ),
    React.createElement(Box, null,
      React.createElement(Text, { dimColor: true }, "Scope  "),
      ...scopes.flatMap((scope) => [
        React.createElement(Text, { bold: scope === view.scope, color: scope === view.scope ? "cyan" : undefined, inverse: scope === view.scope, key: scope }, ` ${scopeLabel(scope)} `),
        React.createElement(Text, { key: `${scope}-space` }, " ")
      ])
    ),
    React.createElement(Text, { dimColor: true }, "SKILL                         USAGE          TOTAL  EXPLICIT AGENT INFERRED"),
    ...rows.map((skill) => React.createElement(Text, { key: skill.id },
      `${skill.name.slice(0, 29).padEnd(29)} `,
      React.createElement(Text, { color: skill.total ? "cyan" : undefined, dimColor: !skill.total }, bar(skill, maximum).padEnd(12)),
      React.createElement(Text, { bold: skill.total > 0 }, ` ${String(skill.total).padStart(5)}`),
      ` ${String(skill.byInvocationKind.explicit).padStart(9)} ${String(skill.byInvocationKind.agent).padStart(5)} ${String(skill.byInvocationKind.inferred).padStart(8)}`
    )),
    React.createElement(Text, { dimColor: true }, "←→ scope  ↑↓ scroll  PgUp/PgDn page  r rescan  q/Esc quit")
  );
}

export function startTui(initialScope: Scope, initialScan: AggregateScan, scan: Scan): void {
  render(React.createElement(UsageTui, { initialScope, initialScan, scan }));
}
