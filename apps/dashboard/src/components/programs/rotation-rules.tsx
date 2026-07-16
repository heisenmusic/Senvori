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

  // Seed the form from the loaded policy whenever we enter edit mode.
  useEffect(() => {
    if (editing && query.data) {
      setTrack(query.data.minTrackGapMinutes);
      setArtist(query.data.minArtistGapMinutes);
      setMaxPlays(query.data.maxPlaysPerDay?.toString() ?? "");
    }
  }, [editing, query.data]);

  const mutation = useMutation<RotationPolicyDto, unknown, void>({
    mutationFn: () =>
      api.programming.upsertRotationPolicy({
        minTrackGapMinutes: track,
        minArtistGapMinutes: artist,
        maxPlaysPerDay: maxPlays.trim() === "" ? null : Number(maxPlays),
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
        </dl>
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
