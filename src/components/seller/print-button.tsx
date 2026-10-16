"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
      {label}
    </Button>
  );
}
