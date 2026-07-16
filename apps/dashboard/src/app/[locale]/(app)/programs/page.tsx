"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ProgramDto } from "@senvori/contracts";
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
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { formatDateTime, programStatusVariant } from "@/lib/programs";

type StatusFilter = "" | "draft" | "published" | "archived";

const ProgramsPage = () => {
  const t = useTranslations("programs");
  const locale = useLocale();
  const router = useRouter();

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");

  // Debounce search so a request doesn't fire on every keystroke (§24).
  useEffect(() => {
    const id = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(id);
  }, [qInput]);

  const query = useInfiniteQuery({
    queryKey: ["programs", q, status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.programming.listPrograms(
        {
          limit: 20,
          cursor: pageParam,
          ...(q ? { q } : {}),
          ...(status ? { status } : {}),
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });

  const status401 = query.error instanceof SenvoriApiError && query.error.status === 401;
  const status403 = query.error instanceof SenvoriApiError && query.error.status === 403;

  useEffect(() => {
    if (status401) router.replace("/login");
  }, [status401, router]);

  const programs: ProgramDto[] = query.data?.pages.flatMap((p) => p.items) ?? [];
  const isFiltering = q !== "" || status !== "";

  const renderBody = () => {
    if (query.isPending || status401) {
      return (
        <p className="text-sm text-muted-foreground" role="status">
          {t("list.loading")}
        </p>
      );
    }
    if (status403) {
      return (
        <p className="text-sm text-muted-foreground" role="status">
          {t("states.noPermission")}
        </p>
      );
    }
    if (query.isError) {
      return (
        <div className="flex flex-col items-start gap-3" role="alert">
          <p className="text-sm text-danger">{t("list.error")}</p>
          <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
            {t("states.retry")}
          </Button>
        </div>
      );
    }
    if (programs.length === 0) {
      return (
        <div
          className="rounded-lg border border-dashed border-border p-10 text-center"
          role="status"
        >
          <p className="text-sm font-medium text-foreground">
            {isFiltering ? t("list.noResults") : t("list.empty")}
          </p>
          {!isFiltering ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("list.emptyHint")}</p>
          ) : null}
        </div>
      );
    }
    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("list.col.name")}</TableHead>
              <TableHead>{t("list.col.status")}</TableHead>
              <TableHead>{t("list.col.content")}</TableHead>
              <TableHead>{t("list.col.version")}</TableHead>
              <TableHead>{t("list.col.updated")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("list.open")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {programs.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  <Badge variant={programStatusVariant(p.status)}>{t(`status.${p.status}`)}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t("count.items", { count: p.itemCount })}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.publishedVersion ? t("count.version", { n: p.publishedVersion }) : t("none")}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(p.updatedAt, locale)}
                </TableCell>
                <TableCell className="text-end">
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/programs/${p.id}`}>{t("list.open")}</Link>
                  </Button>
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
              {query.isFetchingNextPage ? t("states.loading") : t("list.loadMore")}
            </Button>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <Container>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <div className="pt-10">
          <Button asChild>
            <Link href="/programs/new">{t("new")}</Link>
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3" role="search">
        <label className="sr-only" htmlFor="programs-search">
          {t("list.search")}
        </label>
        <input
          id="programs-search"
          type="search"
          className="h-9 w-64 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          placeholder={t("list.search")}
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <label className="sr-only" htmlFor="programs-status">
          {t("list.filterStatus")}
        </label>
        <select
          id="programs-status"
          aria-label={t("list.filterStatus")}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="">{t("status.all")}</option>
          <option value="draft">{t("status.draft")}</option>
          <option value="published">{t("status.published")}</option>
          <option value="archived">{t("status.archived")}</option>
        </select>
      </div>

      <div aria-live="polite">{renderBody()}</div>
    </Container>
  );
};

export default ProgramsPage;
