"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ExecutionPlanDto, PreviewRequestInput } from "@senvori/contracts";
import { SenvoriApiError } from "@senvori/sdk";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@senvori/ui";
import { api } from "@/lib/api";
import {
  formatClock,
  formatHoursMinutes,
  itemClock,
  shortHash,
  todayLocalISODate,
  warningKey,
} from "@/lib/programs";

interface PreviewPanelProps {
  programId: string;
  /** When set, preview a published version's frozen content instead of the draft. */
  versionId?: string;
}

const browserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/**
 * Day preview (§16) — the primary visual deliverable. The user picks a unit
 * (which sets the timezone and the deterministic variation), a date and a
 * window, then generates a plan that is shown as an accessible chronological
 * table with translated warnings. Nothing is persisted (ephemeral preview).
 */
export const PreviewPanel = ({ programId, versionId }: PreviewPanelProps) => {
  const t = useTranslations("programs.preview");
  const locale = useLocale();

  const unitsQuery = useQuery({
    queryKey: ["units", "for-preview"],
    queryFn: () => api.tenancy.units({ limit: 100 }),
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });
  const units = unitsQuery.data?.items ?? [];

  const [unitId, setUnitId] = useState<string>("");
  const selectedUnit = units.find((u) => u.id === unitId);
  const timezone = selectedUnit?.timezone ?? browserTimezone();

  const [localDate, setLocalDate] = useState<string>(() => todayLocalISODate(undefined));
  const [windowStart, setWindowStart] = useState("00:00");
  const [windowEnd, setWindowEnd] = useState("24:00");

  const preview = useMutation<ExecutionPlanDto, unknown, PreviewRequestInput>({
    mutationFn: (input) => api.programming.preview(programId, input),
  });

  const generate = () => {
    preview.mutate({
      ...(versionId ? { versionId } : {}),
      ...(unitId ? { unitId } : {}),
      timezone,
      localDate,
      windowStartLocal: windowStart,
      windowEndLocal: windowEnd,
    });
  };

  const plan = preview.data;
  const errorMessage = useMemo(() => {
    if (!preview.isError) return null;
    return t("error");
  }, [preview.isError, t]);

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="pv-unit">
            {t("unit")}
          </label>
          <select
            id="pv-unit"
            aria-describedby="pv-unit-hint"
            className="h-9 min-w-56 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">{t("unitNone")}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <span id="pv-unit-hint" className="text-xs text-muted-foreground">
            {t("unitHint")}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="pv-date">
            {t("date")}
          </label>
          <input
            id="pv-date"
            type="date"
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            value={localDate}
            onChange={(e) => setLocalDate(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="pv-start">
            {t("windowStart")}
          </label>
          <input
            id="pv-start"
            type="time"
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            value={windowStart}
            onChange={(e) => setWindowStart(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="pv-end">
            {t("windowEnd")}
          </label>
          <input
            id="pv-end"
            type="time"
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            value={windowEnd}
            onChange={(e) => setWindowEnd(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{t("timezone")}</span>
          <span className="flex h-9 items-center text-sm text-muted-foreground">{timezone}</span>
        </div>

        <Button type="submit" disabled={preview.isPending}>
          {preview.isPending ? t("generating") : plan ? t("regenerate") : t("generate")}
        </Button>
      </form>

      <div aria-live="polite" aria-busy={preview.isPending}>
        {preview.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("generating")}
          </p>
        ) : errorMessage ? (
          <div className="flex flex-col items-start gap-3" role="alert">
            <p className="text-sm text-danger">{errorMessage}</p>
            <Button variant="secondary" size="sm" onClick={generate}>
              {t("regenerate")}
            </Button>
          </div>
        ) : !plan ? (
          <p
            className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
            role="status"
          >
            {t("empty")}
          </p>
        ) : (
          <PlanResult plan={plan} timezone={timezone} locale={locale} />
        )}
      </div>
    </div>
  );
};

const PlanResult = ({
  plan,
  timezone,
  locale,
}: {
  plan: ExecutionPlanDto;
  timezone: string;
  locale: string;
}) => {
  const t = useTranslations("programs.preview");

  return (
    <div className="flex flex-col gap-4">
      {plan.warnings.length > 0 ? (
        <section
          aria-labelledby="pv-warnings"
          className="rounded-lg border border-warning/40 bg-warning/10 p-4"
        >
          <h3 id="pv-warnings" className="mb-2 text-sm font-semibold text-foreground">
            {t("warningsTitle")}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {plan.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`} className="text-sm text-foreground">
                {t(`warnings.${warningKey(w.code)}`)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="font-semibold text-foreground">{t("resultTitle")}</span>
        <span className="text-muted-foreground">
          {t("totalItems", { count: plan.stats.itemCount })}
        </span>
        <span className="text-muted-foreground">
          {t("totalDuration", { duration: formatHoursMinutes(plan.totalDurationMs) })}
        </span>
        <span className="text-muted-foreground">{plan.timezone}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span>{t("identifier")}</span>
          <span title={plan.planHash} className="font-mono text-xs">
            {shortHash(plan.planHash)}
          </span>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t("identifierHint")}</p>

      {plan.items.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("empty")}
        </p>
      ) : (
        <Table>
          <caption className="sr-only">{t("resultTitle")}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("col.time")}</TableHead>
              <TableHead scope="col">{t("col.title")}</TableHead>
              <TableHead scope="col">{t("col.artist")}</TableHead>
              <TableHead scope="col">{t("col.duration")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plan.items.map((item) => {
              const isSilence = item.assetId === null;
              return (
                <TableRow key={item.position}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {itemClock(plan.windowStartUtc, item.startOffsetMs, timezone, locale)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {isSilence ? (
                      <Badge variant="neutral">{t("silence")}</Badge>
                    ) : (
                      item.title || t("untitled")
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.artist ?? "—"}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatClock(item.durationMs)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
};
