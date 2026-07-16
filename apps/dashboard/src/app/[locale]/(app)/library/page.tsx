"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { AUDIO_CONTENT_TYPES, type CatalogItemDto } from "@senvori/contracts";
import { SenvoriApiError } from "@senvori/sdk";
import { Badge, Button, Container, Input, Label, PageHeader } from "@senvori/ui";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";

type StatusFilter = "" | "uploading" | "processing" | "ready" | "failed" | "archived";
type TypeFilter = "" | "track" | "announcement";

const statusVariant = (s: string) =>
  s === "ready" ? "success" : s === "failed" ? "danger" : s === "archived" ? "neutral" : "default";

const sha256Hex = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const contentTypeFor = (file: File): string | null => {
  if (file.type in AUDIO_CONTENT_TYPES) return file.type;
  const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  const match = Object.entries(AUDIO_CONTENT_TYPES).find(([, exts]) => exts.includes(ext));
  return match ? match[0] : null;
};

const formatDuration = (ms: number | null): string => {
  if (!ms) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const LibraryPage = () => {
  const t = useTranslations("library");
  const router = useRouter();
  const queryClient = useQueryClient();

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState<TypeFilter>("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(id);
  }, [qInput]);

  const query = useInfiniteQuery({
    queryKey: ["catalog", q, type, status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.catalog.listCatalogItems({
        limit: 24,
        cursor: pageParam,
        ...(q ? { q } : {}),
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });

  const items: CatalogItemDto[] = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  // Keep polling while anything is still being prepared.
  const anyPreparing = items.some((i) => i.status === "processing" || i.status === "uploading");
  useEffect(() => {
    if (!anyPreparing) return;
    const id = setInterval(() => void query.refetch(), 3000);
    return () => clearInterval(id);
  }, [anyPreparing, query]);

  const status401 = query.error instanceof SenvoriApiError && query.error.status === 401;
  const status403 = query.error instanceof SenvoriApiError && query.error.status === 403;
  useEffect(() => {
    if (status401) router.replace("/login");
  }, [status401, router]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["catalog"] });
  const isFiltering = q !== "" || type !== "" || status !== "";

  const download = async (id: string) => {
    try {
      const ticket = await api.catalog.downloadUrl(id);
      window.open(ticket.url, "_blank", "noopener");
    } catch {
      /* surfaced by the list error state on next refetch */
    }
  };

  const reprocess = async (id: string) => {
    try {
      await api.catalog.reprocessCatalogItem(id);
      refresh();
    } catch {
      /* ignore; state refetch will reflect */
    }
  };

  return (
    <Container>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <Button onClick={() => setShowUpload((v) => !v)}>{t("add")}</Button>
      </div>

      {showUpload ? (
        <UploadPanel
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            refresh();
          }}
        />
      ) : null}

      <div className="mb-4 mt-4 flex flex-wrap gap-3" role="search">
        <label className="sr-only" htmlFor="lib-search">
          {t("search")}
        </label>
        <input
          id="lib-search"
          type="search"
          className="h-9 w-64 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          placeholder={t("search")}
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <label className="sr-only" htmlFor="lib-type">
          {t("filterType")}
        </label>
        <select
          id="lib-type"
          aria-label={t("filterType")}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          value={type}
          onChange={(e) => setType(e.target.value as TypeFilter)}
        >
          <option value="">{t("type.all")}</option>
          <option value="track">{t("type.track")}</option>
          <option value="announcement">{t("type.announcement")}</option>
        </select>
        <label className="sr-only" htmlFor="lib-status">
          {t("filterStatus")}
        </label>
        <select
          id="lib-status"
          aria-label={t("filterStatus")}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="">{t("status.all")}</option>
          <option value="processing">{t("status.processing")}</option>
          <option value="ready">{t("status.ready")}</option>
          <option value="failed">{t("status.failed")}</option>
          <option value="archived">{t("status.archived")}</option>
        </select>
      </div>

      <div aria-live="polite">
        {query.isPending || status401 ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("loading")}
          </p>
        ) : status403 ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("noPermission")}
          </p>
        ) : query.isError ? (
          <div className="flex flex-col items-start gap-3" role="alert">
            <p className="text-sm text-danger">{t("error")}</p>
            <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-border p-10 text-center"
            role="status"
          >
            <p className="text-sm font-medium text-foreground">
              {isFiltering ? t("noResults") : t("empty")}
            </p>
            {!isFiltering ? (
              <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {item.title || t("item.untitled")}
                    </span>
                    <Badge variant={statusVariant(item.status)}>{t(`status.${item.status}`)}</Badge>
                  </div>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <div className="flex gap-1">
                      <dt className="sr-only">{t("filterType")}</dt>
                      <dd>{t(`type.${item.type}`)}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="sr-only">{t("item.duration")}</dt>
                      <dd>{formatDuration(item.durationMs)}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="sr-only">{t("item.origin")}</dt>
                      <dd>{t(`origin.${item.origin}`)}</dd>
                    </div>
                  </dl>
                  <div className="mt-1 flex gap-2">
                    {item.status === "ready" ? (
                      <Button variant="secondary" size="sm" onClick={() => download(item.id)}>
                        {t("item.download")}
                      </Button>
                    ) : null}
                    {item.status === "failed" ? (
                      <Button variant="secondary" size="sm" onClick={() => reprocess(item.id)}>
                        {t("item.retry")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
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
        )}
      </div>
    </Container>
  );
};

/** Progressive upload: pick a file, confirm essential fields, send. */
const UploadPanel = ({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) => {
  const t = useTranslations("library");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"track" | "announcement">("track");
  const [language, setLanguage] = useState("pt-BR");
  const [origin, setOrigin] = useState("BR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = (f: File | null) => {
    setFile(f);
    setError(null);
    if (f && !title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, ""));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const contentType = contentTypeFor(file);
    if (!contentType) {
      setError(t("upload.invalidType"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const checksumSha256 = await sha256Hex(buffer);
      await api.catalog.uploadFile(
        {
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
          checksumSha256,
          type,
          title: title || undefined,
          language,
          originCountry: origin,
        },
        buffer,
      );
      onUploaded();
    } catch {
      setError(t("upload.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-4 flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="up-file">{t("form.file")}</Label>
        <input
          ref={fileRef}
          id="up-file"
          type="file"
          accept="audio/*"
          required
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          className="text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-0"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="up-title">{t("form.title")}</Label>
          <Input id="up-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="up-type">{t("form.type")}</Label>
          <select
            id="up-type"
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            value={type}
            onChange={(e) => setType(e.target.value as "track" | "announcement")}
          >
            <option value="track">{t("type.track")}</option>
            <option value="announcement">{t("type.announcement")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="up-language">{t("form.language")}</Label>
          <select
            id="up-language"
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="pt-BR">{t("language.ptBR")}</option>
            <option value="en-US">{t("language.enUS")}</option>
            <option value="es-ES">{t("language.esES")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="up-origin">{t("form.origin")}</Label>
          <select
            id="up-origin"
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            <option value="BR">{t("country.BR")}</option>
            <option value="US">{t("country.US")}</option>
          </select>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !file}>
          {busy ? t("form.sending") : t("form.submit")}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {t("form.cancel")}
        </Button>
      </div>
    </form>
  );
};

export default LibraryPage;
