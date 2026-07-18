"use client";

import { use, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlayerDeviceDetail, PlayerPlaybackEventRecord } from "@senvori/contracts";
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

const statusVariant = (s: string) =>
  s === "active" ? "success" : s === "decommissioned" ? "danger" : "neutral";

const DeviceDetailPage = ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = use(params);
  const t = useTranslations("devices");
  const router = useRouter();
  const queryClient = useQueryClient();

  const device = useQuery({
    queryKey: ["fleet", "device", id],
    queryFn: () => api.fleet.getDevice(id),
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });
  const events = useQuery({
    queryKey: ["fleet", "device", id, "events"],
    queryFn: () => api.fleet.playbackEvents(id),
    enabled: device.isSuccess,
  });

  const status401 = device.error instanceof SenvoriApiError && device.error.status === 401;
  useEffect(() => {
    if (status401) router.replace("/login");
  }, [status401, router]);

  const revoke = useMutation({
    mutationFn: () => api.fleet.revokeDevice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fleet", "device", id] });
      queryClient.invalidateQueries({ queryKey: ["fleet", "devices"] });
    },
  });

  const back = (
    <Link href="/devices" className="text-sm text-brand-600 hover:underline">
      {t("detail.back")}
    </Link>
  );

  if (device.isPending) {
    return (
      <Container>
        {back}
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {t("detail.loading")}
        </p>
      </Container>
    );
  }
  if (device.isError || !device.data) {
    return (
      <Container>
        {back}
        <p className="mt-4 text-sm text-danger" role="alert">
          {t("detail.notFound")}
        </p>
      </Container>
    );
  }

  const d: PlayerDeviceDetail = device.data;
  const dash = t("detail.none");
  const storage = d.storage
    ? `${fmtBytes(d.storage.freeBytes)} / ${fmtBytes(d.storage.totalBytes)}`
    : dash;

  const rows: Array<[string, string]> = [
    [t("detail.unit"), d.unitName ?? dash],
    [t("detail.platform"), d.platform],
    [t("detail.version"), d.installedVersion ?? dash],
    [
      t("detail.lastHeartbeat"),
      d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : t("status.never"),
    ],
    [t("detail.runtime"), d.runtimeState ?? dash],
    [t("detail.connectivity"), d.connectivity ?? dash],
    [t("detail.plan"), d.effectivePlanHash ?? dash],
    [t("detail.currentItem"), d.currentItemId ?? dash],
    [t("detail.storage"), storage],
    [t("detail.lastError"), d.lastError ?? dash],
    [
      t("detail.credential"),
      d.hasActiveCredential ? t("detail.hasCredential") : t("detail.noCredential"),
    ],
  ];

  const eventItems: PlayerPlaybackEventRecord[] = events.data?.items ?? [];

  return (
    <Container>
      {back}
      <div className="mt-2 flex items-center justify-between">
        <PageHeader title={d.name} description={t(`status.${d.status}`)} />
        <Button
          variant="secondary"
          size="sm"
          disabled={d.status === "decommissioned" || revoke.isPending}
          onClick={() => {
            if (window.confirm(t("detail.revokeConfirm"))) revoke.mutate();
          }}
        >
          {t("detail.revoke")}
        </Button>
      </div>

      <div className="mb-3 mt-2">
        <Badge variant={statusVariant(d.status)}>{t(`status.${d.status}`)}</Badge>
      </div>

      <dl className="grid max-w-2xl grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="break-all text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mb-3 mt-8 text-base font-semibold text-foreground">{t("detail.events")}</h2>
      {eventItems.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("detail.noEvents")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("detail.eventCol.asset")}</TableHead>
              <TableHead>{t("detail.eventCol.started")}</TableHead>
              <TableHead>{t("detail.eventCol.completion")}</TableHead>
              <TableHead>{t("detail.eventCol.received")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventItems.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs">{e.assetId.slice(0, 8)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(e.startedAt).toLocaleString()}
                </TableCell>
                <TableCell>{e.completionPct != null ? `${e.completionPct}%` : dash}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(e.receivedAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Container>
  );
};

/** Human-readable byte size (data formatting, not a hardcoded string). */
const fmtBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export default DeviceDetailPage;
