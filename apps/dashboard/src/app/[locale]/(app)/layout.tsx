"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@senvori/ui";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session) {
    return <div className="p-8 text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  const logout = async () => {
    await authClient.signOut();
    router.replace("/login");
  };

  const navItems = [
    { href: "/units", label: t("nav.units") },
    { href: "/library", label: t("nav.library") },
    { href: "/programs", label: t("nav.programs") },
    { href: "/scheduling", label: t("nav.scheduling") },
    { href: "/devices", label: t("nav.devices") },
  ];

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-60 flex-col border-e border-border bg-muted/40">
        <div className="px-5 py-5 text-lg font-semibold tracking-tight text-foreground">
          {t("common.appName")}
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-neutral-0"
                    : "rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4">
          <Button variant="secondary" size="sm" className="w-full" onClick={logout}>
            {t("nav.logout")}
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto">{children}</main>
    </div>
  );
};

export default AppLayout;
