"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RotationPolicyDto } from "@senvori/contracts";
import { SenvoriApiError } from "@senvori/sdk";
import { Button, Input, Label } from "@senvori/ui";
import { api } from "@/lib/api";

/**
 * Rotation rules editor. The policy is tenant-wide (one per account), so the
 * copy makes clear these rules apply to every program — no false impression of
 * a per-program setting. Read is open to viewers; edit requires the update
 * permission (the API is the authority — a 403 is shown, not hidden).
 */
export const RotationRules = () => {
  const t = useTranslations("programs.rules");
  const ts = useTranslations("programs.states");
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["rotation-policy"],
    queryFn: () => api.programming.getRotationPolicy(),
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });

  const [editing, setEditing] = useState(false);
  const [track, setTrack] = useState(0);
  const [artist, setArtist] = useState(0);
  const [maxPlays, setMaxPlays] = useState<string>("");
  const [categoryGap, setCategoryGap] = useState(0);
  const [fatigue, setFatigue] = useState(0);
  const [affinity, setAffinity] = useState(0);
  const [lookback, setLookback] = useState(7);
  const [continuity, setContinuity] = useState(true);

  // Seed the form from the loaded policy whenever we enter edit mode.
  useEffect(() => {
    if (editing && query.data) {
      setTrack(query.data.minTrackGapMinutes);
      setArtist(query.data.minArtistGapMinutes);
      setMaxPlays(query.data.maxPlaysPerDay?.toString() ?? "");
      setCategoryGap(query.data.minCategoryGapMinutes ?? 0);
      setFatigue(query.data.fatigueWeightPenalty ?? 0);
      setAffinity(query.data.affinityStrength ?? 0);
      setLookback(query.data.historyLookbackDays ?? 7);
      setContinuity(query.data.crossDayContinuity ?? true);
    }
  }, [editing, query.data]);

  const mutation = useMutation<RotationPolicyDto, unknown, void>({
    mutationFn: () =>
      api.programming.upsertRotationPolicy({
        minTrackGapMinutes: track,
        minArtistGapMinutes: artist,
        maxPlaysPerDay: maxPlays.trim() === "" ? null : Number(maxPlays),
        // 0 ⇒ layer off; sent as null so the policy stores "disabled" cleanly.
        minCategoryGapMinutes: categoryGap > 0 ? categoryGap : null,
        fatigueWeightPenalty: fatigue > 0 ? fatigue : null,
        affinityStrength: affinity > 0 ? affinity : null,
        historyLookbackDays: lookback,
        crossDayContinuity: continuity,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["rotation-policy"], data);
      setEditing(false);
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

  const policy = query.data;

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">{t("trackGap")}</dt>
            <dd className="text-sm font-medium text-foreground">
              {policy.minTrackGapMinutes} {t("minutes")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("artistGap")}</dt>
            <dd className="text-sm font-medium text-foreground">
              {policy.minArtistGapMinutes} {t("minutes")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("maxPlays")}</dt>
            <dd className="text-sm font-medium text-foreground">{policy.maxPlaysPerDay ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("categoryGap")}</dt>
            <dd className="text-sm font-medium text-foreground">
              {policy.minCategoryGapMinutes
                ? `${policy.minCategoryGapMinutes} ${t("minutes")}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("fatigue")}</dt>
            <dd className="text-sm font-medium text-foreground">
              {policy.fatigueWeightPenalty ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("affinity")}</dt>
            <dd className="text-sm font-medium text-foreground">
              {policy.affinityStrength ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("lookback")}</dt>
            <dd className="text-sm font-medium text-foreground">
              {policy.historyLookbackDays ?? 7} {t("days")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("continuity")}</dt>
            <dd className="text-sm font-medium text-foreground">
              {(policy.crossDayContinuity ?? true) ? t("on") : t("off")}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">{t("historyNote")}</p>
        <div>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {t("edit")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rr-track">{t("trackGap")}</Label>
          <Input
            id="rr-track"
            type="number"
            min={0}
            max={1440}
            value={track}
            onChange={(e) => setTrack(Number(e.target.value))}
            aria-describedby="rr-track-hint"
          />
          <p id="rr-track-hint" className="text-xs text-muted-foreground">
            {t("trackGapHint")}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rr-artist">{t("artistGap")}</Label>
          <Input
            id="rr-artist"
            type="number"
            min={0}
            max={1440}
            value={artist}
            onChange={(e) => setArtist(Number(e.target.value))}
            aria-describedby="rr-artist-hint"
          />
          <p id="rr-artist-hint" className="text-xs text-muted-foreground">
            {t("artistGapHint")}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rr-max">{t("maxPlays")}</Label>
          <Input
            id="rr-max"
            type="number"
            min={1}
            max={10000}
            value={maxPlays}
            onChange={(e) => setMaxPlays(e.target.value)}
            aria-describedby="rr-max-hint"
          />
          <p id="rr-max-hint" className="text-xs text-muted-foreground">
            {t("maxPlaysHint")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rr-category">{t("categoryGap")}</Label>
          <Input
            id="rr-category"
            type="number"
            min={0}
            max={1440}
            value={categoryGap}
            onChange={(e) => setCategoryGap(Number(e.target.value))}
            aria-describedby="rr-category-hint"
          />
          <p id="rr-category-hint" className="text-xs text-muted-foreground">
            {t("categoryGapHint")}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rr-fatigue">{t("fatigue")}</Label>
          <Input
            id="rr-fatigue"
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={fatigue}
            onChange={(e) => setFatigue(Number(e.target.value))}
            aria-describedby="rr-fatigue-hint"
          />
          <p id="rr-fatigue-hint" className="text-xs text-muted-foreground">
            {t("fatigueHint")}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rr-affinity">{t("affinity")}</Label>
          <Input
            id="rr-affinity"
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={affinity}
            onChange={(e) => setAffinity(Number(e.target.value))}
            aria-describedby="rr-affinity-hint"
          />
          <p id="rr-affinity-hint" className="text-xs text-muted-foreground">
            {t("affinityHint")}
          </p>
        </div>
      </div>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("memory")}</legend>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rr-lookback">{t("lookback")}</Label>
          <Input
            id="rr-lookback"
            type="number"
            min={0}
            max={90}
            value={lookback}
            onChange={(e) => setLookback(Number(e.target.value))}
            aria-describedby="rr-lookback-hint"
          />
          <p id="rr-lookback-hint" className="text-xs text-muted-foreground">
            {t("lookbackHint")}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rr-continuity">{t("continuity")}</Label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              id="rr-continuity"
              type="checkbox"
              checked={continuity}
              onChange={(e) => setContinuity(e.target.checked)}
              aria-describedby="rr-continuity-hint"
            />
            {continuity ? t("on") : t("off")}
          </label>
          <p id="rr-continuity-hint" className="text-xs text-muted-foreground">
            {t("continuityHint")}
          </p>
        </div>
      </fieldset>

      {mutation.isError ? (
        <p className="text-sm text-danger" role="alert">
          {t("error")}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t("save") + "…" : t("save")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setEditing(false)}
          disabled={mutation.isPending}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
};
