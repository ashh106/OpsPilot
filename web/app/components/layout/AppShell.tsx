import { signOut } from "@agent-native/core/client/sign-out";
import { useSession } from "@agent-native/core/client/use-session";
import { AgentToggleButton } from "@agent-native/toolkit/app/chat";
import {
  IconActivity,
  IconBook2,
  IconCalendarEvent,
  IconClipboardCheck,
  IconClock,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconMessages,
  IconScissors,
  IconSettings,
  IconUsers,
  IconCalendarCheck,
  type Icon,
} from "@tabler/icons-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  ready: boolean;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Business",
    items: [
      { to: "/", label: "Overview", icon: IconLayoutDashboard, ready: true },
      { to: "/appointments", label: "Appointments", icon: IconCalendarEvent, ready: true },
      { to: "/customers", label: "Customers", icon: IconUsers, ready: true },
      { to: "/services", label: "Services", icon: IconScissors, ready: true },
      { to: "/working-hours", label: "Working hours", icon: IconClock, ready: false },
    ],
  },
  {
    label: "AI assistant",
    items: [
      { to: "/conversations", label: "AI conversations", icon: IconMessages, ready: false },
      { to: "/knowledge-base", label: "Knowledge base", icon: IconBook2, ready: false },
      { to: "/approvals", label: "Approvals", icon: IconClipboardCheck, ready: false },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/activity", label: "Activity logs", icon: IconActivity, ready: false },
      { to: "/settings", label: "Settings", icon: IconSettings, ready: false },
    ],
  },
];

const ALL_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

function currentTitle(pathname: string): string {
  const match = ALL_ITEMS.find((item) =>
    item.to === "/" ? pathname === "/" : pathname.startsWith(item.to),
  );
  return match?.label ?? "OpsPilot";
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-3">
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <IconCalendarCheck className="size-4.5" aria-hidden />
      </div>
      <span className="text-[15px] font-semibold tracking-tight text-foreground">
        OpsPilot
      </span>
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {section.label}
          </p>
          {section.items.map((item) => {
            const Icon = item.icon;
            if (!item.ready) {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                    )
                  }
                >
                  <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Soon
                  </span>
                </NavLink>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function UserMenu() {
  const { session } = useSession();
  const email = session?.email ?? "";
  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Account menu"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
            {initial}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email || "Signed in"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <IconLogout className="size-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = currentTitle(pathname);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar-background md:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav />
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar-background p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b border-sidebar-border">
            <Brand />
          </div>
          <div className="overflow-y-auto px-3 py-4">
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <IconMenu2 className="size-5" aria-hidden />
          </Button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground md:text-[15px]">
            {title}
          </h2>
          <AgentToggleButton />
          <UserMenu />
        </header>

        <main className="agent-native-app-main min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
