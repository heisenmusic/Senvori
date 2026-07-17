"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProgramItemDto, RotationPairDto } from "@senvori/contracts";
import { SenvoriApiError } from "@senvori/sdk";
import {
  Badge,
  Button,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@senvori/ui";
import { api } from "@/lib/api";

/**
 * Recurring-pair avoidance editor (Sprint 07B · §11.5). Pairs are tenant-wide;
 * the track pickers are populated from THIS program's content (the tracks an
 * operator actually schedules together). Read is open to viewers; managing
 * requires the manage permission (the API is the authority — a 403 is shown).
 */
export const RotationPairs = ({ programId }: { programId: string }) => {
  const t = useTranslations("programs.pairs");
  const ts = useTranslations("programs.states");
  const queryClient = useQueryClient();

  const pairs = useQuery({
    queryKey: ["rotation-pairs"],
    queryFn: () => api.programming.listRotationPairs(),
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });
  const items = useQuery({
    queryKey: ["program-items", programId],
    queryFn: () => api.programming.listItems(programId),
  });

  const [assetA, setAssetA] = useState("");
  const [assetB, setAssetB] = useState("");
  const [gap, setGap] = useState(60);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rotation-pairs"] });

  const create = useMutation<RotationPairDto, unknown, void>({
    mutationFn: () =>
      api.programming.createRotationPair({ assetA, assetB, minGapMinutes: gap, active: true }),
    onSuccess: () => {
      setAssetA("");
      setAssetB("");
      invalidate();
    },
  });
  const toggle = useMutation<RotationPairDto, unknown, { id: string; active: boolean }>({
    mutationFn: ({ id, active }) => api.programming.updateRotationPair(id, { active }),
    onSuccess: invalidate,
  });
  const remove = useMutation<void, unknown, string>({
    mutationFn: (id) => api.programming.deleteRotationPair(id),
    onSuccess: invalidate,
  });

  if (pairs.isPending) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {ts("loading")}
      </p>
    );
  }
  if (pairs.isError) {
    return (
      <div className="flex flex-col items-start gap-2" role="alert">
        <p className="text-sm text-danger">{t("error")}</p>
        <Button variant="secondary" size="sm" onClick={() => pairs.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  const options: ProgramItemDto[] = items.data ?? [];
  const canAdd = assetA !== "" && assetB !== "" && assetA !== assetB;
  const rows = pairs.data.items;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("subtitle")}</p>

      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdd) create.mutate();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pair-a">{t("trackA")}</Label>
          <select
            id="pair-a"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={assetA}
            onChange={(e) => setAssetA(e.target.value)}
          >
            <option value="">{t("choose")}</option>
            {options.map((o) => (
              <option key={o.assetId} value={o.assetId}>
                {o.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pair-b">{t("trackB")}</Label>
          <select
            id="pair-b"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={assetB}
            onChange={(e) => setAssetB(e.target.value)}
          >
            <option value="">{t("choose")}</option>
            {options.map((o) => (
              <option key={o.assetId} value={o.assetId}>
                {o.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pair-gap">{t("gap")}</Label>
          <Input
            id="pair-gap"
            type="number"
            min={1}
            max={1440}
            value={gap}
            onChange={(e) => setGap(Number(e.target.value))}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={!canAdd || create.isPending}>
            {create.isPending ? t("add") + "…" : t("add")}
          </Button>
        </div>
      </form>

      {create.isError ? (
        <p className="text-sm text-danger" role="alert">
          {t("addError")}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("trackA")}</TableHead>
              <TableHead>{t("trackB")}</TableHead>
              <TableHead>{t("gap")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-foreground">{p.assetATitle ?? p.assetA}</TableCell>
                <TableCell className="text-foreground">{p.assetBTitle ?? p.assetB}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.minGapMinutes} {t("minutes")}
                </TableCell>
                <TableCell>
                  <Badge variant={p.active ? "default" : "outline"}>
                    {p.active ? t("active") : t("inactive")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => toggle.mutate({ id: p.id, active: !p.active })}
                    >
                      {p.active ? t("disable") : t("enable")}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => remove.mutate(p.id)}>
                      {t("remove")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};
