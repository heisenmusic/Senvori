"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import type { ProgramType } from "@senvori/contracts";
import { SenvoriApiError } from "@senvori/sdk";
import { Button, Container, Input, Label, PageHeader } from "@senvori/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { ContentSelector, type SelectedItem } from "@/components/programs/content-selector";

const TOTAL_STEPS = 2;

const NewProgramPage = () => {
  const t = useTranslations("programs");
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ProgramType>("manual");
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);

  const goNext = () => {
    if (name.trim() === "") {
      setNameError(true);
      return;
    }
    setNameError(false);
    setStep(2);
  };

  const submit = async () => {
    if (name.trim() === "") {
      setStep(1);
      setNameError(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const program = await api.programming.createProgram({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
      });
      if (selected.length > 0) {
        await api.programming.setItems(program.id, { assetIds: selected.map((s) => s.assetId) });
      }
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
      router.replace(`/programs/${program.id}`);
    } catch (e) {
      if (e instanceof SenvoriApiError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(t("create.error"));
      setBusy(false);
    }
  };

  return (
    <Container>
      <PageHeader title={t("create.title")} description={t("create.subtitle")}>
        <p className="text-xs font-medium text-muted-foreground">
          {t("create.step", { n: step, total: TOTAL_STEPS })}
        </p>
      </PageHeader>

      {step === 1 ? (
        <form
          className="flex max-w-xl flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            goNext();
          }}
        >
          <h2 className="text-base font-semibold text-foreground">{t("create.identity.title")}</h2>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-name">{t("create.identity.name")}</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(false);
              }}
              placeholder={t("create.identity.namePlaceholder")}
              aria-describedby={nameError ? "np-name-error" : "np-name-hint"}
              aria-invalid={nameError || undefined}
              autoFocus
            />
            {nameError ? (
              <p id="np-name-error" className="text-sm text-danger" role="alert">
                {t("create.identity.nameRequired")}
              </p>
            ) : (
              <p id="np-name-hint" className="text-xs text-muted-foreground">
                {t("create.identity.nameHint")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-desc">{t("create.identity.description")}</Label>
            <textarea
              id="np-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("create.identity.descriptionPlaceholder")}
              rows={3}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-type">{t("create.identity.type")}</Label>
            <select
              id="np-type"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              value={type}
              onChange={(e) => setType(e.target.value as ProgramType)}
            >
              <option value="manual">{t("type.manual")}</option>
              <option value="smart">{t("type.smart")}</option>
            </select>
          </div>

          <div className="flex gap-2">
            <Button type="submit">{t("create.next")}</Button>
            <Button asChild variant="secondary" type="button">
              <Link href="/programs">{t("backToList")}</Link>
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t("create.content.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("create.content.subtitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("create.content.skipHint")}</p>
          </div>

          <ContentSelector selected={selected} onChange={setSelected} />

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy}>
              {busy ? t("create.creating") : t("create.submit")}
            </Button>
            <Button variant="secondary" onClick={() => setStep(1)} disabled={busy}>
              {t("create.back")}
            </Button>
          </div>
        </div>
      )}
    </Container>
  );
};

export default NewProgramPage;
