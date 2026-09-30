"use client";

import Link from "next/link";
import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { logoutAndGoTo } from "@/lib/logout";

/**
 * One header button for the signed-in person: opens a small menu with
 * Change password and Log out. Replaces the two separate header buttons on the
 * staff and admin screens to save room.
 */
export default function AccountMenu({ loginPath }: { loginPath: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outlineLight" size="sm" className="gap-1.5">
          <UserRound className="h-4 w-4" strokeWidth={2} />
          <span className="hidden sm:inline">Account</span>
          <ChevronDown className="h-4 w-4" strokeWidth={2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuItem asChild>
          <Link href="/change-password" className="gap-2">
            <KeyRound className="h-4 w-4" /> Change password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logoutAndGoTo(loginPath)} className="gap-2 text-danger">
          <LogOut className="h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
