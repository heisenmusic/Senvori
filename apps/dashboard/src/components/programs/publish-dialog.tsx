"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProgramDto, ProgramVersionDto } from "@senvori/contracts";
import { SenvoriApiError } from "@senvori/sdk";
import { Button } from "@senvori/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/programs";

interface PublishDialogProps {
  program: ProgramDto;
  onClose: () => void;
  onPublished: (version: ProgramVersionDto) => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Publish confirmation (§17). A conscious, accessible action: modal dialog with
 * a focus trap, Escape-to-close, focus restoration, and a review summary before
 * an immutable publish. Copy never implies the version was sent to a Player.
 */
export const PublishDialog = ({ program, onClose, onPublished }: PublishDialogProps) => {
  const t = useTranslations("programs.publish");
  const locale = useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const policy = useQuery({
    queryKey: ["rotation-policy"],
    queryFn: () => api.programming.getRotationPolicy(),
    retry: false,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.identity.me(), retry: false });

  const mutation = useMutation<ProgramVersionDto, unknown, void>({
    mutationFn: () => api.programming.publish(program.id),
    onSuccess: (version) => onPublished(version),
  });

  // Focus trap + Escape, with focus save/restore (§21).
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [onClose]);

  const insufficient =
    mutation.error instanceof SenvoriApiError &&
    mutation.error.problem.code === "INSUFFICIENT_CATALOG";

  const rulesSummary = policy.data
    ? t("rulesSummary", {
        track: policy.data.minTrackGapMinutes,
        artist: policy.data.minArtistGapMinutes,
      })
    : "—";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pub-title"
        aria-describedby="pub-subtitle"
        className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg"
      >
        <h2 id="pub-title" className="text-lg font-semibold text-foreground">
          {t("title")}
        </h2>
        <p id="pub-subtitle" className="mt-1 text-sm text-muted-foreground">
          {t("subtitle")}
        </p>

        <dl className="mt-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("summaryName")}</dt>
            <dd className="text-end font-medium text-foreground">{program.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("summaryContent")}</dt>
            <dd className="text-end font-medium text-foreground tabular-nums">
              {program.itemCount}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("summaryRules")}</dt>
            <dd className="text-end text-foreground">{rulesSummary}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{me.data?.user.name ?? "—"}</dt>
            <dd className="text-end text-muted-foreground">
              {formatDateTime(new Date().toISOString(), locale)}
            </dd>
          </div>
        </dl>

        <div aria-live="polite">
          {mutation.isError ? (
            <p className="mt-4 text-sm text-danger" role="alert">
              {insufficient ? t("noContent") : t("error")}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t("cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? t("publishing") : t("confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
};
