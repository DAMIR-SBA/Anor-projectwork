"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { Dialog } from "@/components/ui/dialog";
import { AddressForm, type AddressData } from "@/components/checkout/address-form";
import { deleteAddressAction } from "@/server/actions/checkout";

export function AddressesView({ addresses, defaults }: { addresses: AddressData[]; defaults: { recipient: string | null; phone: string | null } }) {
  const t = useTranslations("addresses");
  const router = useRouter();
  const [editing, setEditing] = useState<AddressData | null | "new">(null);
  const [, start] = useTransition();
  return (
    <div className="space-y-3">
      <Button onClick={() => setEditing("new")} leftIcon={<Plus className="h-4 w-4" />}>
        {t("add")}
      </Button>
      {addresses.length === 0 && <EmptyState className="card" icon={<MapPin className="h-8 w-8" />} title={t("empty")} />}
      {addresses.map((a) => (
        <div key={a.id} className="card flex items-start gap-3 p-4">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold">
              {a.label || a.recipient} {a.isDefault && <Badge tone="success">{t("default")}</Badge>}
            </p>
            <p>
              {a.recipient}, {a.phone}
            </p>
            <p className="text-muted">
              {a.city}, {a.street} {a.house}
              {a.apartment ? `, ${a.apartment}` : ""}
            </p>
          </div>
          <button type="button" onClick={() => setEditing(a)} className="rounded-lg p-2 hover:bg-surface-3" aria-label={t("edit")}>
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => start(async () => void (await deleteAddressAction({ id: a.id }), router.refresh()))} className="rounded-lg p-2 text-danger hover:bg-danger/10" aria-label="delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? t("add") : t("edit")}>
        {editing !== null && (
          <AddressForm
            initial={editing === "new" ? null : editing}
            defaults={defaults}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
