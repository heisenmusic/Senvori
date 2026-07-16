"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { UnitDto } from "@senvori/contracts";
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

type StatusFilter = "" | "active" | "paused" | "archived";

const statusVariant = (s: string) =>
  s === "active" ? "success" : s === "archived" ? "danger" : "neutral";

const UnitsPage = () => {
  const t = useTranslations("units");
  const router = useRouter();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");

  // Debounce the search box so we don't fire a request on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(id);
  }, [qInput]);

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
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });

  const status401 = query.error instanceof SenvoriApiError && query.error.status === 401;
  const status403 = query.error instanceof SenvoriApiError && query.error.status === 403;

  // An expired/invalid session (401) sends the user back to sign in.
  useEffect(() => {
    if (status401) router.replace("/login");
  }, [status401, router]);

  const units: UnitDto[] = query.data?.pages.flatMap((p) => p.items) ?? [];
  const isFiltering = q !== "" || status !== "";

  const renderBody = () => {
    if (query.isPending || status401) {
      return (
        <p className="text-sm text-muted-foreground" role="status">
          {t("loading")}
        </p>
      );
    }
    if (status403) {
      return (
        <p className="text-sm text-muted-foreground" role="status">
          {t("noPermission")}
        </p>
      );
    }
    if (query.isError) {
      return (
        <div className="flex flex-col items-start gap-3" role="alert">
          <p className="text-sm text-danger">{t("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      );
    }
    if (units.length === 0) {
      return (
        <p className="text-sm text-muted-foreground" role="status">
          {isFiltering ? t("noResults") : t("empty")}
        </p>
      );
    }
    return (
      <>
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
        {query.hasNextPage ? (
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? t("loading") : t("loadMore")}
            </Button>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <Container>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="mb-4 flex flex-wrap gap-3" role="search">
        <label className="sr-only" htmlFor="units-search">
          {t("search")}
        </label>
        <input
          id="units-search"
          type="search"
          className="h-9 w-64 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          placeholder={t("search")}
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <label className="sr-only" htmlFor="units-status">
          {t("filterStatus")}
        </label>
        <select
          id="units-status"
          aria-label={t("filterStatus")}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="">{t("status.all")}</option>
          <option value="active">{t("status.active")}</option>
          <option value="paused">{t("status.paused")}</option>
          <option value="archived">{t("status.archived")}</option>
        </select>
      </div>

      <div aria-live="polite">{renderBody()}</div>
    </Container>
  );
};

export default UnitsPage;
