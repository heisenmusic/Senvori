"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { UnitDto } from "@senvori/contracts";
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
import { api } from "@/lib/api";

type StatusFilter = "" | "active" | "paused" | "archived";

const statusVariant = (s: string) =>
  s === "active" ? "success" : s === "archived" ? "danger" : "neutral";

const UnitsPage = () => {
  const t = useTranslations("units");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");

  const query = useInfiniteQuery({
    queryKey: ["units", q, status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.tenancy.units({
        limit: 20,
        cursor: pageParam,
        ...(q ? { q } : {}),
        ...(status ? { status } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const units: UnitDto[] = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Container>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="h-9 w-64 rounded-md border border-border bg-background px-3 text-sm text-foreground"
          placeholder={t("search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="">{t("status.all")}</option>
          <option value="active">{t("status.active")}</option>
          <option value="paused">{t("status.paused")}</option>
          <option value="archived">{t("status.archived")}</option>
        </select>
      </div>

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : units.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col.name")}</TableHead>
              <TableHead>{t("col.country")}</TableHead>
              <TableHead>{t("col.timezone")}</TableHead>
              <TableHead>{t("col.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.countryCode}</TableCell>
                <TableCell className="text-muted-foreground">{u.timezone}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(u.status)}>{t(`status.${u.status}`)}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {query.hasNextPage ? (
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </Container>
  );
};

export default UnitsPage;
