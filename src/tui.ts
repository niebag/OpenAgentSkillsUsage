import React, { useEffect, useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import type { AggregateScan, AggregateSkill, Scope } from "./aggregate.js";
import { scanInWorker, type ScanTask } from "./scan.js";

type Scan = (scope: Scope) => ScanTask;

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

export function UsageTui({ initialScope, scan, height = process.stdout.rows ?? 24, onQuit }: {
  initialScope: Scope;
  scan: Scan;
  height?: number;
  onQuit?: () => void;
}): React.JSX.Element {
  const { exit } = useApp();
  const [view, setView] = useState<{ error?: string; loading: boolean; offset: number; result?: AggregateScan; scope: Scope }>({
    loading: true, offset: 0, scope: initialScope
  });
  const scopeRef = useRef(initialScope);
  const scanRef = useRef(0);
  const activeScanRef = useRef<ScanTask | undefined>(undefined);
  const visible = Math.max(1, height - 6);
  const maximum = Math.max(1, ...(view.result?.skills.map((skill) => skill.total) ?? []));
  const rows = view.result?.skills.slice(view.offset, view.offset + visible) ?? [];
  const refresh = (scope: Scope) => {
    const request = ++scanRef.current;
    activeScanRef.current?.cancel();
    scopeRef.current = scope;
    setView({ loading: true, offset: 0, scope });
    const task = scan(scope);
    activeScanRef.current = task;
    void task.result.then((result) => {
      if (scanRef.current === request) {
        activeScanRef.current = undefined;
        setView({ loading: false, offset: 0, result, scope });
      }
    }, () => {
      if (scanRef.current === request) {
        activeScanRef.current = undefined;
        setView({ error: "Scan failed. Press r to retry.", loading: false, offset: 0, scope });
      }
    });
  };
  useEffect(() => {
    refresh(initialScope);
    return () => {
      scanRef.current += 1;
      activeScanRef.current?.cancel();
    };
  }, []);
  const changeScope = (direction: number) => {
    const next = scopes[(scopes.indexOf(scopeRef.current) + direction + scopes.length) % scopes.length];
    refresh(next);
  };

  useInput((input, key) => {
    if (input === "q" || key.escape) { scanRef.current += 1; activeScanRef.current?.cancel(); onQuit?.(); exit(); }
    else if (key.leftArrow) changeScope(-1);
    else if (key.rightArrow) changeScope(1);
    else if (input === "r") refresh(scopeRef.current);
    else if (key.downArrow) setView((current) => ({ ...current, offset: Math.min(current.offset + 1, Math.max(0, (current.result?.skills.length ?? 0) - visible)) }));
    else if (key.upArrow) setView((current) => ({ ...current, offset: Math.max(0, current.offset - 1) }));
    else if (key.pageDown) setView((current) => ({ ...current, offset: Math.min(current.offset + visible, Math.max(0, (current.result?.skills.length ?? 0) - visible)) }));
    else if (key.pageUp) setView((current) => ({ ...current, offset: Math.max(0, current.offset - visible) }));
  });

  return React.createElement(Box, { borderColor: "cyan", borderStyle: "round", flexDirection: "column", paddingX: 1 },
    React.createElement(Box, { justifyContent: "space-between" },
      React.createElement(Text, { bold: true, color: "cyan" }, "Open Agent Skills Usage"),
      React.createElement(Text, { dimColor: true }, view.loading ? "Scanning local Skill usage..." : view.error ?? summary(view.result!))
    ),
    React.createElement(Box, null,
      React.createElement(Text, { dimColor: true }, "Scope  "),
      ...scopes.flatMap((scope) => [
        React.createElement(Text, { bold: scope === view.scope, color: scope === view.scope ? "cyan" : undefined, inverse: scope === view.scope, key: scope }, ` ${scopeLabel(scope)} `),
        React.createElement(Text, { key: `${scope}-space` }, " ")
      ])
    ),
    React.createElement(Text, { dimColor: true }, "SKILL                         USAGE          TOTAL  EXPLICIT AGENT INFERRED"),
    view.loading || view.error ? React.createElement(Text, { dimColor: true }, view.loading ? "Loading..." : view.error) : null,
    ...rows.map((skill) => React.createElement(Text, { key: skill.id },
      `${skill.name.slice(0, 29).padEnd(29)} `,
      React.createElement(Text, { color: skill.total ? "cyan" : undefined, dimColor: !skill.total }, bar(skill, maximum).padEnd(12)),
      React.createElement(Text, { bold: skill.total > 0 }, ` ${String(skill.total).padStart(5)}`),
      ` ${String(skill.byInvocationKind.explicit).padStart(9)} ${String(skill.byInvocationKind.agent).padStart(5)} ${String(skill.byInvocationKind.inferred).padStart(8)}`
    )),
    React.createElement(Text, { dimColor: true }, "←→ scope  ↑↓ scroll  PgUp/PgDn page  r rescan  q/Esc quit")
  );
}

export function startTui(initialScope: Scope): void {
  render(React.createElement(UsageTui, { initialScope, scan: scanInWorker }));
}
