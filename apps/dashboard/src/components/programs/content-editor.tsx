"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProgramDto } from "@senvori/contracts";
import { SenvoriApiError } from "@senvori/sdk";
import { Badge, Button } from "@senvori/ui";
import { api } from "@/lib/api";
import { ContentSelector, type SelectedItem } from "./content-selector";
import { formatClock, formatHoursMinutes, totalDurationMs } from "@/lib/programs";

interface ContentEditorProps {
  program: ProgramDto;
  /** Archived programs are read-only. */
  editable: boolean;
  onSaved: () => void;
}

/**
 * Detail content section: shows the current ordered content read-only, and (for
 * editable programs) opens the shared {@link ContentSelector} to add, remove and
 * reorder, persisting via `setItems`. Editing a published program takes effect
 * on the next published version — the current version is never mutated.
 */
export const ContentEditor = ({ program, editable, onSaved }: ContentEditorProps) => {
  const t = useTranslations("programs.content");
  const ts = useTranslations("programs.states");
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["program-items", program.id],
    queryFn: () => api.programming.listItems(program.id),
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SelectedItem[]>([]);

  const startEditing = () => {
    setDraft(
      (query.data ?? []).map((i) => ({
        assetId: i.assetId,
        title: i.title,
        artist: i.artist,
        durationMs: i.durationMs,
        status: i.status,
      })),
    );
    setEditing(true);
  };

  const mutation = useMutation<ProgramDto, unknown, void>({
    mutationFn: () =>
      api.programming.setItems(program.id, { assetIds: draft.map((d) => d.assetId) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["program-items", program.id] });
      await queryClient.invalidateQueries({ queryKey: ["program", program.id] });
      setEditing(false);
      onSaved();
    },
  });

  if (query.isPending) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {ts("loading")}
      </p>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-2" role="alert">
        <p className="text-sm text-danger">{t("error")}</p>
        <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
          {t("cancel")}
        </Button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <ContentSelector selected={draft} onChange={setDraft} />
        {mutation.isError ? (
          <p className="text-sm text-danger" role="alert">
            {t("error")}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? t("save") + "…" : t("save")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setEditing(false)}
            disabled={mutation.isPending}
          >
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  const items = query.data;
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {items.map((item, index) => {
            const unavailable = item.status !== "ready";
            return (
              <li
                key={item.assetId}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 truncate text-sm text-foreground">
                    {item.title || t("empty")}
                  </span>
                  {item.artist ? (
                    <span className="truncate text-xs text-muted-foreground">{item.artist}</span>
                  ) : null}
                  {unavailable ? <Badge variant="danger">{t("unavailable")}</Badge> : null}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatClock(item.durationMs)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">
        {t("totalDuration", { duration: formatHoursMinutes(totalDurationMs(items)) })}
      </p>
      {editable ? (
        <div>
          <Button variant="secondary" size="sm" onClick={startEditing}>
            {t("edit")}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
