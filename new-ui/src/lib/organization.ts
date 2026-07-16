import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
};

export type OrganizationDetails = OrganizationSummary & {
  members?: unknown[];
  invitations?: unknown[];
};

export function useOrganizationState(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [activeOrganization, setActiveOrganization] = useState<OrganizationDetails | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loading = enabled ? !loaded : false;

  useEffect(() => {
    if (!enabled) {
      setOrganizations([]);
      setActiveOrganization(null);
      setLoaded(false);
      return;
    }

    let cancelled = false;

    async function load() {
      const [listResult, activeResult] = await Promise.all([
        authClient.organization.list().catch(() => ({ data: [] as OrganizationSummary[] })),
        authClient.organization
          .getFullOrganization()
          .catch(() => ({ data: null as OrganizationDetails | null })),
      ]);

      if (cancelled) return;
      setOrganizations((listResult.data ?? []) as OrganizationSummary[]);
      setActiveOrganization((activeResult.data ?? null) as OrganizationDetails | null);
      setLoaded(true);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { organizations, activeOrganization, loading };
}

export function buildOrganizationSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace"
  );
}

async function createOrganizationOnce(name: string, slug: string) {
  return authClient.organization.create({
    name,
    slug,
  });
}

export async function createOrganizationWithRetry(name: string, slug: string) {
  const first = await createOrganizationOnce(name, slug);
  if (!first.error) return first;

  const message = first.error.message?.toLowerCase() ?? "";
  if (!message.includes("already exists")) return first;

  const uniqueSlug = `${slug}-${crypto.randomUUID().slice(0, 8)}`;
  return createOrganizationOnce(name, uniqueSlug);
}
