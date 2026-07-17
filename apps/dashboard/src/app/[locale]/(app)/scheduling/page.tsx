"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import type { EffectivePlanDto, LocalEventDto, ScheduleAssignmentDto } from "@senvori/contracts";
import { SenvoriApiError } from "@senvori/sdk";
import {
  Badge,
  Button,
  Container,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@senvori/ui";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";

/**
 * Scheduling Runtime area (Sprint 08). Read surfaces for schedule assignments and
 * local events plus a deterministic "resolve" preview: given a unit + local
 * date/time it shows the selected program and the effective plan (base hash +
 * overlays). No audio, no device push — this is the operational timeline only.
 */
const SchedulingPage = () => {
  const t = useTranslations("scheduling");
  const router = useRouter();

  const assignments = useQuery({
    queryKey: ["scheduling", "assignments"],
    queryFn: () => api.scheduling.listAssignments(),
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });
  const events = useQuery({
    queryKey: ["scheduling", "local-events"],
    queryFn: () => api.scheduling.listLocalEvents(),
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });

  const unauthorized =
    (assignments.error instanceof SenvoriApiError && assignments.error.status === 401) ||
    (events.error instanceof SenvoriApiError && events.error.status === 401);
  useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [unauthorized, router]);

  const [unitId, setUnitId] = useState("");
  const [localDate, setLocalDate] = useState("2026-07-15");
  const [localTime, setLocalTime] = useState("12:00");
  const [plan, setPlan] = useState<EffectivePlanDto | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const runResolve = async () => {
    setResolving(true);
    setResolveError(null);
    try {
      const result = await api.scheduling.effectivePlan({
        unitId,
        syncGroupId: null,
        groupIds: [],
        timezone: "America/Sao_Paulo",
        localDate,
        localTime,
      });
      setPlan(result);
    } catch (error) {
      setResolveError(error instanceof SenvoriApiError ? error.problem.title : t("resolve.error"));
      setPlan(null);
    } finally {
      setResolving(false);
    }
  };

  const assignmentRows: ScheduleAssignmentDto[] = assignments.data?.items ?? [];
  const eventRows: LocalEventDto[] = events.data?.items ?? [];

  return (
    <Container>
      <PageHeader title={t("title")} description={t("subtitle")} />

      {/* Resolve preview — the deterministic operational projection. */}
      <section className="mb-8 rounded-lg border border-border p-5" aria-labelledby="resolve-h">
        <h2 id="resolve-h" className="mb-1 text-base font-semibold text-foreground">
          {t("resolve.title")}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">{t("resolve.hint")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="resolve-unit">
              {t("resolve.unit")}
            </label>
            <input
              id="resolve-unit"
              className="h-9 w-72 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              placeholder={t("resolve.unitPlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="resolve-date">
              {t("resolve.date")}
            </label>
            <input
              id="resolve-date"
              type="date"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              value={localDate}
              onChange={(e) => setLocalDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="resolve-time">
              {t("resolve.time")}
            </label>
            <input
              id="resolve-time"
              type="time"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              value={localTime}
              onChange={(e) => setLocalTime(e.target.value)}
            />
          </div>
          <Button onClick={runResolve} disabled={resolving || unitId.trim() === ""}>
            {resolving ? t("resolve.running") : t("resolve.run")}
          </Button>
        </div>

        {resolveError ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {resolveError}
          </p>
        ) : null}

        {plan ? (
          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-live="polite">
            <div>
              <dt className="text-xs text-muted-foreground">{t("resolve.reason")}</dt>
              <dd className="text-sm text-foreground">
                {t(`reason.${plan.resolution.reasonCode}`)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("resolve.selected")}</dt>
              <dd className="text-sm text-foreground">
                {plan.resolution.selectedProgramId ?? t("resolve.none")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("resolve.base")}</dt>
              <dd className="truncate font-mono text-xs text-muted-foreground">
                {plan.basePlanHash ?? t("resolve.none")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("resolve.effective")}</dt>
              <dd className="truncate font-mono text-xs text-muted-foreground">
                {plan.effectivePlanHash}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("resolve.overlays")}</dt>
              <dd className="text-sm text-foreground">{plan.overlays.length}</dd>
            </div>
            {plan.emergencyActive ? (
              <div>
                <dt className="text-xs text-muted-foreground">{t("resolve.status")}</dt>
                <dd>
                  <Badge variant="outline">{t("resolve.emergency")}</Badge>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>

      {/* Assignments */}
      <section className="mb-8" aria-labelledby="assignments-h">
        <h2 id="assignments-h" className="mb-3 text-base font-semibold text-foreground">
          {t("assignments.title")}
        </h2>
        <div aria-live="polite">
          {assignments.isPending ? (
            <p className="text-sm text-muted-foreground">{t("states.loading")}</p>
          ) : assignmentRows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("assignments.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("assignments.col.program")}</TableHead>
                  <TableHead>{t("assignments.col.target")}</TableHead>
                  <TableHead>{t("assignments.col.priority")}</TableHead>
                  <TableHead>{t("assignments.col.window")}</TableHead>
                  <TableHead>{t("assignments.col.active")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignmentRows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.programId.slice(0, 8)}</TableCell>
                    <TableCell>
                      {t(`target.${a.targetType}`)} · {a.targetId.slice(0, 8)}
                    </TableCell>
                    <TableCell>{a.priority}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.startTimeLocal}–{a.endTimeLocal}
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.active ? "default" : "outline"}>
                        {a.active ? t("active.yes") : t("active.no")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {/* Local events */}
      <section aria-labelledby="events-h">
        <h2 id="events-h" className="mb-3 text-base font-semibold text-foreground">
          {t("events.title")}
        </h2>
        <div aria-live="polite">
          {events.isPending ? (
            <p className="text-sm text-muted-foreground">{t("states.loading")}</p>
          ) : eventRows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("events.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("events.col.category")}</TableHead>
                  <TableHead>{t("events.col.kind")}</TableHead>
                  <TableHead>{t("events.col.target")}</TableHead>
                  <TableHead>{t("events.col.window")}</TableHead>
                  <TableHead>{t("events.col.offset")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventRows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Badge variant={e.category === "emergency" ? "outline" : "default"}>
                        {t(`category.${e.category}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>{t(`kind.${e.kind}`)}</TableCell>
                    <TableCell>
                      {t(`target.${e.targetType}`)} · {e.targetId.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.startTimeLocal}–{e.endTimeLocal}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.startOffsetMs / 1000}s
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </Container>
  );
};

export default SchedulingPage;
