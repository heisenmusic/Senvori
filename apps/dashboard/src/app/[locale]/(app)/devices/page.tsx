"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlayerActivationAdmin, PlayerDeviceSummary } from "@senvori/contracts";
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

const statusVariant = (s: string) =>
  s === "active" ? "success" : s === "decommissioned" ? "danger" : "neutral";

const DevicesPage = () => {
  const t = useTranslations("devices");
  const router = useRouter();
  const queryClient = useQueryClient();

  const devices = useQuery({
    queryKey: ["fleet", "devices"],
    queryFn: () => api.fleet.listDevices(),
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });

  const status401 = devices.error instanceof SenvoriApiError && devices.error.status === 401;
  const status403 = devices.error instanceof SenvoriApiError && devices.error.status === 403;
  useEffect(() => {
    if (status401) router.replace("/login");
  }, [status401, router]);

  const list: PlayerDeviceSummary[] = devices.data?.items ?? [];

  const renderBody = () => {
    if (devices.isPending || status401) {
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
    if (devices.isError) {
      return (
        <div className="flex flex-col items-start gap-3" role="alert">
          <p className="text-sm text-danger">{t("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => devices.refetch()}>
            {t("retry")}
          </Button>
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <p className="text-sm text-muted-foreground" role="status">
          {t("empty")}
        </p>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("col.name")}</TableHead>
            <TableHead>{t("col.unit")}</TableHead>
            <TableHead>{t("col.status")}</TableHead>
            <TableHead>{t("col.version")}</TableHead>
            <TableHead>{t("col.lastSeen")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((d) => (
            <TableRow
              key={d.id}
              className="cursor-pointer"
              onClick={() => router.push(`/devices/${d.id}`)}
            >
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {d.unitName ?? t("detail.none")}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant(d.status)}>{t(`status.${d.status}`)}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {d.installedVersion ?? t("detail.none")}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : t("status.never")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <Container>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div aria-live="polite" className="mb-8">
        {renderBody()}
      </div>
      <ActivationForm
        onPaired={() => queryClient.invalidateQueries({ queryKey: ["fleet", "devices"] })}
      />
    </Container>
  );
};

/** Operator pairing: code → look up → choose unit/zone → claim. */
const ActivationForm = ({ onPaired }: { onPaired: () => void }) => {
  const t = useTranslations("devices");
  const [code, setCode] = useState("");
  const [activation, setActivation] = useState<PlayerActivationAdmin | null>(null);
  const [unitId, setUnitId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const units = useQuery({
    queryKey: ["units", "all"],
    queryFn: () => api.tenancy.units({ limit: 100 }),
  });
  const zones = useQuery({
    queryKey: ["zones", unitId],
    queryFn: () => api.tenancy.zones(unitId),
    enabled: Boolean(unitId),
  });

  const lookup = useMutation({
    mutationFn: (c: string) => api.fleet.getActivation(c.trim().toUpperCase()),
    onSuccess: (a) => {
      setActivation(a);
      setMessage(null);
    },
    onError: () => {
      setActivation(null);
      setMessage(t("activate.notFound"));
    },
  });

  const claim = useMutation({
    mutationFn: () => api.fleet.claimActivation(code.trim().toUpperCase(), { zoneId }),
    onSuccess: () => {
      setMessage(t("activate.success"));
      setActivation(null);
      setCode("");
      setUnitId("");
      setZoneId("");
      onPaired();
    },
    onError: (e) => {
      setMessage(e instanceof SenvoriApiError ? e.problem.title : t("activate.notFound"));
    },
  });

  const inputClass =
    "h-9 w-64 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

  return (
    <section className="rounded-lg border border-border p-5" aria-labelledby="activate-title">
      <h2 id="activate-title" className="text-base font-semibold text-foreground">
        {t("activate.title")}
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{t("activate.hint")}</p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="code" className="text-sm font-medium text-foreground">
            {t("activate.codeLabel")}
          </label>
          <input
            id="code"
            className={inputClass}
            placeholder={t("activate.codePlaceholder")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!code.trim() || lookup.isPending}
          onClick={() => lookup.mutate(code)}
        >
          {lookup.isPending ? t("activate.looking") : t("activate.lookup")}
        </Button>
      </div>

      {activation ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <p className="w-full text-sm text-muted-foreground">
            {t("activate.codeStatus")} <span className="text-foreground">{activation.status}</span>
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="unit" className="text-sm font-medium text-foreground">
              {t("activate.unitLabel")}
            </label>
            <select
              id="unit"
              className={inputClass}
              value={unitId}
              onChange={(e) => {
                setUnitId(e.target.value);
                setZoneId("");
              }}
            >
              <option value="">{t("activate.chooseUnit")}</option>
              {(units.data?.items ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="zone" className="text-sm font-medium text-foreground">
              {t("activate.zoneLabel")}
            </label>
            <select
              id="zone"
              className={inputClass}
              value={zoneId}
              disabled={!unitId || zones.isPending}
              onChange={(e) => setZoneId(e.target.value)}
            >
              <option value="">{t("activate.chooseZone")}</option>
              {(zones.data ?? []).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" disabled={!zoneId || claim.isPending} onClick={() => claim.mutate()}>
            {claim.isPending ? t("activate.pairing") : t("activate.submit")}
          </Button>
        </div>
      ) : null}

      {message ? (
        <p className="mt-4 text-sm text-foreground" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
};

export default DevicesPage;
