import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  PageHeader,
} from "@senvori/ui";

const DashboardHome = () => {
  const t = useTranslations();

  return (
    <Container>
      <PageHeader title={t("dashboard.title")} description={t("dashboard.subtitle")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.foundation.title")}</CardTitle>
          <CardDescription>{t("dashboard.foundation.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("dashboard.foundation.docs")}</p>
        </CardContent>
      </Card>
    </Container>
  );
};

export default DashboardHome;
