import { useTranslations } from "next-intl";
import { Badge, Container, Stack } from "@senvori/ui";

const Home = () => {
  const t = useTranslations("site");

  return (
    <Container>
      <Stack className="min-h-svh items-start justify-center py-24" gap="lg">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="max-w-xl text-lg text-muted-foreground">{t("tagline")}</p>
        <Badge>{t("cta")}</Badge>
      </Stack>
    </Container>
  );
};

export default Home;
