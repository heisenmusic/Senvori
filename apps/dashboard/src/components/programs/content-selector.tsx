"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { CatalogItemDto } from "@senvori/contracts";
import { SenvoriApiError } from "@senvori/sdk";
import { Badge, Button } from "@senvori/ui";
import { api } from "@/lib/api";
import { formatClock, formatHoursMinutes, totalDurationMs } from "@/lib/programs";

/** Minimal shape needed to display and persist a selected content item. */
export interface SelectedItem {
  assetId: string;
  title: string;
  artist: string | null;
  durationMs: number | null;
  /** Present for items already in the program; absent when freshly picked (always ready). */
  status?: string;
}

interface ContentSelectorProps {
  selected: SelectedItem[];
  onChange: (next: SelectedItem[]) => void;
}

const ChevronUp = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 16 16"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M4 10l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronDown = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 16 16"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Reusable content picker over the existing Library (Catalog). It never
 * duplicates the Library — it queries ready music tracks via the SDK and lets
 * the user add, remove and reorder them. The compiler only plays ready tracks,
 * so the "available" list is scoped to ready tracks; items that later become
 * unavailable are surfaced (not silently dropped) on the selected side.
 */
export const ContentSelector = ({ selected, onChange }: ContentSelectorProps) => {
  const t = useTranslations("programs.content");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(id);
  }, [qInput]);

  const query = useInfiniteQuery({
    queryKey: ["catalog", "picker", q],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.catalog.listCatalogItems({
        limit: 20,
        cursor: pageParam,
        type: "track",
        status: "ready",
        ...(q ? { q } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.assetId)), [selected]);
  const available: CatalogItemDto[] = query.data?.pages.flatMap((p) => p.items) ?? [];

  const add = (item: CatalogItemDto) => {
    if (selectedIds.has(item.id)) return;
    onChange([
      ...selected,
      {
        assetId: item.id,
        title: item.title,
        artist: null,
        durationMs: item.durationMs,
        status: item.status,
      },
    ]);
  };

  const remove = (assetId: string) => onChange(selected.filter((s) => s.assetId !== assetId));

  const move = (index: number, delta: number) => {
    const next = [...selected];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    onChange(next);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Available in the Library */}
      <section aria-labelledby="cs-available">
        <h3 id="cs-available" className="mb-2 text-sm font-semibold text-foreground">
          {t("available")}
        </h3>
        <label className="sr-only" htmlFor="cs-search">
          {t("search")}
        </label>
        <input
          id="cs-search"
          type="search"
          className="mb-3 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          placeholder={t("search")}
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <div aria-live="polite">
          {query.isPending ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("loadMore")}
            </p>
          ) : query.isError ? (
            <div className="flex flex-col items-start gap-2" role="alert">
              <p className="text-sm text-danger">{t("error")}</p>
              <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
                {t("cancel")}
              </Button>
            </div>
          ) : available.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {available.map((item) => {
                const picked = selectedIds.has(item.id);
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {item.title || t("empty")}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatClock(item.durationMs)}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={picked}
                        onClick={() => add(item)}
                      >
                        {picked ? t("selected") : t("add")}
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {query.hasNextPage ? (
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                {t("loadMore")}
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Selected in this program */}
      <section aria-labelledby="cs-selected">
        <h3 id="cs-selected" className="mb-2 text-sm font-semibold text-foreground">
          {t("selected")}
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">{t("onlyReady")}</p>
        {selected.length === 0 ? (
          <p
            className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
            role="status"
          >
            {t("empty")}
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {selected.map((item, index) => {
              const unavailable = item.status !== undefined && item.status !== "ready";
              return (
                <li
                  key={item.assetId}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {item.title || t("empty")}
                    </span>
                    {unavailable ? <Badge variant="danger">{t("unavailable")}</Badge> : null}
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("moveUp")}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("moveDown")}
                      disabled={index === selected.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ChevronDown />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(item.assetId)}>
                      {t("remove")}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {t("totalDuration", { duration: formatHoursMinutes(totalDurationMs(selected)) })}
        </p>
      </section>
    </div>
  );
};
