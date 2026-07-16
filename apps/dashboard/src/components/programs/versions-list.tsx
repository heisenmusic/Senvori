"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
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
import { formatDateTime, shortHash } from "@/lib/programs";

/**
 * Version history (§18). Each publish is an immutable, recorded version. The
 * plan hash is never shown raw — it is abbreviated with an explanatory hint.
 * The publisher id is resolved to a member name when available.
 */
export const VersionsList = ({ programId }: { programId: string }) => {
  const t = useTranslations("programs.versions");
  const ts = useTranslations("programs.states");
  const locale = useLocale();

  const query = useQuery({
    queryKey: ["program-versions", programId],
    queryFn: () => api.programming.listVersions(programId),
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });

  // Best-effort id → name map for the "published by" column (optional).
  const members = useQuery({
    queryKey: ["members", "for-versions"],
    queryFn: () => api.identity.members(),
    retry: false,
  });
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members.data ?? []) map.set(m.user.id, m.user.name);
    return map;
  }, [members.data]);

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
          {t("view")}
        </Button>
      </div>
    );
  }

  const versions = query.data.items;
  if (versions.length === 0) {
    return (
      <p
        className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
        role="status"
      >
        {t("empty")}
      </p>
    );
  }

  return (
    <Table>
      <caption className="sr-only">{t("title")}</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("col.version")}</TableHead>
          <TableHead scope="col">{t("col.date")}</TableHead>
          <TableHead scope="col">{t("col.author")}</TableHead>
          <TableHead scope="col">{t("col.items")}</TableHead>
          <TableHead scope="col">{t("col.identifier")}</TableHead>
          <TableHead scope="col">{t("col.compiler")}</TableHead>
          <TableHead scope="col">
            <span className="sr-only">{t("immutable")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {versions.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="font-medium tabular-nums">{v.version}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatDateTime(v.resolvedAt, locale)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {(v.publishedBy && nameById.get(v.publishedBy)) ?? "—"}
            </TableCell>
            <TableCell className="tabular-nums text-muted-foreground">
              {v.resolvedItems.length}
            </TableCell>
            <TableCell>
              <span title={v.planHash ?? undefined} className="font-mono text-xs text-foreground">
                {shortHash(v.planHash)}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground">{v.compilerVersion ?? "—"}</TableCell>
            <TableCell>
              <Badge variant="neutral">{t("immutable")}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
