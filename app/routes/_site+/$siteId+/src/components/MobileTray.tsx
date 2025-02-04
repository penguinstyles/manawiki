import { Link } from "@remix-run/react";
import { Drawer } from "vaul";

import type { Site } from "~/db/payload-types";
import { LoggedIn, LoggedOut } from "~/routes/_auth+/src/components";

import { FollowingListMobile, PinnedList, PrimaryMenuLinks } from "./Menu";
import { ThemeToggleMobile } from "./UserMenu";

export const MobileTray = ({
   children,
   onOpenChange,
   open,
}: {
   children: any;
   onOpenChange: any;
   open: boolean;
}) => {
   return (
      <Drawer.Root onOpenChange={onOpenChange} open={open}>
         <Drawer.Overlay className="fixed inset-0 z-40 min-h-[100vh] bg-black/40" />
         <Drawer.Portal>
            <Drawer.Content className="bg-3 fixed bottom-0 left-0 right-0 z-50 mx-auto mt-24 flex h-[80%] max-w-[728px] flex-col rounded-t-xl pb-5">
               <div className="relative flex-1 rounded-t-xl p-4">
                  <div className="mx-auto mb-4 h-1.5 w-12 flex-shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  {children}
               </div>
            </Drawer.Content>
         </Drawer.Portal>
      </Drawer.Root>
   );
};

export const MenuTrayContent = ({
   site,
   onOpenChange,
}: {
   site: Site;
   onOpenChange: any;
}) => {
   return (
      <menu className="flex flex-col h-full">
         <div className="flex-grow">
            <PrimaryMenuLinks site={site} onOpenChange={onOpenChange} />
            <PinnedList site={site} onOpenChange={onOpenChange} />
         </div>
         <LoggedOut>
            <div
               className="shadow-1 bg-3-sub border-color-sub relative flex w-full items-center
                  justify-between gap-3 rounded-xl border py-2.5 pl-4 pr-3 shadow-sm"
            >
               <ThemeToggleMobile />
            </div>
         </LoggedOut>
      </menu>
   );
};

export const FollowingTrayContent = ({
   site,
   setFollowerMenuOpen,
}: {
   site: Site;
   setFollowerMenuOpen: any;
}) => {
   return (
      <>
         <menu className="flex h-full flex-col">
            <FollowingListMobile setMenuOpen={setFollowerMenuOpen} />
            <LoggedIn>
               <Link
                  reloadDocument={true}
                  className="mx-20 my-9 rounded-full bg-zinc-800 px-5 py-3
                   text-center text-sm font-bold text-white dark:bg-zinc-200 dark:text-zinc-700"
                  to="/"
               >
                  Explore
               </Link>
            </LoggedIn>
         </menu>
      </>
   );
};
