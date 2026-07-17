"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProgramDto } from "@senvori/contracts";
import { SenvoriApiError } from "@senvori/sdk";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  Input,
  Label,
  PageHeader,
} from "@senvori/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { formatDateTime, programStatusVariant } from "@/lib/programs";
import { AssignmentForm } from "@/components/programs/assignment-form";
import { ContentEditor } from "@/components/programs/content-editor";
import { PreviewPanel } from "@/components/programs/preview-panel";
import { PublishDialog } from "@/components/programs/publish-dialog";
import { RotationRules } from "@/components/programs/rotation-rules";
import { RotationPairs } from "@/components/programs/rotation-pairs";
import { VersionsList } from "@/components/programs/versions-list";

const Section = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      {description ? <CardDescription>{description}</CardDescription> : null}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const ProgramDetailPage = () => {
  const t = useTranslations("programs");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["program", id],
    queryFn: () => api.programming.getProgram(id),
    retry: (count, error) => !(error instanceof SenvoriApiError) && count < 2,
  });

  const [showPublish, setShowPublish] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [publishedInfo, setPublishedInfo] = useState<number | null>(null);

  const status401 = query.error instanceof SenvoriApiError && query.error.status === 401;
  const status403 = query.error instanceof SenvoriApiError && query.error.status === 403;
  const status404 = query.error instanceof SenvoriApiError && query.error.status === 404;

  const updateMutation = useMutation<ProgramDto, unknown, void>({
    mutationFn: () =>
      api.programming.updateProgram(id, {
        name: name.trim(),
        description: description.trim() === "" ? null : description.trim(),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["program", id], data);
      setEditingName(false);
    },
  });

  const archiveMutation = useMutation<void, unknown, void>({
    mutationFn: () => api.programming.archiveProgram(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["program", id] });
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
      setConfirmArchive(false);
    },
  });

  if (status401) {
    router.replace("/login");
    return null;
  }

  if (query.isPending) {
    return (
      <Container>
        <p className="pt-10 text-sm text-muted-foreground" role="status">
          {t("states.loading")}
        </p>
      </Container>
    );
  }

  if (status403) {
    return (
      <Container>
        <PageHeader title={t("title")} />
        <p className="text-sm text-muted-foreground" role="status">
          {t("states.noPermission")}
        </p>
      </Container>
    );
  }

  if (status404) {
    return (
      <Container>
        <PageHeader title={t("title")} />
        <div className="flex flex-col items-start gap-3" role="status">
          <p className="text-sm text-muted-foreground">{t("states.notFound")}</p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/programs">{t("backToList")}</Link>
          </Button>
        </div>
      </Container>
    );
  }

  if (query.isError) {
    return (
      <Container>
        <PageHeader title={t("title")} />
        <div className="flex flex-col items-start gap-3" role="alert">
          <p className="text-sm text-danger">{t("states.error")}</p>
          <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
            {t("states.retry")}
          </Button>
        </div>
      </Container>
    );
  }

  const program = query.data;
  const editable = program.status !== "archived";

  const beginEditName = () => {
    setName(program.name);
    setDescription(program.description ?? "");
    setEditingName(true);
  };

  return (
    <Container>
      <div className="pt-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/programs">{t("backToList")}</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 pb-6 pt-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {program.name}
            </h1>
            <Badge variant={programStatusVariant(program.status)}>
              {t(`status.${program.status}`)}
            </Badge>
          </div>
          {program.description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{program.description}</p>
          ) : null}
          <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <div className="flex gap-1.5">
              <dt className="font-medium">{t("detail.updatedAt")}</dt>
              <dd>{formatDateTime(program.updatedAt, locale)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-medium">{t("list.col.content")}</dt>
              <dd>{t("count.items", { count: program.itemCount })}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-medium">{t("detail.publishedVersion")}</dt>
              <dd>
                {program.publishedVersion
                  ? t("count.version", { n: program.publishedVersion })
                  : t("detail.notPublished")}
              </dd>
            </div>
          </dl>
        </div>

        {editable ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={beginEditName}>
              {t("detail.editName")}
            </Button>
            <Button size="sm" onClick={() => setShowPublish(true)}>
              {t("publish.action")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(true)}>
              {t("detail.archive")}
            </Button>
          </div>
        ) : null}
      </div>

      {!editable ? (
        <div
          className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
          role="status"
        >
          {t("detail.archived")}
        </div>
      ) : null}

      {publishedInfo !== null ? (
        <div className="mb-4 rounded-md border border-success/40 bg-success/10 p-4" role="status">
          <p className="text-sm font-semibold text-foreground">{t("publish.successTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("publish.successBody", { n: publishedInfo })}
          </p>
        </div>
      ) : null}

      {editingName ? (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ed-name">{t("create.identity.name")}</Label>
                <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ed-desc">{t("create.identity.description")}</Label>
                <textarea
                  id="ed-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                />
              </div>
              {updateMutation.isError ? (
                <p className="text-sm text-danger" role="alert">
                  {t("states.error")}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={updateMutation.isPending || name.trim() === ""}>
                  {updateMutation.isPending ? t("states.saving") : t("detail.edit")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingName(false)}
                  disabled={updateMutation.isPending}
                >
                  {t("content.cancel")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {confirmArchive ? (
        <div className="mb-4 rounded-md border border-border bg-muted/40 p-4" role="alertdialog">
          <p className="text-sm text-foreground">{t("detail.archiveConfirm")}</p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
            >
              {t("detail.archive")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmArchive(false)}
              disabled={archiveMutation.isPending}
            >
              {t("content.cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 pb-16">
        <Section title={t("detail.sections.preview")} description={t("preview.subtitle")}>
          <PreviewPanel programId={program.id} />
        </Section>

        <Section title={t("detail.sections.content")} description={t("content.subtitle")}>
          <ContentEditor
            program={program}
            editable={editable}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["program", id] })}
          />
        </Section>

        <Section title={t("detail.sections.rules")} description={t("rules.subtitle")}>
          <RotationRules />
        </Section>

        <Section title={t("detail.sections.pairs")} description={t("pairs.subtitle")}>
          <RotationPairs programId={program.id} />
        </Section>

        <Section title={t("detail.sections.scope")} description={t("scope.subtitle")}>
          <AssignmentForm programId={program.id} />
        </Section>

        <Section title={t("detail.sections.versions")} description={t("versions.subtitle")}>
          <VersionsList programId={program.id} />
        </Section>
      </div>

      {showPublish ? (
        <PublishDialog
          program={program}
          onClose={() => setShowPublish(false)}
          onPublished={(version) => {
            setShowPublish(false);
            setPublishedInfo(version.version);
            queryClient.invalidateQueries({ queryKey: ["program", id] });
            queryClient.invalidateQueries({ queryKey: ["program-versions", id] });
            queryClient.invalidateQueries({ queryKey: ["programs"] });
          }}
        />
      ) : null}
    </Container>
  );
};

export default ProgramDetailPage;
