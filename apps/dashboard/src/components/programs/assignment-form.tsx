"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CreateAssignmentInput } from "@senvori/contracts";
import { SenvoriApiError } from "@senvori/sdk";
import type { AssignmentResultDto } from "@senvori/sdk";
import { Button, Label } from "@senvori/ui";
import { api } from "@/lib/api";

type ScopeType = "unit" | "brand" | "group";

/**
 * Assign a program to a scope (§14.4). The UI only offers scopes the user can
 * enumerate, but selection is never trusted — the API enforces RBAC/RLS and
 * rejects out-of-scope targets, and that 403/error is surfaced here.
 */
export const AssignmentForm = ({ programId }: { programId: string }) => {
  const t = useTranslations("programs.scope");
  const [scopeType, setScopeType] = useState<ScopeType>("unit");
  const [targetId, setTargetId] = useState("");

  const units = useQuery({
    queryKey: ["units", "for-assign"],
    queryFn: () => api.tenancy.units({ limit: 100 }),
    enabled: scopeType === "unit",
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });
  const brands = useQuery({
    queryKey: ["brands", "for-assign"],
    queryFn: () => api.tenancy.brands(),
    enabled: scopeType === "brand",
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });
  const groups = useQuery({
    queryKey: ["groups", "for-assign"],
    queryFn: () => api.tenancy.groups(),
    enabled: scopeType === "group",
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });

  const options: { id: string; name: string }[] =
    scopeType === "unit"
      ? (units.data?.items ?? [])
      : scopeType === "brand"
        ? (brands.data ?? [])
        : (groups.data ?? []);

  const mutation = useMutation<AssignmentResultDto, unknown, CreateAssignmentInput>({
    mutationFn: (input) => api.programming.createAssignment(programId, input),
  });

  const submit = () => {
    if (!targetId) return;
    mutation.mutate({ targetType: scopeType, targetId });
  };

  return (
    <form
      className="flex flex-wrap items-end gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="as-type">{t("targetType")}</Label>
        <select
          id="as-type"
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          value={scopeType}
          onChange={(e) => {
            setScopeType(e.target.value as ScopeType);
            setTargetId("");
          }}
        >
          <option value="unit">{t("types.unit")}</option>
          <option value="brand">{t("types.brand")}</option>
          <option value="group">{t("types.group")}</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="as-target">{t("target")}</Label>
        <select
          id="as-target"
          className="h-9 min-w-56 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          <option value="">{t("selectUnit")}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={!targetId || mutation.isPending}>
        {mutation.isPending ? t("assigning") : t("assign")}
      </Button>

      <div aria-live="polite" className="w-full">
        {mutation.isSuccess ? (
          <p className="text-sm text-success" role="status">
            {t("assigned")}
          </p>
        ) : mutation.isError ? (
          <p className="text-sm text-danger" role="alert">
            {t("error")}
          </p>
        ) : null}
      </div>
    </form>
  );
};
